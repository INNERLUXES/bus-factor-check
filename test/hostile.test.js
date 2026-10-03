import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, matchGlob, readLog } from '../src/index.js';
import { ARGS, BASE_CONFIG, cli, configText, dayTime, filesWith, hash, plainCommit, runFiles, withFiles, zCommit } from './helpers.js';

// Hostile input: a log or a configuration built to exhaust the memory or the time, to lead the tool out of the repository,
// to rewrite the terminal, to break a table or to change how objects behave. Each test also checks the time, because work
// that grows faster than the input is a failure even when the answer is right. Tests that need a symbolic link are guarded
// with process.platform, and none of them asserts a line or a column: those are asserted in the tests that run everywhere.

const LIMIT = { timeout: 120000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const CONFIG = { window: { days: 36500 }, rules: { concentration: { minTopShare: 50, maxOtherAuthors: 5, appliesTo: ['files', 'folders'] }, holders: { coverShare: 50, maxHolders: 1 } } };

test('hostile: a hundred thousand commits of a thousand authors over ten thousand files are read and counted in seconds', LIMIT, async () => {
  const parts = [];
  for (let i = 0; i < 100000; i += 1) parts.push(`commit ${hash(i)} ${dayTime(1000 - Math.floor(i / 200))}\nemail p${i % 1000}@example.com\nname P ${i % 1000}\n\n${i % 7}\t${i % 3}\tsrc/m${i % 100}/f${i % 10000}.js\n`);
  const r = await fast(() => runFiles(filesWith(parts.join(''), CONFIG), [...ARGS, '--format', 'json']), 30000);
  assert.ok(r.code === 0 || r.code === 1, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.window.commitsRead, 100000);
  assert.equal(j.totals.authors, 1000);
  assert.equal(j.totals.files, 10000);
});

test('hostile: a path of a megabyte, a name of a megabyte and a quoted path of a megabyte of escapes are refused at once', LIMIT, async () => {
  for (const log of [
    plainCommit({ entries: [`1\t0\t${'a'.repeat(1000000)}`] }),
    plainCommit({ name: 'n'.repeat(1000000) }),
    plainCommit({ entries: [`1\t0\t"${'\\303\\251'.repeat(150000)}"`] }),
    zCommit({ entries: [['1', '0', 'x'.repeat(1000000)]] })
  ]) {
    const r = await fast(() => runFiles(filesWith(log), ARGS), 4000);
    assert.equal(r.code, 2);
    assert.ok(r.err.length < 3000, 'the error stays short');
  }
});

test('hostile: braces, arrows and quotes repeated a million times are read in one pass', LIMIT, async () => {
  for (const field of ['{'.repeat(1000000), ` => ${'}'.repeat(1000000)}`, `${'{'.repeat(500000)} => ${'}'.repeat(500000)}`, '"'.repeat(1000001), ` => `.repeat(250000)]) {
    await fast(async () => {
      try {
        readLog(Buffer.from(plainCommit({ entries: [`1\t0\t${field}`] })), { maxPathLength: 2000000 });
      } catch {
        // refused or read: either way, quickly
      }
    }, 3000);
  }
});

test('hostile: a glob with many ** against a deep path is matched quickly', LIMIT, async () => {
  const pattern = Array(16).fill('**').join('/');
  const path = Array(4000).fill('a').join('/');
  await fast(async () => matchGlob(`${pattern}/b`, path), 1500);
  assert.equal(matchGlob(`${pattern}/b`, `${path}/b`), true);
});

test('hostile: a log over the size limit is refused with exit code 2; so is a configuration over its limit', LIMIT, async () => {
  const files = filesWith(plainCommit({ entries: ['1\t0\ta.js'] }));
  const log = await runFiles(files, ARGS, { limits: { ...LIMITS, maxLogBytes: 20 } });
  assert.equal(log.code, 2);
  assert.match(log.err, /history\.log: \d+ bytes is over the 20 byte limit/);
  const config = await runFiles(files, ARGS, { limits: { ...LIMITS, maxConfigBytes: 10 } });
  assert.match(config.err, /config\.json: \d+ bytes is over the 10 byte limit/);
});

test('hostile: a UTF-16 log, a configuration with a null byte and a configuration nested deep are refused', LIMIT, async () => {
  await withFiles(filesWith(''), async (dir) => {
    await writeFile(resolve(dir, 'history.log'), Buffer.from([0xff, 0xfe, 0x63, 0x00]));
    assert.match((await cli(ARGS, dir)).err, /history\.log: is UTF-16; only UTF-8 is read/);
    await writeFile(resolve(dir, 'history.log'), plainCommit({ entries: ['1\t0\ta.js'] }));
    await writeFile(resolve(dir, 'config.json'), Buffer.from([0x7b, 0x00, 0x7d]));
    assert.match((await cli(ARGS, dir)).err, /config\.json: holds binary data/);
    await writeFile(resolve(dir, 'config.json'), `${'{"a":'.repeat(100000)}1${'}'.repeat(100000)}`);
    const deep = await fast(() => cli(ARGS, dir));
    assert.equal(deep.code, 2);
    assert.match(deep.err, /nested more than 32 deep/);
  });
});

test('hostile: a configuration with a number of many digits is refused', LIMIT, async () => {
  const r = await runFiles(filesWith(plainCommit({ entries: ['1\t0\ta.js'] }), BASE_CONFIG, { 'config.json': configText(BASE_CONFIG).replace('"days": 100', `"days": 1${'0'.repeat(400)}`) }), ARGS);
  assert.equal(r.code, 2);
  assert.match(r.err, /a number too large to read|not a whole number/);
});

test('hostile: control, direction and line separator characters in names, addresses and paths are cleaned in every format', LIMIT, async () => {
  const bad = ['x', String.fromCharCode(27), '[31m', String.fromCharCode(0x202e), 'y', String.fromCharCode(0x2028), 'z', String.fromCharCode(0x85)].join('');
  const log = zCommit({ email: `a${bad}@example.com`, name: `Ann ${bad}`, entries: [['5', '0', `src${bad}/a${bad}.js`]] });
  for (const format of ['text', 'markdown', 'json']) {
    const r = await runFiles(filesWith(log, CONFIG), [...ARGS, '--format', format, '--explain', '--show-emails']);
    assert.equal(r.code, 1, `${format}: ${r.err}`);
    for (const c of [27, 0x202e, 0x2028, 0x85]) assert.ok(!r.out.includes(String.fromCharCode(c)), `${format}: ${c}`);
  }
});

test('hostile: an author name or a path with a command in it is text; nothing is run', LIMIT, async () => {
  const r = await runFiles(filesWith(plainCommit({ name: '$(touch ran.txt)', entries: ['5\t0\tsrc/`touch ran.txt`.js'] }), CONFIG), [...ARGS, '--explain']);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes('$(touch ran.txt) made 100%'));
  assert.ok(r.out.includes('src/`touch ran.txt`.js'));
});

