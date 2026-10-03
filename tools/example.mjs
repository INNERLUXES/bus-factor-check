// Runs the README example, checks that it reports what the README shows, and writes the reports of the example storefront
// to examples/output. CI runs it and then fails if those files changed, so the example output in the repository is always
// the real output. It reads the saved log, so it needs no git.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the example; every path is relative to the root of the repository.
const ARGS = ['--config', 'examples/config.json', '--log', 'examples/storefront/history.log'];

async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, undefined, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const full = await run(ARGS);
process.stdout.write(full.out);
expect('storefront', full, 1, [
  'history: examples/storefront/history.log (saved git log, readable form); 26 commits read',
  'window: 120 days up to the newest commit; 23 commits counted, 1 older, 2 by excluded authors',
  'findings: 5 (2 error, 3 warning); fail level error',
  'ERROR    concentration  folder  services/billing',
  'Lena Ortiz made 97.31% of 372 changed lines; 1 other author',
  'ERROR    concentration  folder  services/search',
  'WARNING  holders        folder  web/account',
  '1 author (Ana Silva) made 60.43% of 91 changed lines',
  'note: 2 renames were followed: older changes count on the newer path',
  'RESULT: FAIL - 2 findings at or above error'
], ['services/catalog\n', 'web/checkout\n', 'L. Ortiz', '@example.com', 'build-bot', 'docs/guide.md']);

// The fail level of the command line wins over failOn of the configuration: at warning the three warnings fail the run too.
const warnings = await run([...ARGS, '--fail-on', 'warning']);
expect('fail level warning', warnings, 1, ['RESULT: FAIL - 5 findings at or above warning'], []);

// The README shows the whole report and the --explain lines of one finding.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(full.out)) problems.push('README: the sample output differs from a real run');

await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/storefront.txt'), full.out);
const explain = await run([...ARGS, '--explain']);
if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
const explainLines = explain.out.split('\n');
const at = explainLines.findIndex((l) => l.includes('ERROR    concentration  folder  services/billing'));
const billing = explainLines.slice(at, at + 8).join('\n');
if (!readme.includes(billing)) problems.push('README: the --explain sample of services/billing differs from a real run');
await writeFile(resolve(root, 'examples/output/storefront-explain.txt'), explain.out);
for (const [format, name] of [['markdown', 'storefront.md'], ['json', 'storefront.json']]) {
  const r = await run([...ARGS, '--format', format, '--explain']);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
