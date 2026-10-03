import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InputError, USAGE, VERSION, buildReport, checkPaths, mdCell, parseArgs, readConfig, readLog, toJson, toMarkdown, toText } from '../src/index.js';
import { ARGS, BASE_CONFIG, cli, configText, dayTime, filesWith, plainCommit, runFiles, withFiles } from './helpers.js';

// The command line, the three reports and the exit codes.

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// A history with one concentrated folder (api: Ann only) and one shared folder (ui: Ann and Bo).
const LOG = [
  plainCommit({ n: 3, time: dayTime(10), email: 'bo@example.com', name: 'Bo Ek', entries: ['10\t0\tui/b.js'] }),
  plainCommit({ n: 2, time: dayTime(9), entries: ['40\t2\tapi/a.js', '8\t0\tui/b.js'] }),
  plainCommit({ n: 1, time: dayTime(1), entries: ['5\t0\tapi/c.js'] })
].join('');
const CONFIG = { name: 'Shop', window: { days: 30 }, rules: { concentration: { minTopShare: 80, maxOtherAuthors: 0, level: 'error' } } };

test('cli: --help and --version exit 0 and print the usage and the version', async () => {
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--config', '--repo', '--log', '--format', '--explain', '--show-emails', '--fail-on', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.ok(USAGE.includes('concentration (rules.concentration), holders (rules.holders)'));
  const version = await cli(['-v']);
  assert.equal(version.code, 0);
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('cli: a usage error exits 2 with the reason and the usage on standard error, and nothing on standard output', async () => {
  for (const [argv, pattern] of [
    [[], /give the configuration file with --config/],
    [['--config', 'c.json'], /give the repository with --repo <folder> or a saved log with --log <file>/],
    [['--config', 'c.json', '--repo', 'a', '--log', 'b'], /give --repo or --log, not both/],
    [['--config', 'c.json', '--config', 'd.json'], /--config was given twice/],
    [['--config'], /--config needs a value/],
    [['--config', '--explain'], /--config needs a value/],
    [['--config', '-'], /reading from standard input is not supported/],
    [['-'], /reading from standard input is not supported/],
    [['--strict'], /unknown argument --strict/],
    [['repo'], /unexpected argument repo; give the repository with --repo repo/],
    [['--config', 'c.json', '--repo', 'https://example.test/r.git'], /give a local path; the tool never fetches a URL/],
    [['--config', 'c.json', '--log', 'l', '--format', 'html'], /unknown format html \(text, markdown or json\)/],
    [['--config', 'c.json', '--log', 'l', '--fail-on', 'fatal'], /unknown level fatal \(notice, warning, error\)/],
    [['--config', 'c.json', '--log', 'l', '--fail-on', 'error', '--fail-on', 'notice'], /--fail-on was given twice/]
  ]) {
    const r = await cli(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, pattern);
    assert.ok(r.err.includes('Usage: bus-factor-check'));
    assert.equal(r.out, '');
  }
});

test('cli: parseArgs reads every option', () => {
  const o = parseArgs(['--config', 'c', '--log', 'l', '--format', 'json', '--explain', '--show-emails', '--fail-on', 'notice']);
  assert.deepEqual(o, { config: 'c', repo: null, log: 'l', format: 'json', explain: true, showEmails: true, failOn: 'notice', help: false, version: false });
  assert.equal(parseArgs(['--config', 'c', '--repo', 'r']).repo, 'r');
});

test('cli: no finding at the fail level exits 0; a finding at it exits 1; --fail-on overrides failOn of the configuration', async () => {
  const fail = await runFiles(filesWith(LOG, CONFIG), ARGS);
  assert.equal(fail.code, 1, fail.err);
  assert.match(fail.out, /ERROR {4}concentration {2}folder {2}api\n/);
  assert.match(fail.out, /RESULT: FAIL - 1 finding at or above warning\n$/);
  const pass = await runFiles(filesWith(LOG, { ...CONFIG, rules: { concentration: { ...CONFIG.rules.concentration, level: 'notice' } } }), ARGS);
  assert.equal(pass.code, 0);
  assert.match(pass.out, /RESULT: PASS - no finding at or above warning \(1 finding below it\)\n$/);
  const notice = await runFiles(filesWith(LOG, { ...CONFIG, rules: { concentration: { ...CONFIG.rules.concentration, level: 'notice' } } }), [...ARGS, '--fail-on', 'notice']);
  assert.equal(notice.code, 1);
  const none = await runFiles(filesWith(LOG, { ...CONFIG, rules: { concentration: { minTopShare: 100, maxOtherAuthors: 0, minLines: 1000 } } }), ARGS);
  assert.equal(none.code, 0);
  assert.match(none.out, /Findings \(0\)\n\n {2}none\n/);
});

test('text: the header lines, the findings with the last change, the folders and the authors, and no address by default', async () => {
  const r = await runFiles(filesWith(LOG, CONFIG), ARGS);
  const out = r.out;
  assert.ok(out.startsWith('bus-factor-check: config.json (Shop)\nhistory: history.log (saved git log, readable form); 3 commits read\n'));
  assert.ok(out.includes('window: 30 days up to the newest commit; 3 commits counted\n'));
  assert.ok(out.includes('changes: 2 authors; 65 changed lines in 3 files and 2 folders to depth 2\n'));
  assert.ok(out.includes('repository: top author Ann Lee with 84.61% of the changed lines\n'));
  assert.ok(out.includes('rules: concentration (error, folders, at least 1 changed line)\n'));
  assert.ok(out.includes('findings: 1 (1 error); fail level warning\n'));
  assert.ok(out.includes('           Ann Lee made 100% of 47 changed lines; no other author\n           last change 1 day before the newest commit\n'));
  assert.ok(out.includes('  FOLDER  LINES  AUTHORS  TOP AUTHOR  TOP SHARE  LAST CHANGE\n  api     47     1        Ann Lee     100%       1 day\n  ui      18     2        Bo Ek       55.55%     0 days\n'));
  assert.ok(out.includes('Authors (2)\n\n  Ann Lee  55 lines  2 commits\n  Bo Ek    10 lines  1 commit\n'));
  assert.ok(!out.includes('@example.com'), 'no address without --show-emails');
  assert.ok(!out.includes('Files ('), 'the files are listed with --explain only');
});

test('--show-emails: the addresses appear in every format; without it, in none', async () => {
  for (const format of ['text', 'markdown', 'json']) {
    const hidden = await runFiles(filesWith(LOG, CONFIG), [...ARGS, '--format', format, '--explain']);
    assert.ok(!hidden.out.includes('@example.com'), format);
    const shown = await runFiles(filesWith(LOG, CONFIG), [...ARGS, '--format', format, '--show-emails']);
    assert.ok(shown.out.includes('ann@example.com') && shown.out.includes('bo@example.com'), format);
  }
});

test('--explain: the rule, why, every author of the unit and the sentence of the saved page; the files with their numbers', async () => {
  const r = await runFiles(filesWith(LOG, CONFIG), [...ARGS, '--explain']);
  assert.ok(r.out.includes('           rule: the top author made at least 80% of the changed lines and at most 0 other authors changed the unit\n'));
  assert.ok(r.out.includes('           why: 100% is at least 80%, and 0 is at most 0\n'));
  assert.ok(r.out.includes('           - Ann Lee  47 lines  (100%)  2 commits  last change 1 day before\n'));
  assert.ok(r.out.includes('basis: "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." (Abstract, https://arxiv.org/abs/1604.06766)'));
  assert.ok(r.out.includes('Files (3)\n\n  FILE      LINES  AUTHORS  TOP AUTHOR  TOP SHARE  LAST CHANGE\n  api/a.js  42     1        Ann Lee     100%       1 day\n  api/c.js  5      1        Ann Lee     100%       9 days\n'));
});

test('markdown: a heading with the verdict, the findings and folders as tables, and text from the history escaped', async () => {
  const log = plainCommit({ n: 1, time: dayTime(5), name: 'A|B <img src=x> *[x](y)*', entries: ['5\t0\tsr|c/a_b.js', '3\t0\tsr|c/[x].js'] });
  const r = await runFiles(filesWith(log, CONFIG), [...ARGS, '--format', 'markdown', '--explain']);
  assert.equal(r.code, 1);
  assert.ok(r.out.startsWith('## bus-factor-check: FAIL - 1 finding at or above warning\n'));
  assert.ok(r.out.includes('| Level | Rule | Unit | Found | Last change |'));
  assert.ok(r.out.includes('| **error** | concentration | folder sr\\|c |'));
  assert.ok(r.out.includes('A\\|B &lt;img src=x&gt; \\*\\[x\\](y)\\*'));
  assert.ok(!r.out.includes('<img'));
  assert.ok(r.out.includes('| sr\\|c/a\\_b.js |'));
  assert.ok(r.out.includes('#### concentration: sr\\|c'));
  assert.equal(mdCell('a\nb\\c'), 'a b\\\\c');
});

test('json: the whole report, with the configuration, the window, the units and the verdict, and the basis with --explain', async () => {
  const r = await runFiles(filesWith(LOG, CONFIG), [...ARGS, '--format', 'json']);
  const j = JSON.parse(r.out);
  assert.equal(j.tool, 'bus-factor-check');
  assert.equal(j.version, VERSION);
  assert.deepEqual(j.input, { kind: 'log', path: 'history.log', form: 'plain' });
  assert.deepEqual(j.window, { days: 30, commitsRead: 3, commitsCounted: 3, commitsOutside: 0, commitsExcluded: 0 });
  assert.deepEqual(j.totals, { authors: 2, lines: 65, files: 3, folders: 2 });
  assert.equal(j.findings.length, 1);
  assert.equal(j.findings[0].basis, undefined);
  assert.deepEqual(j.folders.map((f) => [f.path, f.lines, f.authors, f.top.author, f.top.share, f.lastChangeDays]), [['api', 47, 1, 'Ann Lee', '100%', 1], ['ui', 18, 2, 'Bo Ek', '55.55%', 0]]);
  assert.deepEqual(j.authors, [{ author: 'Ann Lee', lines: 55, commits: 2 }, { author: 'Bo Ek', lines: 10, commits: 1 }]);
  assert.deepEqual(j.verdict, { failOn: 'warning', pass: false, failing: 1, byLevel: { notice: 0, warning: 0, error: 1 }, text: 'FAIL - 1 finding at or above warning' });
  assert.equal(j.showEmails, undefined);
  const explained = JSON.parse((await runFiles(filesWith(LOG, CONFIG), [...ARGS, '--format', 'json', '--explain'])).out);
  assert.equal(explained.findings[0].basis[0].page, 'https://arxiv.org/abs/1604.06766');
});

test('report: the holders rule adds a column and the repository line; the notes say what was left out', () => {
  const config = readConfig(configText({ window: { days: 5 }, ignore: ['docs/**'], authors: { exclude: ['bot@*'] }, rules: { holders: { coverShare: 50, maxHolders: 1 } } }), 'c.json');
  const log = readLog(Buffer.from([
    plainCommit({ n: 4, time: dayTime(10), entries: ['4\t0\tapi/a.js', '-\t-\tapi/logo.png', '1\t0\tdocs/x.md', '1\t1\tapi/new.js => api/b.js'] }),
    plainCommit({ n: 3, time: dayTime(9), email: 'bot@example.com', entries: ['9\t0\tapi/a.js'] }),
    plainCommit({ n: 2, time: dayTime(2), entries: ['9\t0\tapi/a.js'] })
  ].join('')));
  const report = buildReport(config, log.commits, { kind: 'log', path: 'h.log', form: 'plain' }, { configFile: 'c.json', notUtf8: true });
  const text = toText(report);
  assert.ok(text.includes('repository: top author Ann Lee with 100% of the changed lines; 1 author is needed to cover 50% (Ann Lee)\n'));
  assert.ok(text.includes('  FOLDER  LINES  AUTHORS  TOP AUTHOR  TOP SHARE  HOLDERS  LAST CHANGE\n'));
  for (const note of ['note: 1 commit of the log is older than the window and was not counted', 'note: 1 commit by authors that authors.exclude names was not counted', 'note: 1 file change in 1 path that ignore names was not counted', 'note: 1 change to binary files counts as a commit with no changed lines', 'note: 1 rename was followed: older changes count on the newer path', 'note: the log holds bytes that are not UTF-8; they are shown as the replacement character']) assert.ok(text.includes(note), note);
  assert.ok(toMarkdown(report).includes('### Notes'));
  assert.equal(JSON.parse(toJson(report)).notes.length, 6);
  const nothing = buildReport(config, readLog(Buffer.from(plainCommit({ email: 'bot@example.com', entries: ['1\t0\ta.js'] }))).commits, { kind: 'log', path: 'h.log', form: 'plain' });
  assert.ok(toText(nothing).includes('note: no commit in the window is by an author that is counted; there is nothing to check'));
  assert.ok(toText(nothing).includes('repository: no changed lines'));
  assert.ok(toMarkdown(nothing).includes('### Folders\n\nNone.'));
});

test('cli: an input that cannot be read exits 2 with every problem named, and no verdict', async () => {
  const r = await runFiles({ 'config.json': '{"window": {"days": 0}, "rules": {}}', 'history.log': 'not a log\n' }, ARGS);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.match(r.err, /^bus-factor-check: no verdict, the input has 3 problems:/);
  assert.match(r.err, /config\.json:1: window\.days: 0 is not a whole number of days/);
  assert.match(r.err, /config\.json:1: rules: states no rule/);
  assert.match(r.err, /history\.log: line 1: an entry must hold the lines added/);
});

test('cli: a missing configuration, a missing log, a log that is a folder and a missing repository exit 2', async () => {
  await withFiles(filesWith(plainCommit({ entries: ['1\t0\ta.js'] })), async (dir) => {
    const err = async (argv) => {
      const r = await cli(argv, dir);
      assert.equal(r.code, 2, argv.join(' '));
      return r.err;
    };
    assert.match(await err(['--config', 'nope.json', '--log', 'history.log']), /nope\.json: no such file/);
    assert.match(await err(['--config', 'config.json', '--log', 'nope.log']), /nope\.log: no such file/);
    assert.match(await err(['--config', 'config.json', '--log', '.']), /\.: not a regular file/);
    assert.match(await err(['--config', 'config.json', '--repo', 'nope']), /nope: no such folder/);
    assert.match(await err(['--config', 'config.json', '--repo', 'history.log']), /history\.log: not a folder; give the top folder of a git working copy/);
  });
});

test('checkPaths: throws an InputError with the problems; the fail level of the command line wins', async () => {
  await withFiles(filesWith(LOG, CONFIG), async (dir) => {
    await assert.rejects(checkPaths({ config: 'nope.json', log: 'history.log', base: dir }), (e) => e instanceof InputError && e.problems.length === 1);
    const report = await checkPaths({ config: 'config.json', log: 'history.log', base: dir, failOn: 'error' });
    assert.equal(report.verdict.failOn, 'error');
  });
});

test('bin: the installed command runs the same main, with the exit code of the verdict', () => {
  const r = spawnSync(process.execPath, [resolve(root, 'bin/bus-factor-check.js'), '--config', 'examples/config.json', '--log', 'examples/storefront/history.log'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /RESULT: FAIL - 2 findings at or above error\n$/);
  const help = spawnSync(process.execPath, [resolve(root, 'bin/bus-factor-check.js'), '--help'], { cwd: root, encoding: 'utf8' });
  assert.equal(help.status, 0);
  const bad = spawnSync(process.execPath, [resolve(root, 'bin/bus-factor-check.js')], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.ok(BASE_CONFIG.window.days > 0);
});
