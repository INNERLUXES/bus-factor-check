// The reader of the git log. It reads the output of the one fixed git command of src/git.js, or a log saved with the same
// command, and nothing else: each commit is a header of three lines (commit <hash> <time>, email <address>, name <name>)
// and then one entry per file with the lines added, the lines deleted and the path, as --numstat writes them. The text is
// untrusted: every field is checked, every size is capped, and anything that does not fit stops the run with its line or
// record number. Nothing in the log is ever run, opened or used as a pattern.
//
// Two forms are read. With -z, which the tool always uses when it runs git, git ends each field with a NUL, writes path
// names verbatim and gives a rename as an empty path followed by the old and the new name. Without -z, git quotes a path
// with unusual characters in double quotes with C escapes, and writes a rename as old => new, or with the common part
// outside braces: src/{old => new}/file. A log that holds a NUL is read as the -z form, any other log as the readable form.

export const LOG_LIMITS = { maxCommits: 1000000, maxChanges: 5000000, maxPathLength: 4096, maxNameLength: 256, maxEmailLength: 320 };

export class LogError extends Error {
  constructor(at, reason) {
    super(`${at}: ${reason}`);
    this.at = at;
    this.reason = reason;
  }
}

const HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TIME = /^[0-9]{1,12}$/;
const COUNT = /^(?:[0-9]{1,9}|-)$/;
const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

const strict = new TextDecoder('utf-8', { fatal: true });
const loose = new TextDecoder('utf-8', { fatal: false });

// A path as git stores it: not empty, relative, with no empty, "." or ".." part. A log that names another path is not
// from git and is refused, so no path in a report can point outside the repository.
export function pathProblem(path, limits = LOG_LIMITS) {
  if (path === '') return 'an empty path';
  if (path.length > limits.maxPathLength) return `a path longer than ${limits.maxPathLength.toLocaleString('en-US')} characters`;
  if (path.includes('\u0000')) return 'a path with a NUL in it';
  if (path.startsWith('/')) return 'an absolute path; git writes paths relative to the top of the repository';
  for (const part of path.split('/')) {
    if (part === '' || part === '.' || part === '..') return `a path with an empty, "." or ".." part (${path.slice(0, 80)})`;
  }
  return null;
}

// The header of one commit from its three lines.
function readHeader(lines, at, limits) {
  const [first, second, third] = lines;
  if (!first.startsWith('commit ')) throw new LogError(at, 'a commit header must start with "commit "');
  const parts = first.slice(7).split(' ');
  if (parts.length !== 2 || !HASH.test(parts[0]) || !TIME.test(parts[1])) throw new LogError(at, 'the line "commit" must hold a commit hash and a time in seconds, as the format commit %H %ct writes it; save the log with the command in docs/inputs.md');
  if (second === undefined || !(second === 'email' || second.startsWith('email '))) throw new LogError(at, 'the line after "commit" must start with "email "');
  if (third === undefined || !(third === 'name' || third.startsWith('name '))) throw new LogError(at, 'the second line after "commit" must start with "name "');
  const email = second.slice(6);
  const name = third.slice(5);
  if (email.length > limits.maxEmailLength) throw new LogError(at, `an email address longer than ${limits.maxEmailLength} characters`);
  if (name.length > limits.maxNameLength) throw new LogError(at, `an author name longer than ${limits.maxNameLength} characters`);
  return { hash: parts[0], time: Number(parts[1]), email, name, changes: [] };
}

// The two counts of an entry: a whole number each, or "-" and "-" for a binary file.
function readCounts(addedText, deletedText, at) {
  if (!COUNT.test(addedText) || !COUNT.test(deletedText)) throw new LogError(at, 'an entry must start with the lines added and the lines deleted, each a whole number or "-"');
  if ((addedText === '-') !== (deletedText === '-')) throw new LogError(at, 'a binary file has "-" for both counts');
  if (addedText === '-') return { added: null, deleted: null };
  return { added: Number(addedText), deleted: Number(deletedText) };
}

function addChange(state, commit, change, at) {
  if (!commit) throw new LogError(at, 'a file entry before the first commit header');
  for (const p of [change.path, change.from]) {
    if (p === null) continue;
    const problem = pathProblem(p, state.limits);
    if (problem) throw new LogError(at, problem);
  }
  state.changes += 1;
  if (state.changes > state.limits.maxChanges) throw new LogError(at, `more than ${state.limits.maxChanges.toLocaleString('en-US')} file entries`);
  commit.changes.push(change);
}

function addCommit(state, commit, at) {
  state.commits.push(commit);
  if (state.commits.length > state.limits.maxCommits) throw new LogError(at, `more than ${state.limits.maxCommits.toLocaleString('en-US')} commits`);
  return commit;
}

// The -z form: fields end with a NUL. Positions are given as record numbers, counted from 1.
function readZ(buffer, state) {
  let start = 0;
  const fields = [];
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0) {
      fields.push(buffer.subarray(start, i));
      start = i + 1;
    }
  }
  const tail = buffer.subarray(start);
  if (tail.length && !(tail.length === 1 && tail[0] === 10)) fields.push(tail);
  let commit = null;
  for (let i = 0; i < fields.length; i += 1) {
    const at = `record ${(i + 1).toLocaleString('en-US')}`;
    let text = loose.decode(fields[i]);
    if (text.startsWith('\n')) text = text.slice(1);
    if (text === '') {
      if (i === fields.length - 1) break;
      throw new LogError(at, 'an empty record');
    }
    if (text.startsWith('commit ')) {
      const lines = text.split('\n');
      if (lines.length !== 3) throw new LogError(at, 'a commit header must have three lines: commit, email and name');
      commit = addCommit(state, readHeader(lines, at, state.limits), at);
      continue;
    }
    const first = text.indexOf('\t');
    const second = first < 0 ? -1 : text.indexOf('\t', first + 1);
    if (second < 0) throw new LogError(at, 'an entry must hold the lines added, a tab, the lines deleted, a tab and the path');
    const counts = readCounts(text.slice(0, first), text.slice(first + 1, second), at);
    const path = text.slice(second + 1);
    if (path === '') {
      if (i + 2 >= fields.length) throw new LogError(at, 'a rename must be followed by the old and the new path');
      const from = loose.decode(fields[i + 1]);
      const to = loose.decode(fields[i + 2]);
      i += 2;
      addChange(state, commit, { path: to, from, ...counts }, at);
    } else addChange(state, commit, { path, from: null, ...counts }, at);
  }
}

