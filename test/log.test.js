import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_LIMITS, LogError, pathProblem, readLog, readPlainPath, unquotePath } from '../src/index.js';
import { hash, lineOf, plainCommit, zCommit } from './helpers.js';

// The reader of the git log: both forms, renames, binary files, quoted and odd path names, and every way a log can be
// wrong. The logs are written inline, in the shapes the saved pages of git-log and git-diff show.

const read = (text) => readLog(Buffer.from(text, 'utf8'));
const changes = (log) => log.commits.flatMap((c) => c.changes.map((x) => [x.added, x.deleted, x.from, x.path]));

test('readable form: the header of three lines and one entry per file, newest commit first', () => {
  const log = read(plainCommit({ n: 2, time: 200, entries: ['3\t1\tsrc/a.js', '0\t5\tREADME.md'] }) + plainCommit({ n: 1, time: 100, email: 'bo@example.com', name: 'Bo', entries: ['7\t0\tsrc/b.js'] }));
  assert.equal(log.form, 'plain');
  assert.equal(log.commits.length, 2);
  assert.deepEqual(log.commits.map((c) => [c.hash, c.time, c.email, c.name]), [[hash(2), 200, 'ann@example.com', 'Ann Lee'], [hash(1), 100, 'bo@example.com', 'Bo']]);
  assert.deepEqual(changes(log), [[3, 1, null, 'src/a.js'], [0, 5, null, 'README.md'], [7, 0, null, 'src/b.js']]);
  assert.equal(log.notUtf8, false);
});

test('readable form: a binary file has "-" for both counts and no lines', () => {
  const log = read(plainCommit({ entries: ['-\t-\tassets/logo.png', '2\t0\tsrc/a.js'] }));
  assert.deepEqual(changes(log), [[null, null, null, 'assets/logo.png'], [2, 0, null, 'src/a.js']]);
});

test('readable form: renames written old => new and with braces around the changed part', () => {
  assert.deepEqual(readPlainPath('src/{a b => c}/fi le.txt'), { from: 'src/a b/fi le.txt', path: 'src/c/fi le.txt' });
  assert.deepEqual(readPlainPath('arch/{i386 => x86}/Makefile'), { from: 'arch/i386/Makefile', path: 'arch/x86/Makefile' });
  assert.deepEqual(readPlainPath("src/it's.txt => top.txt"), { from: "src/it's.txt", path: 'top.txt' });
  assert.deepEqual(readPlainPath('{lib => services/billing}/money.js'), { from: 'lib/money.js', path: 'services/billing/money.js' });
  assert.deepEqual(readPlainPath('src/{ => api}/a.js'), { from: 'src/a.js', path: 'src/api/a.js' });
  assert.deepEqual(readPlainPath('src/{api => }/a.js'), { from: 'src/api/a.js', path: 'src/a.js' });
  assert.deepEqual(readPlainPath('{ => src}/a.js'), { from: 'a.js', path: 'src/a.js' });
  assert.deepEqual(readPlainPath('a/{b => c}'), { from: 'a/b', path: 'a/c' });
  assert.deepEqual(readPlainPath('plain path with spaces.md'), { from: null, path: 'plain path with spaces.md' });
});

test('readable form: a quoted path with C escapes and octal bytes of UTF-8, and quoted renames', () => {
  const cafe = `caf${String.fromCharCode(0xe9)}.txt`;
  assert.deepEqual(readPlainPath('"src/caf\\303\\251.txt"'), { from: null, path: `src/${cafe}` });
  assert.deepEqual(readPlainPath('"a\\"b\\\\c\\td\\ne.txt"'), { from: null, path: 'a"b\\c\td\ne.txt' });
  assert.deepEqual(readPlainPath('"old\\303\\251.txt" => "new\\303\\251.txt"'), { from: `old${String.fromCharCode(0xe9)}.txt`, path: `new${String.fromCharCode(0xe9)}.txt` });
  assert.deepEqual(readPlainPath('"q\\".txt" => plain.txt'), { from: 'q".txt', path: 'plain.txt' });
  assert.deepEqual(readPlainPath('plain.txt => "q\\".txt"'), { from: 'plain.txt', path: 'q".txt' });
  assert.equal(unquotePath('"\\a\\b\\v\\f\\r"').value, '\u0007\b\u000b\f\r');
  assert.equal(unquotePath('x "y" z', 2).end, 5);
});

