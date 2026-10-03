import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVED_LOG_ARGS, SAVED_PLAIN_LOG_ARGS, main } from '../src/index.js';
import { STOREFRONT } from './fixtures/storefront.js';
import { git, hasGit, isolatedRun, makeRepo, testGitEnv, withFiles } from './helpers.js';

// The example storefront: its saved log, its configuration and the reports in examples/output. The log is checked against
// a fresh run of git on a repository built from test/fixtures/storefront.js, so the example is real git output.

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const ARGS = ['--config', 'examples/config.json', '--log', 'examples/storefront/history.log'];

async function run(argv, base = root, runner = undefined) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base, runner);
  return { code, out, err };
}

const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');

test('examples: the storefront fails on two error findings, with the report that is saved in examples/output', async () => {
  const r = await run(ARGS);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('storefront.txt'));
  assert.match(r.out, /findings: 5 \(2 error, 3 warning\); fail level error/);
  assert.match(r.out, /RESULT: FAIL - 2 findings at or above error\n$/);
});

test('examples: --explain, Markdown and JSON are the reports that are saved', async () => {
  assert.equal((await run([...ARGS, '--explain'])).out, await saved('storefront-explain.txt'));
  assert.equal((await run([...ARGS, '--format', 'markdown', '--explain'])).out, await saved('storefront.md'));
  assert.equal((await run([...ARGS, '--format', 'json', '--explain'])).out, await saved('storefront.json'));
});

test('examples: the concentrated folders are found and the shared ones are not; aliases, bots, ignore and renames apply', async () => {
  const j = JSON.parse((await run([...ARGS, '--format', 'json'])).out);
  assert.deepEqual(j.findings.map((f) => `${f.level} ${f.rule} ${f.path}`), ['error concentration services/billing', 'error concentration services/search', 'warning holders services/billing', 'warning holders services/search', 'warning holders web/account']);
  const folder = (p) => j.folders.find((f) => f.path === p);
  assert.deepEqual([folder('services/catalog').authors, folder('web/checkout').authors], [3, 4]);
  assert.equal(folder('services/billing').top.author, 'Lena Ortiz', 'the old address of Lena is her alias');
  assert.ok(!j.authors.some((a) => a.author === 'build-bot' || a.author === 'L. Ortiz'));
  assert.ok(!j.files.some((f) => f.path.startsWith('docs/') || f.path.startsWith('lib/')));
  assert.equal(j.files.find((f) => f.path === 'services/billing/money.js').lines, 34, 'the change made before the move counts on the new path');
  assert.equal(j.files.find((f) => f.path === 'infra/logo.png').binaryChanges, 1);
  assert.deepEqual(j.window, { days: 120, commitsRead: 26, commitsCounted: 23, commitsOutside: 1, commitsExcluded: 2 });
});

test('examples: the saved log written with CRLF line ends gives the same report', async () => {
  const text = await readFile(resolve(root, 'examples/storefront/history.log'), 'utf8');
  const config = await readFile(resolve(root, 'examples/config.json'), 'utf8');
  await withFiles({ 'examples/storefront/history.log': text.split('\n').join('\r\n'), 'examples/config.json': config.split('\n').join('\r\n') }, async (dir) => {
    const r = await run([...ARGS, '--explain'], dir);
    assert.equal(r.code, 1);
    assert.equal(r.out, await saved('storefront-explain.txt'));
  });
});

test('examples: the saved log is exactly what git writes for the storefront history, and --repo gives the same numbers', { timeout: 180000 }, async (t) => {
  if (!hasGit()) return t.skip('no git binary on this machine; the CI runners have one');
  await withFiles({ 'examples/config.json': await readFile(resolve(root, 'examples/config.json'), 'utf8') }, async (dir) => {
    const { repo, home } = await makeRepo(dir, STOREFRONT, 'storefront');
    const plain = git(repo, testGitEnv(home), [...SAVED_PLAIN_LOG_ARGS]);
    assert.equal(plain.toString('utf8'), await readFile(resolve(root, 'examples/storefront/history.log'), 'utf8'));
    const fromLog = JSON.parse((await run([...ARGS, '--format', 'json'])).out);
    const fromGit = await run(['--config', 'examples/config.json', '--repo', 'storefront', '--format', 'json'], dir, isolatedRun(home));
    assert.equal(fromGit.code, 1, fromGit.err);
    const j = JSON.parse(fromGit.out);
    assert.deepEqual(j.input, { kind: 'git', path: 'storefront', form: 'z' });
    for (const key of ['findings', 'folders', 'files', 'authors', 'totals', 'repository', 'verdict']) assert.deepEqual(j[key], fromLog[key], key);
    assert.equal(j.window.commitsRead, 25, 'git reads only the window; the saved log holds one older commit');
    const z = git(repo, testGitEnv(home), [...SAVED_LOG_ARGS]);
    await withFiles({ 'examples/config.json': await readFile(resolve(root, 'examples/config.json'), 'utf8'), 'examples/storefront/history.log': z }, async (zdir) => {
      const r = await run([...ARGS, '--explain'], zdir);
      assert.equal(r.out.replace('-z form', 'readable form'), await saved('storefront-explain.txt'));
    });
  });
});
