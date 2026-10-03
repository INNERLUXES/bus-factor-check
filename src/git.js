// Running git. This is the only file that starts a program, and it starts exactly one: the git binary, through execFile,
// never through a shell. The arguments are fixed lists written in this file; the only value that comes from outside is the
// start of the window, a whole number of seconds that the tool computes itself. The folder of the repository is given as
// the working folder of the process and never as an argument, and every list ends with "--", so nothing after it can be
// read as an option or a revision. The output is read as bytes, with a size limit and a time limit, and handed to the
// strict reader of src/log.js like any other untrusted text.

import { execFile } from 'node:child_process';

// The format of the header of each commit: three lines, written by git from the placeholders %H (commit hash), %ct
// (committer date, UNIX timestamp), %ae (author email) and %an (author name).
export const LOG_FORMAT = 'tformat:commit %H %ct%nemail %ae%nname %an';

// Options that keep the configuration of the repository or of the machine from changing the output: no colour, no
// external diff program, no text conversion filter, no signature check, no path relative to a subfolder, and names in
// UTF-8.
export const GIT_FIXED = ['--no-pager', 'log', '--no-merges', '--no-color', '--no-ext-diff', '--no-textconv', '--no-show-signature', '--no-relative', '--encoding=UTF-8'];

// The first run reads the committer time of every commit, to find the newest one: the window ends there.
export const TIMES_ARGS = Object.freeze([...GIT_FIXED, '--format=tformat:%ct', '--']);

// The second run reads the commits of the window with the lines each one added and deleted per file.
export function logArgs(since) {
  if (!Number.isSafeInteger(since) || since < 0) throw new Error('the start of the window must be a whole number of seconds');
  return [...GIT_FIXED, '--numstat', '-z', '-M', `--since=@${since}`, `--format=${LOG_FORMAT}`, '--'];
}

// The command a person runs to save a log the tool can read without git: the same fixed list with the window left out
// (the tool applies the window itself), in the exact -z form or in the readable form without -z.
export const SAVED_LOG_ARGS = Object.freeze([...GIT_FIXED, '--numstat', '-z', '-M', `--format=${LOG_FORMAT}`, '--']);
export const SAVED_PLAIN_LOG_ARGS = Object.freeze(SAVED_LOG_ARGS.filter((a) => a !== '-z'));
const shown = (args) => `git ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')} > history.log`;
export const SAVED_LOG_COMMAND = shown(SAVED_LOG_ARGS);
export const SAVED_PLAIN_LOG_COMMAND = shown(SAVED_PLAIN_LOG_ARGS);

// Variables of the environment that would point git at another repository, another index, another configuration given on
// the command line, a pager or an external diff program. They are removed from the environment of the child process.
const REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_EXTERNAL_DIFF', 'GIT_PAGER', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_DIFF_OPTS', 'GIT_EXEC_PATH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS'];

// The environment of the child process: the environment of the tool without the variables above, and without any
// GIT_CONFIG_KEY_n or GIT_CONFIG_VALUE_n, with prompts and optional locks switched off.
export function gitEnv(env = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    const upper = key.toUpperCase();
    if (REDIRECTS.includes(upper) || upper.startsWith('GIT_CONFIG_KEY_') || upper.startsWith('GIT_CONFIG_VALUE_') || upper.startsWith('GIT_TRACE')) continue;
    out[key] = value;
  }
  out.GIT_TERMINAL_PROMPT = '0';
  out.GIT_OPTIONAL_LOCKS = '0';
  return out;
}

export const GIT_LIMITS = { maxLogBytes: 256 * 1024 * 1024, timeoutMs: 300000 };

export class GitError extends Error {}

// Runs git with a fixed list of arguments in the folder of the repository and gives its standard output as bytes. run is
// execFile, or a stand-in in the tests.
export function runGit(args, { cwd, run = execFile, limits = GIT_LIMITS, env = gitEnv() } = {}) {
  if (!Array.isArray(args) || args.at(-1) !== '--') return Promise.reject(new GitError('the arguments of git must end with --'));
  const options = { cwd, env, encoding: 'buffer', maxBuffer: limits.maxLogBytes, timeout: limits.timeoutMs, windowsHide: true, shell: false };
  return new Promise((resolvePromise, reject) => {
    run('git', args, options, (error, stdout, stderr) => {
      if (!error) {
        resolvePromise(Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? '')));
        return;
      }
      const said = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : String(stderr ?? '')).trim().split('\n').slice(0, 3).join(' / ');
      if (error.code === 'ENOENT') reject(new GitError('git was not found; install git, or save a log with git and give it with --log'));
      else if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') reject(new GitError(`git wrote more than ${(limits.maxLogBytes / 1048576).toLocaleString('en-US')} MB; make window.days smaller`));
      else if (error.killed || error.signal) reject(new GitError(`git did not finish within ${(limits.timeoutMs / 1000).toLocaleString('en-US')} seconds`));
      else reject(new GitError(`git stopped with exit code ${error.code}${said ? `: ${said}` : ''}`));
    });
  });
}

// The newest committer time of the history, in seconds, from the output of TIMES_ARGS; null when there is no commit.
export function newestTime(buffer) {
  let newest = null;
  for (const line of buffer.toString('latin1').split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    if (!/^[0-9]{1,12}$/.test(t)) throw new GitError('git wrote a commit time that is not a whole number of seconds');
    const n = Number(t);
    if (newest === null || n > newest) newest = n;
  }
  return newest;
}

// Reads the commits of the window from the repository in folder cwd: the newest commit time first, then the log from the
// start of the window. Gives { buffer, newest }.
export async function readGitHistory(cwd, days, options = {}) {
  const newest = newestTime(await runGit(TIMES_ARGS, { ...options, cwd }));
  if (newest === null) throw new GitError('the repository has no commit that is not a merge');
  const since = Math.max(0, newest - days * 86400);
  const buffer = await runGit(logArgs(since), { ...options, cwd });
  return { buffer, newest };
}
