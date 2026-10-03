// Puts the parts together: reads the configuration, reads the history (from git or from a saved log), works out the
// numbers of every file and folder, runs the rules and builds the report. This is the only place that knows every part.
// An input that cannot be read stops the run with an InputError that names every problem; there is then no verdict.

import { ConfigError, readConfig } from './config.js';
import { FILE_LIMITS, checkRepository, readConfigFile, readNamedFile } from './files.js';
import { GIT_LIMITS, GitError, readGitHistory } from './git.js';
import { LOG_LIMITS, LogError, readLog } from './log.js';
import { analyze, byText, daysBefore, holders, rankAuthors } from './metrics.js';
import { decide, evaluate, ruleById } from './rules.js';
import { FACTS, factPage } from './data.js';
import { percentText, thresholdText } from './ratio.js';
import { plural } from './size.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, ...GIT_LIMITS, ...LOG_LIMITS };

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

const cleanPath = (p) => safeText(p, 300);

// The numbers of one unit as the report shows them.
function view(unit, people, newest, cover) {
  const ranked = rankAuthors(unit, people);
  const h = cover && unit.lines > 0 ? holders(ranked, unit.lines, cover.scaled) : null;
  return {
    path: cleanPath(unit.path),
    kind: unit.kind,
    lines: unit.lines,
    added: unit.added,
    deleted: unit.deleted,
    commits: unit.commits,
    binaryChanges: unit.binary,
    authors: ranked.length,
    top: ranked.length && unit.lines > 0 ? { author: ranked[0].label, lines: ranked[0].lines, share: percentText(ranked[0].lines, unit.lines) } : null,
    holders: h ? { count: h.count, authors: h.authors.map((a) => a.label), coverShare: thresholdText(cover.scaled) } : null,
    lastChangeDays: unit.last === null ? null : daysBefore(newest, unit.last),
    byAuthor: ranked.map((a) => ({ author: a.label, lines: a.lines, share: unit.lines ? percentText(a.lines, unit.lines) : 'n/a', commits: a.commits, lastChangeDays: daysBefore(newest, a.last) }))
  };
}

