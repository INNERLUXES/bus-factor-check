import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GIT_FIXED, GIT_LIMITS, GitError, LOG_FORMAT, SAVED_LOG_ARGS, SAVED_LOG_COMMAND, SAVED_PLAIN_LOG_ARGS, SAVED_PLAIN_LOG_COMMAND, TIMES_ARGS, gitEnv, logArgs, newestTime, readGitHistory, readLog, runGit } from '../src/index.js';
import { BASE_CONFIG, cli, configText, dayTime, git, hasGit, isolatedRun, makeRepo, testGitEnv, withFiles } from './helpers.js';

// How the tool runs git: one binary, through execFile with no shell, a fixed list of arguments that ends with "--", the
// repository as the working folder, and the output read as bytes with a size and a time limit. A stand-in for execFile
// records each call; the tests with a real git build a repository in a temporary folder with a fixed author, committer
// and time, and with no configuration of the machine.

// A stand-in for execFile that answers from a list and records the calls.
function fake(answers, calls = []) {
  return (file, args, options, callback) => {
    calls.push({ file, args: [...args], options });
    const next = answers.shift();
    setImmediate(() => (next instanceof Error ? callback(next, Buffer.alloc(0), Buffer.from(next.stderr ?? '')) : callback(null, Buffer.from(next), Buffer.alloc(0))));
  };
}

const errorWith = (props) => Object.assign(new Error('failed'), props);

test('git: the fixed arguments; the only value from outside the file is the start of the window, a whole number', () => {
  assert.deepEqual(GIT_FIXED, ['--no-pager', 'log', '--no-merges', '--no-color', '--no-ext-diff', '--no-textconv', '--no-show-signature', '--no-relative', '--encoding=UTF-8']);
  assert.deepEqual([...TIMES_ARGS], [...GIT_FIXED, '--format=tformat:%ct', '--']);
  assert.deepEqual(logArgs(12345), [...GIT_FIXED, '--numstat', '-z', '-M', '--since=@12345', `--format=${LOG_FORMAT}`, '--']);
  assert.equal(LOG_FORMAT, 'tformat:commit %H %ct%nemail %ae%nname %an');
  for (const bad of [-1, 1.5, '100', '100 --output=x', NaN, null]) assert.throws(() => logArgs(bad), /a whole number of seconds/, String(bad));
  assert.equal(SAVED_LOG_ARGS.at(-1), '--');
  assert.ok(!SAVED_PLAIN_LOG_ARGS.includes('-z'));
  assert.ok(SAVED_LOG_COMMAND.startsWith('git --no-pager log --no-merges'));
  assert.ok(SAVED_LOG_COMMAND.includes('"--format=tformat:commit %H %ct%nemail %ae%nname %an" -- > history.log'));
  assert.ok(!SAVED_PLAIN_LOG_COMMAND.includes(' -z '));
});

test('git: execFile is called with "git", an array that ends with --, the repository as cwd and no shell', async () => {
  const calls = [];
  const run = fake([`${dayTime(5)}\n${dayTime(9)}\n${dayTime(1)}\n`, 'LOG'], calls);
  const repo = resolve('some folder', '$(touch pwned)', '; rm -rf x');
  const r = await readGitHistory(repo, 3, { run, env: { PATH: 'p' } });
  assert.equal(r.newest, dayTime(9));
  assert.equal(r.buffer.toString(), 'LOG');
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.file, 'git');
    assert.ok(Array.isArray(c.args));
    assert.equal(c.args.at(-1), '--');
    assert.equal(c.options.cwd, repo, 'the folder is the working folder');
    assert.ok(!c.args.some((a) => a.includes('pwned') || a.includes('rm -rf')), 'the folder never reaches the arguments');
    assert.equal(c.options.shell, false);
    assert.equal(c.options.encoding, 'buffer');
    assert.equal(c.options.maxBuffer, GIT_LIMITS.maxLogBytes);
    assert.equal(c.options.timeout, GIT_LIMITS.timeoutMs);
    assert.equal(c.options.windowsHide, true);
  }
  assert.deepEqual(calls[0].args, [...TIMES_ARGS]);
  assert.deepEqual(calls[1].args, logArgs(dayTime(9) - 3 * 86400));
});

