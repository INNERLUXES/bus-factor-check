// Command line: bus-factor-check --config <file> (--repo <folder> | --log <file>) [options]

import { readFileSync } from 'node:fs';
import { InputError, checkPaths } from './check.js';
import { toText, toMarkdown, toJson } from './report.js';
import { RULES } from './rules.js';
import { LEVELS } from './data.js';
import { SAVED_LOG_COMMAND } from './git.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson };

export const USAGE = `Usage: bus-factor-check --config <file> (--repo <folder> | --log <file>) [options]

Reads the history of a git repository and reports knowledge concentration: the folders and files where the recent
changes come from one or two people. It counts the lines each author added and deleted in the window of the
configuration, per file and per folder, and checks the rules of the configuration. Every number of a rule is yours; the
tool has no threshold of its own. It runs git with a fixed list of arguments and no shell, or reads a log saved with the
command below, reads no file of the working tree, and opens no network connection. Email addresses are hidden unless
--show-emails is given.

Options:
  --config <file>     the configuration file (JSON): window, folders, authors, ignore, rules; required
  --repo <folder>     the top folder of a git working copy; git is run in it
  --log <file>        a saved log, instead of --repo, made with:
                      ${SAVED_LOG_COMMAND}
  --format <name>     text, markdown or json (default: text)
  --explain           show the numbers behind each finding: the rule, why it matched, every author of the unit with
                      lines, share, commits and last change, and the sentence each rule rests on; also every file
  --show-emails       show the email addresses of the authors (hidden by default: they are personal data)
  --fail-on <level>   the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: failOn of
                      the configuration, else warning)
  --help              show this text
  --version           show the version

Give --repo or --log, not both.

Rules: ${RULES.map((r) => `${r.id} (rules.${r.id})`).join(', ')}.

Exit codes: 0 no finding at or above the fail level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { config: null, repo: null, log: null, format: 'text', explain: false, showEmails: false, failOn: null, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--show-emails') o.showEmails = true;
    else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--repo') o.repo = once(a, o.repo, next());
    else if (a === '--log') o.log = once(a, o.log, next());
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else throw new Error(`unexpected argument ${a}; give the repository with --repo ${a}`);
  }
  if (!o.help && !o.version) {
    if (!o.config) throw new Error('give the configuration file with --config <file>');
    if (!o.repo && !o.log) throw new Error('give the repository with --repo <folder> or a saved log with --log <file>');
    if (o.repo && o.log) throw new Error('give --repo or --log, not both');
    for (const p of [o.config, o.repo, o.log].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown or json)`);
    if (o.failOn !== null && !LEVELS.includes(o.failOn)) throw new Error(`unknown level ${o.failOn} (${LEVELS.join(', ')})`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail level, 1 a finding at or above it, 2 usage or input error. run stands in
// for execFile in the tests.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd(), run = undefined) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`bus-factor-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ config: o.config, repo: o.repo, log: o.log, failOn: o.failOn, showEmails: o.showEmails, version: VERSION, limits, base, run });
  } catch (error) {
    if (error instanceof InputError) io.err(`bus-factor-check: no verdict, the input has ${error.problems.length === 1 ? 'a problem' : `${error.problems.length} problems`}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`bus-factor-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.verdict.pass ? 0 : 1;
}