// Builds the report from a configuration in normal form and the commits of a log. input says where the history came from.
export function buildReport(config, commits, input, { version = '', showEmails = false, configFile = 'config', notUtf8 = false } = {}) {
  const a = analyze(commits, config);
  const holdersRule = config.rules.find((r) => r.id === 'holders');
  const cover = holdersRule ? holdersRule.coverShare : null;
  const sortUnits = (map) => [...map.values()].sort((x, y) => byText(x.path, y.path));
  const files = sortUnits(a.files);
  const folders = sortUnits(a.folders);
  const units = [...folders, ...files].map((unit) => ({ unit, ranked: rankAuthors(unit, a.people) }));
  const found = evaluate(units, config);
  const views = new Map([...folders, ...files].map((u) => [u, view(u, a.people, a.newest, cover)]));

  const authors = [...a.people.values()]
    .sort((x, y) => y.lines - x.lines || byText(x.label, y.label))
    .map((p) => ({ author: p.label, lines: p.lines, commits: p.commits, ...(showEmails ? { emails: [...p.emails].sort(byText).map((e) => safeText(e, 120)) } : {}) }));

  const findings = found.map((f) => {
    const v = views.get(f.unit);
    return { rule: f.rule, level: f.level, kind: f.kind, path: v.path, ruleText: f.ruleText, found: f.found, why: f.why, lines: v.lines, authors: v.authors, commits: v.commits, lastChangeDays: v.lastChangeDays, byAuthor: v.byAuthor, basis: ruleById(f.rule).basis.map((k) => ({ ...FACTS[k], page: factPage(k) })) };
  });

  const notes = [];
  const c = a.counts;
  if (c.outside) notes.push(`${plural(c.outside, 'commit')} of the log ${c.outside === 1 ? 'is' : 'are'} older than the window and ${c.outside === 1 ? 'was' : 'were'} not counted`);
  if (c.excluded) notes.push(`${plural(c.excluded, 'commit')} by authors that authors.exclude names ${c.excluded === 1 ? 'was' : 'were'} not counted`);
  if (c.ignoredChanges) notes.push(`${plural(c.ignoredChanges, 'file change')} in ${plural(c.ignoredPaths, 'path')} that ignore names ${c.ignoredChanges === 1 ? 'was' : 'were'} not counted`);
  if (c.binary) notes.push(`${plural(c.binary, 'change')} to binary files ${c.binary === 1 ? 'counts' : 'count'} as a commit with no changed lines`);
  if (c.renames) notes.push(`${plural(c.renames, 'rename')} ${c.renames === 1 ? 'was' : 'were'} followed: older changes count on the newer path`);
  if (notUtf8) notes.push('the log holds bytes that are not UTF-8; they are shown as the replacement character');
  if (c.inWindow === 0) notes.push('no commit in the window is by an author that is counted; there is nothing to check');

  const repo = view(a.repository, a.people, a.newest, cover);
  const verdict = decide(found, config.failOn);
  return {
    tool: 'bus-factor-check',
    version,
    config: {
      file: configFile,
      name: config.name,
      windowDays: config.days,
      folderDepth: config.depth,
      failOn: config.failOn,
      ignore: config.ignore,
      aliases: config.aliases.length,
      excludedAuthorPatterns: config.exclude.length,
      rules: config.rules.map((r) => ({ id: r.id, level: r.level, appliesTo: r.appliesTo, minLines: r.minLines, rule: ruleById(r.id).rule(r) }))
    },
    input,
    window: { days: config.days, commitsRead: c.read, commitsCounted: c.inWindow, commitsOutside: c.outside, commitsExcluded: c.excluded },
    totals: { authors: a.people.size, lines: a.repository.lines, files: files.length, folders: folders.length },
    repository: { lines: repo.lines, authors: repo.authors, top: repo.top, holders: repo.holders },
    authors,
    showEmails,
    findings,
    folders: folders.map((u) => views.get(u)),
    files: files.map((u) => views.get(u)),
    verdict,
    notes
  };
}

// Reads the paths and gives the report. o: { config, repo, log, base, version, showEmails, failOn, limits, run }.
export async function checkPaths(o) {
  const base = o.base ?? process.cwd();
  const limits = { ...LIMITS, ...(o.limits ?? {}) };
  const problems = [];
  let config = null;
  let configFile = o.config;
  try {
    const read = await readConfigFile(o.config, base, limits.maxConfigBytes);
    configFile = read.file;
    config = readConfig(read.text, read.file);
  } catch (error) {
    if (error instanceof ConfigError) problems.push(...error.problems.map((p) => p.text));
    else problems.push(error.message);
  }
  let input = null;
  let buffer = null;
  if (o.repo) {
    try {
      const repo = await checkRepository(o.repo, base);
      input = { kind: 'git', path: repo.shown };
      if (config) buffer = (await readGitHistory(repo.full, config.days, { run: o.run, limits })).buffer;
    } catch (error) {
      problems.push(error instanceof GitError ? `${input ? input.path : o.repo}: ${error.message}` : error.message);
    }
  } else {
    try {
      const read = await readNamedFile(o.log, base, limits.maxLogBytes);
      input = { kind: 'log', path: read.file };
      buffer = read.buffer;
    } catch (error) {
      problems.push(error.message);
    }
  }
  let log = null;
  if (buffer) {
    try {
      log = readLog(buffer, limits);
      input.form = log.form;
    } catch (error) {
      if (error instanceof LogError) problems.push(`${input.path}: ${error.message}`);
      else throw error;
    }
  }
  if (problems.length) throw new InputError(problems.map((p) => safeText(p, 1500)));
  if (o.failOn) config.failOn = o.failOn;
  return buildReport(config, log.commits, input, { version: o.version, showEmails: Boolean(o.showEmails), configFile, notUtf8: log.notUtf8 });
}
