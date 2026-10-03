// From commits to numbers. Each commit of the window is put on its author (after the aliases and the excluded authors of
// the configuration), each file entry on the path the file has at the newest commit (renames are followed back through the
// log), and each path on its folders down to the configured depth. The numbers of a file or a folder are the changed lines
// (added plus deleted) of each author, the commits, and the time of the last change. docs/method.md defines each one.

import { matchesAny } from './glob.js';
import { emailKey } from './config.js';
import { SCALE } from './ratio.js';
import { safeText } from './text.js';

export const DAY = 86400;

// Compares two texts by their code units, so the order never depends on the locale of the machine.
export const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The identity of an author: an alias of the configuration when one lists the address, else the address itself, compared
// without case. excluded is true when the address matches a pattern of authors.exclude.
export function identify(email, config) {
  const key = emailKey(email);
  const excluded = config.exclude.length > 0 && matchesAny(config.exclude, key);
  const alias = config.aliases.findIndex((a) => a.emails.includes(key));
  return { key: alias >= 0 ? `alias:${alias}` : `email:${key}`, alias: alias >= 0 ? config.aliases[alias].name : null, excluded };
}

// The folders of a path down to depth, from the top: a/b/c.js gives a and a/b at depth 2. A file at the top has none.
export function foldersOf(path, depth) {
  const parts = path.split('/');
  const out = [];
  for (let i = 1; i < parts.length && i <= depth; i += 1) out.push(parts.slice(0, i).join('/'));
  return out;
}

function newUnit(path, kind) {
  return { path, kind, lines: 0, added: 0, deleted: 0, commits: 0, binary: 0, last: null, byAuthor: new Map(), lastCommit: -1 };
}

function touch(unit, author, change, commitIndex, time) {
  const lines = change.added === null ? 0 : change.added + change.deleted;
  if (change.added === null) unit.binary += 1;
  else {
    unit.added += change.added;
    unit.deleted += change.deleted;
  }
  unit.lines += lines;
  if (unit.lastCommit !== commitIndex) {
    unit.commits += 1;
    unit.lastCommit = commitIndex;
  }
  if (unit.last === null || time > unit.last) unit.last = time;
  let a = unit.byAuthor.get(author);
  if (!a) {
    a = { lines: 0, commits: 0, last: null, lastCommit: -1 };
    unit.byAuthor.set(author, a);
  }
  a.lines += lines;
  if (a.lastCommit !== commitIndex) {
    a.commits += 1;
    a.lastCommit = commitIndex;
  }
  if (a.last === null || time > a.last) a.last = time;
}

// Reads the commits (in the order of the log, newest first) into the units of the window. Gives the identities, the files,
// the folders, the whole repository as one unit, and the counts the report shows.
export function analyze(commits, config) {
  let newest = null;
  for (const c of commits) if (newest === null || c.time > newest) newest = c.time;
  const start = newest - config.days * DAY;
  const people = new Map();
  const files = new Map();
  const folders = new Map();
  const repository = newUnit('.', 'repository');
  const renamed = new Map();
  const ignored = new Set();
  const counts = { read: commits.length, inWindow: 0, excluded: 0, outside: 0, renames: 0, binary: 0, ignoredChanges: 0, emptyCommits: 0 };
  // The path a file has at the newest commit: a rename seen in a newer commit points the old path at the new one.
  const current = (path) => renamed.get(path) ?? path;

  commits.forEach((commit, index) => {
    if (commit.time < start) {
      counts.outside += 1;
      return;
    }
    const who = identify(commit.email, config);
    if (who.excluded) {
      counts.excluded += 1;
      return;
    }
    counts.inWindow += 1;
    let person = people.get(who.key);
    if (!person) {
      // The log is newest first, so the first name seen is the newest.
      person = { key: who.key, alias: who.alias, name: safeText(who.alias ?? commit.name, 80), emails: new Set(), commits: 0, lines: 0 };
      people.set(who.key, person);
    }
    person.emails.add(emailKey(commit.email));
    person.commits += 1;
    if (commit.changes.length === 0) counts.emptyCommits += 1;
    for (const change of commit.changes) {
      const path = current(change.path);
      if (change.from !== null && change.from !== change.path) {
        counts.renames += 1;
        if (!renamed.has(change.from)) renamed.set(change.from, path);
      }
      if (config.ignore.length && matchesAny(config.ignore, path)) {
        counts.ignoredChanges += 1;
        ignored.add(path);
        continue;
      }
      if (change.added === null) counts.binary += 1;
      else person.lines += change.added + change.deleted;
      let file = files.get(path);
      if (!file) {
        file = newUnit(path, 'file');
        files.set(path, file);
      }
      touch(file, who.key, change, index, commit.time);
      for (const f of foldersOf(path, config.depth)) {
        let folder = folders.get(f);
        if (!folder) {
          folder = newUnit(f, 'folder');
          folders.set(f, folder);
        }
        touch(folder, who.key, change, index, commit.time);
      }
      touch(repository, who.key, change, index, commit.time);
    }
  });
  counts.ignoredPaths = ignored.size;
  return { newest, start, people: labelPeople(people), files, folders, repository, counts };
}

// Gives each person a label that no other person has: the alias, or the newest name. When two people have the same name,
// the second and later, in the order of their identities, get (2), (3) and so on.
export function labelPeople(people) {
  const groups = new Map();
  for (const p of [...people.values()].sort((a, b) => byText(a.key, b.key))) {
    const base = p.name.trim() === '' ? '(no name)' : p.name.trim();
    const k = base.toLowerCase();
    const n = (groups.get(k) ?? 0) + 1;
    groups.set(k, n);
    p.label = n === 1 ? base : `${base} (${n})`;
  }
  return people;
}

// The authors of a unit, most changed lines first; equal lines by label, so the order is the same on every machine.
export function rankAuthors(unit, people) {
  return [...unit.byAuthor.entries()]
    .map(([key, a]) => ({ key, label: people.get(key).label, lines: a.lines, commits: a.commits, last: a.last }))
    .sort((x, y) => y.lines - x.lines || byText(x.label, y.label) || byText(x.key, y.key));
}

// The fewest authors who together made at least the share (scaled, see src/ratio.js) of the changed lines of a unit: the
// ranked authors are taken from the top until their lines reach the share. Taking the largest first gives the smallest
// such set. null when the unit has no changed lines.
export function holders(ranked, total, scaledShare) {
  if (total === 0) return null;
  let sum = 0;
  for (let i = 0; i < ranked.length; i += 1) {
    sum += ranked[i].lines;
    if (sum * 100 * SCALE >= scaledShare * total) return { count: i + 1, authors: ranked.slice(0, i + 1) };
  }
  return { count: ranked.length, authors: ranked };
}

// Whole days from a time to the newest commit, rounded down.
export const daysBefore = (newest, time) => Math.floor((newest - time) / DAY);