test('readable form: a broken quoted path is an error with its reason', () => {
  assert.throws(() => readPlainPath('"never closed'), /a quoted path that is not closed/);
  assert.throws(() => readPlainPath('"bad \\q escape"'), /an escape \\q that git does not write/);
  assert.throws(() => readPlainPath('"bad \\9 octal"'), /an escape \\9/);
  assert.throws(() => readPlainPath('"a.txt" trailing'), /text after a quoted path/);
  assert.throws(() => readPlainPath('a.txt => "b.txt" x'), /text after a quoted path/);
  assert.throws(() => unquotePath('no quote'), /must start with a double quote/);
});

test('readable form: CRLF line ends read the same as LF, and an empty commit is a commit with no entries', () => {
  const lf = plainCommit({ n: 2, time: 300, entries: ['1\t1\ta.js'] }) + plainCommit({ n: 1, time: 200 });
  const crlf = lf.split('\n').join('\r\n');
  assert.deepEqual(read(crlf), read(lf));
  assert.equal(read(lf).commits[1].changes.length, 0);
});

test('-z form: NUL after each field, names written verbatim, renames as an empty path then the old and the new name', () => {
  const tab = 'with\ttab.txt';
  const log = read(zCommit({ n: 2, time: 200, entries: [['-', '-', 'bin.dat'], ['1', '0', 'src/a b/fi le.txt', 'src/c/fi le.txt'], ['0', '0', 'q"uote.txt', 'top.txt']] }) + zCommit({ n: 3, time: 150 }) + zCommit({ n: 1, time: 100, entries: [['2', '0', tab], ['1', '0', 'line\nbreak.txt']] }));
  assert.equal(log.form, 'z');
  assert.equal(log.commits.length, 3);
  assert.deepEqual(changes(log), [[null, null, null, 'bin.dat'], [1, 0, 'src/a b/fi le.txt', 'src/c/fi le.txt'], [0, 0, 'q"uote.txt', 'top.txt'], [2, 0, null, tab], [1, 0, null, 'line\nbreak.txt']]);
  assert.equal(log.commits[1].changes.length, 0);
});

test('-z form: names in UTF-8 are kept; bytes that are not UTF-8 are noted and shown as the replacement character', () => {
  const ok = readLog(Buffer.from(zCommit({ entries: [['1', '0', `caf${String.fromCharCode(0xe9)}.txt`]] }), 'utf8'));
  assert.equal(ok.commits[0].changes[0].path, `caf${String.fromCharCode(0xe9)}.txt`);
  assert.equal(ok.notUtf8, false);
  const bad = Buffer.concat([Buffer.from(zCommit({}).slice(0, -1), 'utf8'), Buffer.from([0, 10, 0x31, 9, 0x30, 9, 0x61, 0xff, 0x2e, 0x6a, 0x73, 0])]);
  const log = readLog(bad);
  assert.equal(log.notUtf8, true);
  assert.equal(log.commits[0].changes[0].path, `a${String.fromCharCode(0xfffd)}.js`);
});

test('a header that is not the fixed format is refused, with the line or the record', () => {
  const head = (first, rest = 'email a@example.com\nname A\n') => `${first}\n${rest}\n1\t0\ta.js\n`;
  for (const [text, pattern] of [
    [head('commit abc 100'), /line 1: the line "commit" must hold a commit hash and a time/],
    [head(`commit ${hash(1)}`), /line 1: the line "commit" must hold/],
    [head(`commit ${hash(1)} 1e9`), /line 1: the line "commit" must hold/],
    [head(`commit ${hash(1)} 100`, 'author a@example.com\nname A\n'), /line 1: the line after "commit" must start with "email "/],
    [head(`commit ${hash(1)} 100`, 'email a@example.com\nwho A\n'), /line 1: the second line after "commit" must start with "name "/],
    [`commit ${hash(1)} 100`, /line 1: the line after "commit"/]
  ]) assert.throws(() => read(text), pattern, text);
  assert.throws(() => read(`commit ${hash(1)} 100\nemail a\u0000`), /record 1: a commit header must have three lines/);
});