test('git: the start of the window never goes below zero', async () => {
  const calls = [];
  await readGitHistory('.', 36500, { run: fake(['100\n', ''], calls) });
  assert.equal(calls[1].args.find((a) => a.startsWith('--since=')), '--since=@0');
});

test('git: arguments that do not end with -- are refused before anything runs', async () => {
  const calls = [];
  await assert.rejects(runGit(['log'], { run: fake(['x'], calls) }), /must end with --/);
  assert.equal(calls.length, 0);
});

test('git: a missing git, too much output, a time out and an exit code are each a GitError with a reason', async () => {
  for (const [error, pattern] of [
    [errorWith({ code: 'ENOENT' }), /git was not found; install git, or save a log with git and give it with --log/],
    [errorWith({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }), /git wrote more than 256 MB; make window.days smaller/],
    [errorWith({ killed: true, signal: 'SIGTERM' }), /git did not finish within 300 seconds/],
    [errorWith({ code: 128, stderr: 'fatal: not a git repository\nsecond line' }), /git stopped with exit code 128: fatal: not a git repository \/ second line/],
    [errorWith({ code: 1 }), /git stopped with exit code 1$/]
  ]) await assert.rejects(runGit(['--'], { run: fake([error]) }), (e) => e instanceof GitError && pattern.test(e.message));
});

test('git: the newest time of the first run; a time that is not a number is refused; no commit is an error', async () => {
  assert.equal(newestTime(Buffer.from('5\n12\n7\n\n')), 12);
  assert.equal(newestTime(Buffer.from('')), null);
  assert.throws(() => newestTime(Buffer.from('5\nx\n')), /not a whole number of seconds/);
  await assert.rejects(readGitHistory('.', 10, { run: fake(['\n']) }), /the repository has no commit that is not a merge/);
});

