# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!` for a breaking change.

## Changing a number or a rule

1. Describe the change in docs/method.md first: what is counted, the exact definition, the rule, when it matches and when it does not, and what it cannot see. The numbers are the tool's own; say so, and say why, rather than borrowing the name of a published metric that is computed another way.
2. The tool has no threshold of its own, and a change must not add one. Every number a rule compares must come from the configuration file. A default is allowed only for something that is not a threshold, listed in `DEFAULTS` in src/config.js and in docs/inputs.md with its reason.
3. Add a test with the history written inline, small enough that the result can be worked out by hand, with a near miss on each side of every limit.
4. Shares are compared in whole numbers through src/ratio.js. Never compare a share as a floating point number.
5. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON report.

## Changing how git is run

1. git is started from src/git.js only, through `execFile` with `shell: false`. Never use `exec`, `spawn` with a shell, or a command line built as a string. A repository test checks this.
2. The arguments are fixed lists in src/git.js and end with `--`. No path, name or other text from the input or the configuration may ever become an argument; the folder of the repository is the working folder. The start of the window is the only value worked out at run time, and it is a whole number.
3. A new option of git needs the page of the git documentation that describes it, saved in research/sources, and a line in docs/inputs.md with the reason.
4. Keep the options that stop the configuration of a repository from running a program (`--no-pager`, `--no-ext-diff`, `--no-textconv`, `--no-show-signature`) and the cleaning of the environment.

## Changing the reader of the log

1. The output of git is untrusted text. Check every field, refuse what does not fit with its line or record, and never read a log in part.
2. Keep the work linear: one pass over the log, no pattern with nested repetition, no loop over all files inside a loop over all commits. Keep the limits on sizes and counts. Add a hostile test with a long input and a time check.
3. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
4. A log saved with LF and with CRLF line ends must give the same report. The example log is stored as git wrote it (`.gitattributes`), and a test reads it both ways.

## Tests that need git

A test that runs git builds a repository in a temporary folder with `makeRepo()` of test/helpers.js, and runs git with `testGitEnv()`: a fixed author, committer and time, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL` at an empty file and `HOME` at the temporary folder, so nothing of the machine's configuration is read and the same history gives the same commit hashes on Linux, macOS and Windows. A run of the tool on such a repository gets `isolatedRun()` as its `execFile`, which adds the same variables. Use file names that every system allows; a name only some systems allow belongs in a test of the reader with the log written inline.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform`, says why in its `t.skip`, and asserts no line or column of its own: a line or column is asserted only in a test that runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written by hand. `test/repo.test.js` fails when a guarded test asserts a line or a column. Every other test builds its paths with `resolve()` from names with forward slashes.

## Changing the example

The example log in examples/storefront is what git writes for the history in test/fixtures/storefront.js, and a test builds that repository and compares. Change the fixture, run git with the readable form of the saved log command (docs/inputs.md) on the repository `makeRepo()` builds, save the output, and run `npm run example` to write examples/output. Times in the fixture are days after a fixed second, so no file holds a date; keep it so. Use made-up names and addresses on `example.com`.

## Changing the quoted sentences

The sentences in `src/data.js` come from the pages saved in `research/sources`: the git-log, git-diff, git-config and gitmailmap documentation, the abstract of the paper by Avelino, Passos, Hora and Valente, and RFC 8259. When a page changes, save the new text in `research/sources` (the address on the first line, plain ASCII, no date or year), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every quoted sentence with the saved text, so changing one without the other fails.

Never add a rule or a quoted sentence from memory or from a blog post. A new rule needs the page, opened and saved, and the words of the page that it rests on. If a page cannot be opened, do not cite it.

## Rules for the code

- No runtime dependencies. Node 22 or newer, git, and nothing else.
- The tool reads the files it is given, runs git, and writes only to the screen. It opens no network connection.
- Email addresses stay hidden unless `--show-emails` is given, in every format.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- No file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0) are fine.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
