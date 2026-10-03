## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a number, a rule or the configuration is described in docs/method.md or docs/inputs.md, says what it can and cannot see, and has a test with the history written inline and a near miss on each side of every limit
- [ ] No threshold is built in: every number a rule compares comes from the configuration file
- [ ] git is still started from src/git.js only, through execFile with no shell, with fixed arguments that end with `--`; no text from the input or the configuration becomes an argument
- [ ] The reader still refuses a log that does not have the fixed form, with its line or record, and never reads one in part
- [ ] Email addresses stay hidden in every format unless `--show-emails` is given
- [ ] A change to a quoted sentence follows the saved page: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] Text from the history goes through `safeText` before it reaches a report, a note or an error message
- [ ] Work stays linear in the size of the history: no pattern with nested repetition, no loop over all files inside a loop over all commits, and a hostile test with a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that runs git uses `makeRepo()`, `testGitEnv()` and `isolatedRun()`, so it reads no configuration of the machine
- [ ] A test that depends on the operating system (a link, a device) is guarded with `process.platform`, asserts no line or column of its own, and builds its paths with `resolve()` from forward-slash names
- [ ] No real person, company, address or key in fixtures or examples, no date, and no number that reads like a year anywhere
- [ ] The commit messages of this pull request follow Conventional Commits