test('git: the environment of git loses the variables that point at another repository, configuration, pager or diff', () => {
  const env = gitEnv({ PATH: '/bin', HOME: '/home/a', GIT_DIR: '/evil', GIT_WORK_TREE: '/w', git_index_file: 'i', GIT_CONFIG_PARAMETERS: "'core.pager=evil'", GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.pager', GIT_CONFIG_VALUE_0: 'evil', GIT_EXTERNAL_DIFF: 'x', GIT_PAGER: 'x', GIT_TRACE: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/g' });
  assert.deepEqual(Object.keys(env).sort(), ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_OPTIONAL_LOCKS', 'GIT_TERMINAL_PROMPT', 'HOME', 'PATH']);
  assert.equal(env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
});

const GIT = hasGit();

test('real git: the -z log of a repository with renames, a binary file, spaces and names in UTF-8 is read exactly', { timeout: 120000 }, async (t) => {
  if (!GIT) return t.skip('no git binary on this machine; the CI runners have one');
  await withFiles({}, async (dir) => {
    const cafe = `caf${String.fromCharCode(0xe9)}.txt`;
    const { repo, home } = await makeRepo(dir, [
      { day: 1, author: ['Ann Lee', 'ann@example.com'], message: 'one', changes: [{ path: 'src/a b/fi le.txt', add: 2, del: 0 }, { path: `src/${cafe}`, add: 1, del: 0 }, { path: "src/it's.txt", add: 3, del: 0 }, { path: 'bin.dat', binary: true }] },
      { day: 2, author: ['Bo Ek', 'bo@example.com'], message: 'two', changes: [{ path: 'src/c/fi le.txt', from: 'src/a b/fi le.txt', add: 1, del: 0 }, { path: 'top.txt', from: "src/it's.txt", add: 0, del: 0 }, { path: 'bin.dat', binary: true }] }
    ]);
    const { buffer, newest } = await readGitHistory(repo, 30, { run: isolatedRun(home) });
    assert.equal(newest, dayTime(2));
    const log = readLog(buffer);
    assert.equal(log.form, 'z');
    assert.deepEqual(log.commits.map((c) => [c.email, c.name, c.time]), [['bo@example.com', 'Bo Ek', dayTime(2)], ['ann@example.com', 'Ann Lee', dayTime(1)]]);
    const byPath = (c) => Object.fromEntries(c.changes.map((x) => [x.path, [x.added, x.deleted, x.from]]));
    assert.deepEqual(byPath(log.commits[0]), { 'bin.dat': [null, null, null], 'src/c/fi le.txt': [1, 0, 'src/a b/fi le.txt'], 'top.txt': [0, 0, "src/it's.txt"] });
    assert.deepEqual(byPath(log.commits[1]), { 'bin.dat': [null, null, null], 'src/a b/fi le.txt': [2, 0, null], [`src/${cafe}`]: [1, 0, null], "src/it's.txt": [3, 0, null] });
    const plain = readLog(git(repo, testGitEnv(home), [...SAVED_PLAIN_LOG_ARGS]));
    assert.equal(plain.form, 'plain');
    assert.deepEqual(plain.commits, log.commits, 'the readable form reads the same as the -z form');
  });
});

test('real git: the window starts at the newest commit minus window.days; older commits are not read', { timeout: 120000 }, async (t) => {
  if (!GIT) return t.skip('no git binary on this machine; the CI runners have one');
  await withFiles({}, async (dir) => {
    const { repo, home } = await makeRepo(dir, [1, 10, 20, 30].map((day) => ({ day, author: ['Ann Lee', 'ann@example.com'], message: `day ${day}`, changes: [{ path: `f${day}.js`, add: 1, del: 0 }] })));
    const { buffer } = await readGitHistory(repo, 10, { run: isolatedRun(home) });
    assert.deepEqual(readLog(buffer).commits.map((c) => c.changes[0].path), ['f30.js', 'f20.js']);
  });
});

test('real git: a folder with a name like a command is only the working folder; nothing runs and no file appears', { timeout: 120000 }, async (t) => {
  if (!GIT) return t.skip('no git binary on this machine; the CI runners have one');
  await withFiles({ 'config.json': configText(BASE_CONFIG) }, async (dir) => {
    const name = 'repo $(touch pwned) ; echo hi';
    const { repo, home } = await makeRepo(dir, [{ day: 1, author: ['Ann Lee', 'ann@example.com'], message: 'one', changes: [{ path: 'a.js', add: 1, del: 0 }] }], name);
    const calls = [];
    const r = await cli(['--config', 'config.json', '--repo', name], dir, { run: isolatedRun(home, calls) });
    assert.equal(r.code, 0, r.err);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.options.cwd === repo && c.options.shell === false));
    await assert.rejects(access(resolve(dir, 'pwned')));
    await assert.rejects(access(resolve(repo, 'pwned')));
  });
});

test('real git: a folder that is not a repository, and a repository with no commit, are input errors with exit code 2', { timeout: 120000 }, async (t) => {
  if (!GIT) return t.skip('no git binary on this machine; the CI runners have one');
  await withFiles({ 'config.json': configText(BASE_CONFIG), 'plain/a.txt': 'x' }, async (dir) => {
    const notRepo = await cli(['--config', 'config.json', '--repo', 'plain'], dir);
    assert.equal(notRepo.code, 2);
    assert.match(notRepo.err, /plain: holds no \.git; give the top folder of a git working copy, or a saved log with --log/);
    const home = resolve(dir, 'home');
    await mkdir(home);
    await mkdir(resolve(dir, 'empty'));
    git(resolve(dir, 'empty'), testGitEnv(home), ['-c', 'init.defaultBranch=main', 'init', '-q']);
    const empty = await cli(['--config', 'config.json', '--repo', 'empty'], dir, { run: isolatedRun(home) });
    assert.equal(empty.code, 2);
    assert.match(empty.err, /empty: git stopped with exit code \d+/);
    assert.equal(empty.out, '');
  });
});