test('hostile: names such as __proto__ and constructor are ordinary text as addresses, names, paths and aliases', LIMIT, async () => {
  const log = [
    plainCommit({ n: 2, email: '__proto__', name: 'constructor', entries: ['5\t0\t__proto__/constructor.js', '1\t0\ttoString/hasOwnProperty'] }),
    plainCommit({ n: 1, email: 'constructor', name: '__proto__', entries: ['5\t0\t__proto__/prototype.js'] })
  ].join('');
  const config = { ...CONFIG, authors: { aliases: [{ name: '__proto__', emails: ['toString'] }] } };
  const r = await runFiles(filesWith(log, config), [...ARGS, '--format', 'json']);
  assert.ok(r.code === 0 || r.code === 1, r.err);
  const j = JSON.parse(r.out);
  assert.deepEqual(j.folders.map((f) => f.path), ['__proto__', 'toString']);
  assert.deepEqual(j.authors.map((a) => a.author).sort(), ['__proto__', 'constructor']);
  assert.equal(({}).polluted, undefined);
  assert.equal(typeof ({}).constructor, 'function');
});

test('hostile: a log that names a path out of the repository is refused, not shown', LIMIT, async () => {
  for (const path of ['../outside.js', '/etc/passwd', 'a/../../b.js', 'a//b.js']) {
    const r = await runFiles(filesWith(plainCommit({ entries: [`1\t0\t${path}`] })), ARGS);
    assert.equal(r.code, 2, path);
    assert.equal(r.out, '');
  }
  const z = await runFiles(filesWith(zCommit({ entries: [['1', '0', 'ok.js', '../../escape.js']] })), ARGS);
  assert.equal(z.code, 2);
});

test('hostile: counts of nine digits on many entries are added exactly', LIMIT, async () => {
  const log = plainCommit({ entries: Array.from({ length: 1000 }, (_, i) => `999999999\t999999999\tsrc/f${i}.js`) });
  const r = await runFiles(filesWith(log, CONFIG), [...ARGS, '--format', 'json']);
  assert.equal(JSON.parse(r.out).totals.lines, 1999999998000);
});

test('hostile: a .git that is a symbolic link is refused, so the history read is the history of the folder named', LIMIT, async (t) => {
  if (process.platform === 'win32') return t.skip('creating symbolic links needs a privilege on Windows');
  await withFiles({ 'config.json': configText(BASE_CONFIG), 'elsewhere/.git/HEAD': 'ref: refs/heads/main\n' }, async (dir) => {
    await mkdir(resolve(dir, 'repo'));
    await symlink(resolve(dir, 'elsewhere/.git'), resolve(dir, 'repo/.git'));
    const r = await cli(['--config', 'config.json', '--repo', 'repo'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /repo: \.git is a symbolic link; give the folder it points to/);
  });
});

test('hostile: a log named through a symbolic link is read, because the person who runs the tool named it', LIMIT, async (t) => {
  if (process.platform === 'win32') return t.skip('creating symbolic links needs a privilege on Windows');
  await withFiles(filesWith(plainCommit({ entries: ['1\t0\ta.js'] })), async (dir) => {
    await symlink(resolve(dir, 'history.log'), resolve(dir, 'linked.log'));
    const r = await cli(['--config', 'config.json', '--log', 'linked.log'], dir);
    assert.equal(r.code, 0, r.err);
    await symlink('/dev/zero', resolve(dir, 'zero.log'));
    const zero = await fast(() => cli(['--config', 'config.json', '--log', 'zero.log'], dir));
    assert.equal(zero.code, 2);
    assert.match(zero.err, /zero\.log: not a regular file/);
  });
});