// A path in double quotes, from the quote at i: C escapes and three octal digits for a byte. Gives the text and the end.
export function unquotePath(text, i = 0, at = 'path') {
  if (text[i] !== '"') throw new LogError(at, 'a quoted path must start with a double quote');
  const bytes = [];
  let j = i + 1;
  for (;;) {
    if (j >= text.length) throw new LogError(at, 'a quoted path that is not closed');
    const c = text[j];
    if (c === '"') break;
    if (c === '\\') {
      const e = text[j + 1];
      if (Object.hasOwn(ESCAPES, e)) {
        bytes.push(ESCAPES[e]);
        j += 2;
        continue;
      }
      const octal = text.slice(j + 1, j + 4);
      if (/^[0-3][0-7][0-7]$/.test(octal)) {
        bytes.push(parseInt(octal, 8));
        j += 4;
        continue;
      }
      throw new LogError(at, `an escape \\${(e ?? '').slice(0, 1)} that git does not write in a quoted path`);
    }
    for (const b of Buffer.from(c, 'utf8')) bytes.push(b);
    j += 1;
  }
  return { value: loose.decode(Uint8Array.from(bytes)), end: j + 1 };
}

// The new path of the readable form when it may be in quotes: the rest of the field.
function restPath(text, at) {
  if (!text.startsWith('"')) return text;
  const q = unquotePath(text, 0, at);
  if (q.end !== text.length) throw new LogError(at, 'text after a quoted path');
  return q.value;
}

// Joins the parts of a compact rename; an empty middle leaves one slash, as in src/{ => api}/a.js for src/a.js.
function joinRename(pre, mid, post) {
  if (mid !== '') return `${pre}${mid}${post}`;
  if (pre.endsWith('/') && post.startsWith('/')) return `${pre}${post.slice(1)}`;
  if (pre === '' && post.startsWith('/')) return post.slice(1);
  return `${pre}${post}`;
}

// The path field of the readable form: a path, a quoted path, a rename old => new, or a compact rename with braces.
export function readPlainPath(field, at = 'path') {
  if (field.startsWith('"')) {
    const q = unquotePath(field, 0, at);
    const rest = field.slice(q.end);
    if (rest === '') return { path: q.value, from: null };
    if (rest.startsWith(' => ')) return { path: restPath(rest.slice(4), at), from: q.value };
    throw new LogError(at, 'text after a quoted path');
  }
  const arrow = field.indexOf(' => ');
  if (arrow < 0) return { path: field, from: null };
  const open = field.lastIndexOf('{', arrow);
  const close = field.indexOf('}', arrow + 4);
  if (open >= 0 && close >= 0) {
    const pre = field.slice(0, open);
    const post = field.slice(close + 1);
    return { path: joinRename(pre, field.slice(arrow + 4, close), post), from: joinRename(pre, field.slice(open + 1, arrow), post) };
  }
  return { path: restPath(field.slice(arrow + 4), at), from: field.slice(0, arrow) };
}

// The readable form: one field per line. Positions are line numbers, counted from 1. A CR before a LF is dropped, so a
// log saved with CRLF line ends reads the same.
function readPlain(text, state) {
  const lines = text.split('\n');
  let commit = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i];
    const at = `line ${(i + 1).toLocaleString('en-US')}`;
    if (line === '') continue;
    if (line.startsWith('commit ')) {
      const strip = (l) => (l !== undefined && l.endsWith('\r') ? l.slice(0, -1) : l);
      commit = addCommit(state, readHeader([line, strip(lines[i + 1]), strip(lines[i + 2])], at, state.limits), at);
      i += 2;
      continue;
    }
    const first = line.indexOf('\t');
    const second = first < 0 ? -1 : line.indexOf('\t', first + 1);
    if (second < 0) throw new LogError(at, 'an entry must hold the lines added, a tab, the lines deleted, a tab and the path');
    const counts = readCounts(line.slice(0, first), line.slice(first + 1, second), at);
    const { path, from } = readPlainPath(line.slice(second + 1), at);
    addChange(state, commit, { path, from, ...counts }, at);
  }
}

// Reads a log into { form, commits, notUtf8 }. commits are in the order of the log: git writes the newest first.
export function readLog(buffer, limits = LOG_LIMITS) {
  const lim = { ...LOG_LIMITS, ...limits };
  const state = { commits: [], changes: 0, limits: lim };
  let notUtf8 = false;
  try {
    strict.decode(buffer);
  } catch {
    notUtf8 = true;
  }
  const z = buffer.includes(0);
  if (z) readZ(buffer, state);
  else readPlain(loose.decode(buffer), state);
  if (state.commits.length === 0) throw new LogError('log', 'holds no commit; save it with the command in docs/inputs.md');
  return { form: z ? 'z' : 'plain', commits: state.commits, notUtf8 };
}