test('an entry that is not the numstat form is refused with its line', () => {
  const log = (entry) => plainCommit({ entries: [entry] });
  for (const [entry, pattern] of [
    ['3 1 a.js', /an entry must hold the lines added, a tab/],
    ['x\t1\ta.js', /each a whole number or "-"/],
    ['-\t1\ta.js', /a binary file has "-" for both counts/],
    ['1234567890\t1\ta.js', /each a whole number or "-"/],
    ['1\t1\t/etc/passwd', /an absolute path/],
    ['1\t1\tsrc/../../x', /a path with an empty, "\." or "\.\." part/],
    ['1\t1\tsrc//x', /empty, "\." or "\.\." part/],
    ['1\t1\t', /an empty path/]
  ]) {
    const text = log(entry);
    assert.throws(() => read(text), (error) => error instanceof LogError && pattern.test(error.reason) && error.at === `line ${lineOf(text, entry.slice(0, 3))}`, entry);
  }
  assert.throws(() => read('1\t0\ta.js\n'), /line 1: a file entry before the first commit header/);
  assert.throws(() => read(''), /holds no commit/);
  assert.throws(() => read('\n\n'), /holds no commit/);
});

test('-z form: a rename without its two names, an empty record and an entry with no tab are refused with the record', () => {
  assert.throws(() => readLog(Buffer.from(`${zCommit({})}\n1\t0\t\u0000old.js\u0000`)), /record 2: a rename must be followed by the old and the new path/);
  assert.throws(() => readLog(Buffer.from(`${zCommit({})}\u0000\u0000x`)), /record 2: an empty record/);
  assert.throws(() => readLog(Buffer.from(`${zCommit({})}\nno tab\u0000`)), /record 2: an entry must hold/);
  assert.throws(() => readLog(Buffer.from(`${zCommit({})}\n1\t0\t\u0000../up.js\u0000ok.js\u0000`)), /record 2: a path with an empty/);
});

test('paths: git paths only, relative and with no empty, "." or ".." part', () => {
  assert.equal(pathProblem('src/a.js'), null);
  assert.equal(pathProblem('.github/workflows/ci.yml'), null);
  assert.equal(pathProblem('a/...b/c'), null);
  for (const p of ['', '/a', 'a/', 'a//b', './a', 'a/./b', '../a', 'a/..']) assert.notEqual(pathProblem(p), null, p);
  assert.match(pathProblem('x'.repeat(LOG_LIMITS.maxPathLength + 1)), /longer than 4,096 characters/);
});

test('limits: commits, entries, names and addresses over the limit stop the read', () => {
  const two = plainCommit({ n: 2, entries: ['1\t0\ta.js', '1\t0\tb.js'] }) + plainCommit({ n: 1, entries: ['1\t0\tc.js'] });
  assert.throws(() => readLog(Buffer.from(two), { maxCommits: 1 }), /more than 1 commits/);
  assert.throws(() => readLog(Buffer.from(two), { maxChanges: 2 }), /more than 2 file entries/);
  assert.throws(() => read(plainCommit({ name: 'n'.repeat(257) })), /an author name longer than 256 characters/);
  assert.throws(() => read(plainCommit({ email: `${'e'.repeat(321)}@x` })), /an email address longer than 320 characters/);
  assert.throws(() => readLog(Buffer.from(plainCommit({ entries: ['1\t0\tabcdef'] })), { maxPathLength: 5 }), /a path longer than 5 characters/);
  assert.equal(readLog(Buffer.from(two), { maxCommits: 2, maxChanges: 3 }).commits.length, 2);
});

test('an empty name or address is read as empty; a hash of SHA-256 length is read', () => {
  const log = read(`commit ${'a'.repeat(64)} 5\nemail\nname\n\n1\t0\ta.js\n`);
  assert.equal(log.commits[0].email, '');
  assert.equal(log.commits[0].name, '');
  assert.equal(log.commits[0].hash.length, 64);
});
