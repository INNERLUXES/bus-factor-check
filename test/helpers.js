// Shared test helpers: inputs built inline, checked in memory or written into a temporary folder that is removed after the
// test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and Windows. The
// line a test expects is found with lineOf(), which counts lines the way the tool does, so a test never holds a line
// number worked out by hand for one system only.
//
// Tests that need git build a repository in a temporary folder with makeRepo(). Every git call gets a fixed author, a
// fixed committer and a fixed time, and an environment that reads no configuration of the machine: GIT_CONFIG_NOSYSTEM
// is set, GIT_CONFIG_GLOBAL points at an empty file and HOME at the temporary folder. The same history then gives the same
// commit hashes on every system.

import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { lineStarts, main, positionOf, readConfig } from '../src/index.js';
import { BASE_SECONDS } from './fixtures/storefront.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'bus-factor-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return positionOf(lineStarts(text), at).line;
}

// A hash made of one hex digit, for logs written inline.
export const hash = (n) => String(n % 10).repeat(40);

// One commit of a log in the readable form. entries: lines such as "3\t1\tsrc/a.js".
export function plainCommit({ n = 1, time = BASE_SECONDS, email = 'ann@example.com', name = 'Ann Lee', entries = [] }) {
  return `commit ${hash(n)} ${time}\nemail ${email}\nname ${name}\n\n${entries.map((e) => `${e}\n`).join('')}`;
}

// One commit of a log in the -z form. entries: [added, deleted, path] or [added, deleted, from, to] for a rename.
export function zCommit({ n = 1, time = BASE_SECONDS, email = 'ann@example.com', name = 'Ann Lee', entries = [] }) {
  const body = entries.map((e) => (e.length === 4 ? `${e[0]}\t${e[1]}\t\u0000${e[2]}\u0000${e[3]}\u0000` : `${e[0]}\t${e[1]}\t${e[2]}\u0000`)).join('');
  return `commit ${hash(n)} ${time}\nemail ${email}\nname ${name}\u0000${entries.length ? '\n' : ''}${body}`;
}

export const DAY_SECONDS = 86400;
export const dayTime = (day) => BASE_SECONDS + day * DAY_SECONDS;

// The configuration that most tests use.
export const BASE_CONFIG = {
  window: { days: 100 },
  rules: { concentration: { minTopShare: 80, maxOtherAuthors: 1 } }
};

// The normal form of a configuration written as an object, through the real reader.
export const configOf = (object) => readConfig(JSON.stringify(object), 'config.json');

// A configuration file text for the command line tests.
export const configText = (object) => `${JSON.stringify(object, null, 2)}\n`;

// Runs the command line with exactly these arguments, in a folder. run stands in for execFile.
export async function cli(argv, base = process.cwd(), { limits, run } = {}) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, base, run);
  return { code, out, err };
}

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function runFiles(files, args = [], options = {}) {
  return withFiles(files, (dir) => cli(args, dir, options));
}

// The files of a run on a saved log, with this configuration.
export const ARGS = ['--config', 'config.json', '--log', 'history.log'];
export const filesWith = (log, config = BASE_CONFIG, extra = {}) => ({ 'config.json': configText(config), 'history.log': log, ...extra });

// The environment of a git call in a test: no configuration of the machine, and this author, committer and time.
export function testGitEnv(home, author = ['Ann Lee', 'ann@example.com'], seconds = BASE_SECONDS) {
  const date = `@${seconds} +0000`;
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: resolve(home, 'gitconfig'),
    GIT_AUTHOR_NAME: author[0],
    GIT_AUTHOR_EMAIL: author[1],
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: author[0],
    GIT_COMMITTER_EMAIL: author[1],
    GIT_COMMITTER_DATE: date,
    GIT_TERMINAL_PROMPT: '0'
  };
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
}

// A stand-in for execFile that the tool is given in the tests: the same call, with the variables of testGitEnv on top of
// the environment the tool builds, so the git the tool runs reads no configuration of the machine either. calls collects
// every call, so a test can look at its shape.
export function isolatedRun(home, calls = []) {
  const extra = testGitEnv(home);
  return (file, args, options, callback) => {
    calls.push({ file, args, options });
    return execFile(file, args, { ...options, env: { ...options.env, HOME: extra.HOME, USERPROFILE: extra.USERPROFILE, XDG_CONFIG_HOME: extra.XDG_CONFIG_HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: extra.GIT_CONFIG_GLOBAL } }, callback);
  };
}

// Whether a git binary can be run.
export function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function git(cwd, env, args) {
  return execFileSync('git', args, { cwd, env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

// Builds a git repository in dir/name from a history such as test/fixtures/storefront.js, oldest commit first. Gives the
// folder of the repository and the folder used as HOME.
export async function makeRepo(dir, commits, name = 'repo') {
  const home = resolve(dir, 'home');
  const repo = resolve(dir, name);
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  await writeFile(resolve(home, 'gitconfig'), '');
  const env0 = testGitEnv(home);
  git(repo, env0, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  git(repo, env0, ['config', 'core.autocrlf', 'false']);
  const files = new Map();
  let counter = 0;
  for (const commit of commits) {
    const env = testGitEnv(home, commit.author, BASE_SECONDS + commit.day * DAY_SECONDS);
    for (const change of commit.changes) {
      const full = resolve(repo, change.path);
      await mkdir(dirname(full), { recursive: true });
      if (change.from) {
        git(repo, env, ['mv', '--', change.from, change.path]);
        files.set(change.path, files.get(change.from));
        files.delete(change.from);
      }
      if (change.binary) {
        counter += 1;
        await writeFile(full, Buffer.from([0x89, 0x50, 0x00, 0x01, counter % 256]));
        continue;
      }
      const lines = (files.get(change.path) ?? []).slice(change.del);
      for (let i = 0; i < change.add; i += 1) {
        counter += 1;
        lines.push(`line ${counter} of ${change.path}`);
      }
      files.set(change.path, lines);
      await writeFile(full, lines.length ? `${lines.join('\n')}\n` : '');
    }
    git(repo, env, ['add', '-A']);
    git(repo, env, ['commit', '-q', '--no-verify', '--allow-empty', '-m', commit.message]);
  }
  return { repo, home };
}

