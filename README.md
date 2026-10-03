# bus-factor-check

Finds knowledge concentration in a git repository: the folders and files where the recent changes come from only one or two people. It reads the history with `git log --numstat`, counts the lines each author added and deleted in a window of days that ends at the newest commit, follows renames, joins the addresses of one person through aliases and leaves out bots, and then checks the rules you wrote in a configuration file. A dedicated team can use the report to spread that knowledge, through pairing, reviews and rotation, before someone leaves.

A paper on the subject, Avelino, Passos, Hora and Valente, "A Novel Approach for Estimating Truck Factors", opens with: "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." It also says: "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." So this tool does not claim to compute the truck factor of that paper. It reports plain numbers that anyone can check against `git log`, under names of its own, and docs/method.md defines each one.

- **Plain numbers.** For each file and folder: the authors in the window, the changed lines of each, the share of the top author, the fewest authors who together made a share of the lines you choose, and the days since the last change. `--explain` shows every author behind a finding.
- **No built-in thresholds.** Every number a rule compares comes from your configuration file; a rule it does not state is not run. A key that the tool does not know is an error, so a typo cannot switch a rule off.
- **git with a fixed command, no shell.** The tool runs `git` through `execFile` with a fixed list of arguments that ends with `--`; the folder is the working folder of the process, never an argument. Or it reads a log saved with the same command, so it can run where git is not installed.
- **Untrusted output, strict reader.** The log is read by the tool's own small reader: the header of each commit has a fixed form, every count and path is checked, a path out of the repository is refused, and sizes are capped. A log that does not fit stops the run with its line.
- **Email addresses are hidden.** Reports show a name or an alias. `--show-emails` shows the addresses.
- **The same history gives the same report.** The window ends at the newest commit read, not at the clock, and ages are days before that commit, so the report holds no date and does not change from one day to the next.
- Reports as text, Markdown and JSON, with an exit code for a pipeline gate: `0` no finding at or above the fail level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies.

```
npm test
```

```
tests 118
pass 116
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link (a `.git` that is a link, a log named through a link and a device behind a link); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line or a column. The tests that need git build a repository in a temporary folder with a fixed author, committer and time, and with no configuration of the machine. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer, and git to read a repository. There is nothing to install.

```
git clone https://github.com/INNERLUXES/bus-factor-check.git
cd bus-factor-check
node bin/bus-factor-check.js --config examples/config.json --log examples/storefront/history.log
```

Or without a clone, on your own repository:

```
npx --yes github:INNERLUXES/bus-factor-check --config team/bus-factor.json --repo .
```

`examples/` holds the saved log of a made-up storefront with six people over about four months: billing written almost only by one person, search by another alone, a catalog and a checkout shared by three and four people, an account page split between two, a bot that edits the deploy file, a person who committed with two addresses, a renamed file and a moved one, a binary file, and a docs folder the configuration leaves out. The names and the addresses are made up, on `example.com`.

## Usage

```
bus-factor-check --config <file> (--repo <folder> | --log <file>) [options]
```

```
--config <file>     the configuration file (JSON): window, folders, authors, ignore, rules; required
--repo <folder>     the top folder of a git working copy; git is run in it
--log <file>        a saved log, instead of --repo
--format <name>     text, markdown or json (default: text)
--explain           show the numbers behind each finding: the rule, why it matched, every author of the unit
                    with lines, share, commits and last change, and the sentence each rule rests on; also every file
--show-emails       show the email addresses of the authors (hidden by default: they are personal data)
--fail-on <level>   the lowest level of a finding that fails the run: notice, warning, error (default: failOn
                    of the configuration, else warning)
--help              show the usage
--version           show the version
```

Paths in the report are relative to the top of the repository, with forward slashes on every system. The path of the log or of the repository is shown relative to the folder you run the command in.

The report of the example starts with what was read and the counts, then the findings, every folder and every author:

```
bus-factor-check: examples/config.json (Example storefront)
history: examples/storefront/history.log (saved git log, readable form); 26 commits read
window: 120 days up to the newest commit; 23 commits counted, 1 older, 2 by excluded authors
changes: 6 authors; 1,210 changed lines in 13 files and 8 folders to depth 2
repository: top author Lena Ortiz with 29.91% of the changed lines; 2 authors are needed to cover 50% (Lena Ortiz and Omar Haddad)
rules: concentration (error, folders, at least 30 changed lines); holders (warning, folders, at least 30 changed lines)
findings: 5 (2 error, 3 warning); fail level error

Findings (5)

  ERROR    concentration  folder  services/billing
           Lena Ortiz made 97.31% of 372 changed lines; 1 other author
           last change 10 days before the newest commit

  ERROR    concentration  folder  services/search
           Omar Haddad made 100% of 272 changed lines; no other author
           last change 20 days before the newest commit

  WARNING  holders        folder  services/billing
           1 author (Lena Ortiz) made 97.31% of 372 changed lines
           last change 10 days before the newest commit

  WARNING  holders        folder  services/search
           1 author (Omar Haddad) made 100% of 272 changed lines
           last change 20 days before the newest commit

  WARNING  holders        folder  web/account
           1 author (Ana Silva) made 60.43% of 91 changed lines
           last change 65 days before the newest commit

Folders (8)

  FOLDER            LINES  AUTHORS  TOP AUTHOR   TOP SHARE  HOLDERS  LAST CHANGE
  infra             7      1        Ravi Shah    100%       1        45 days
  services          913    6        Lena Ortiz   39.64%     2        0 days
  services/billing  372    2        Lena Ortiz   97.31%     1        10 days
  services/catalog  269    3        Tomas Berg   47.58%     2        0 days
  services/search   272    1        Omar Haddad  100%       1        20 days
  web               283    4        Mia Chen     34.98%     2        5 days
  web/account       91     2        Ana Silva    60.43%     1        65 days
  web/checkout      192    4        Ravi Shah    43.75%     2        5 days

Authors (6)

  Lena Ortiz   362 lines  5 commits
  Omar Haddad  272 lines  4 commits
  Ana Silva    173 lines  3 commits
  Tomas Berg   160 lines  4 commits
  Mia Chen     142 lines  3 commits
  Ravi Shah    101 lines  4 commits

note: 1 commit of the log is older than the window and was not counted
note: 2 commits by authors that authors.exclude names were not counted
note: 2 file changes in 1 path that ignore names were not counted
note: 1 change to binary files counts as a commit with no changed lines
note: 2 renames were followed: older changes count on the newer path

RESULT: FAIL - 2 findings at or above error
```

The exit code is `1`: two findings have the level `error`, and the configuration fails on `error`. `--explain` shows the numbers behind each finding; for billing:

```
  ERROR    concentration  folder  services/billing
           Lena Ortiz made 97.31% of 372 changed lines; 1 other author
           last change 10 days before the newest commit
           rule: the top author made at least 80% of the changed lines and at most 1 other author changed the unit
           why: 97.31% is at least 80%, and 1 is at most 1
           authors of the unit:
           - Lena Ortiz  362 lines  (97.31%)  5 commits  last change 10 days before
           - Ravi Shah   10 lines   (2.68%)   1 commit   last change 80 days before
```

[examples/output](examples/output) holds the report as text, with `--explain`, as Markdown and as JSON.

## What it finds

| Rule | Key | A unit is a finding when |
| --- | --- | --- |
| `concentration` | `rules.concentration` | the top author made at least `minTopShare` percent of its changed lines, and at most `maxOtherAuthors` other authors changed it |
| `holders` | `rules.holders` | at most `maxHolders` authors together made `coverShare` percent of its changed lines |

A unit is a folder down to `folders.depth` (a folder at depth 1 is a top folder) or a file; `appliesTo` says which a rule looks at. A unit with fewer changed lines than `minLines` is not looked at, so a folder touched once by one person is not a finding. Each rule gives its findings a `level` (`notice`, `warning` or `error`), and the run fails when a finding is at `failOn` or above.

## The numbers

| Number | What it is |
| --- | --- |
| changed lines | lines added plus lines deleted, as `--numstat` counts them, in the commits of the window; a binary file adds a commit and no line |
| authors | the people with at least one commit that changed the unit in the window, after aliases and exclusions |
| top author, top share | the author with the most changed lines, and that author's lines divided by all the changed lines of the unit |
| holders | the fewest authors who together made at least `coverShare` percent of the changed lines: the authors with the most lines are taken first |
| last change | whole days from the newest commit that changed the unit to the newest commit read |

The window holds the commits whose committer time is at most `window.days` days before the newest commit read. Merge commits are not read. A rename is followed back through the log, so changes made before a move count on the new path. [docs/method.md](docs/method.md) defines every number exactly, and [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with the saved page it comes from.

## The configuration file

[docs/inputs.md](docs/inputs.md) has every key and every default. The configuration of the example is [examples/config.json](examples/config.json):

```json
{
  "name": "Example storefront",
  "window": { "days": 120 },
  "folders": { "depth": 2 },
  "authors": {
    "aliases": [
      { "name": "Lena Ortiz", "emails": ["lena@example.com", "lena.ortiz@old.example.com"] }
    ],
    "exclude": ["*-bot@example.com"]
  },
  "ignore": ["docs/**"],
  "rules": {
    "concentration": { "minTopShare": 80, "maxOtherAuthors": 1, "minLines": 30, "level": "error", "appliesTo": ["folders"] },
    "holders": { "coverShare": 50, "maxHolders": 1, "minLines": 30, "level": "warning", "appliesTo": ["folders"] }
  },
  "failOn": "error"
}
```

`authors.aliases` names one person with every address that person commits with; addresses are compared without case. `authors.exclude` and `ignore` take patterns with `*`, `?` and `**`, and no regular expression. Only `window.days` and one rule are needed; the defaults are `folders.depth` 2, `appliesTo` folders, `level` warning, `minLines` 1 and `failOn` warning, and none of them is a threshold of a rule.

## A saved log

To run the tool where git is not installed, or on a history someone sent you, save the log with this command in the top folder of the repository, and give the file with `--log`:

```
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --numstat -z -M "--format=tformat:commit %H %ct%nemail %ae%nname %an" -- > history.log
```

Leave out `-z` for a log a person can read, as in the example; git then quotes path names with unusual characters, and the tool reads the quotes. The tool applies the window itself, so the saved log may hold the whole history.

## Formats

- `text`: for a terminal: what was read, the counts, the findings with their last change, every folder with its numbers, every author, the notes and the result. With `--explain` also the rule, the reason and every author of each finding, the sentences the rules rest on, and every file.
- `markdown`: the same for a pull request comment or the job summary, with the findings, the folders and the authors as tables. Pipes, square brackets, backticks, asterisks, underscores, line breaks and angle brackets from the history are escaped, so a path or a name cannot break a table, make a link or be read as HTML.
- `json`: the whole report: the configuration, the input, the window, the totals, every author, every finding with the authors of its unit, every folder and file with its numbers, the verdict and the notes.

To put the report in the job summary of a GitHub Actions run, and stop the pipeline on a finding at the fail level:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      fetch-depth: 0
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Knowledge concentration in the job summary
    run: npx --yes github:INNERLUXES/bus-factor-check --config team/bus-factor.json --repo . --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Knowledge concentration gate
    run: npx --yes github:INNERLUXES/bus-factor-check --config team/bus-factor.json --repo .
```

`fetch-depth: 0` matters: a shallow clone holds one commit, and the report would be about that commit alone.

## Privacy

Author names and email addresses are personal data. The reports show the name of the newest commit of each person, or the alias you gave, and never an address unless `--show-emails` is given. The report counts lines; it does not judge people, and a team should read it as a list of places to share, not a ranking. [docs/secure-defaults.md](docs/secure-defaults.md) says why the addresses are hidden by default and what to think about before a report is posted.

## Exit codes

`0`: no finding at or above the fail level. `1`: at least one finding at or above it. `2`: a usage or input error: no configuration, no repository and no log, both, an unknown option, a configuration with an unknown key, a key named twice or no rule, a folder that is not a git working copy, git missing or stopping with an error, a log that does not have the fixed form, a path out of the repository, an input over the limits. With exit code `2` the tool gives no verdict and prints the problems on standard error.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration and the history, works out the numbers, runs the rules, builds the report |
| `src/git.js` | the only place that starts a program: git through `execFile`, fixed arguments, no shell |
| `src/log.js` | the strict reader of the log, in the `-z` form and in the readable form |
| `src/config.js` | validates the configuration against the known keys and builds its normal form |
| `src/metrics.js` | identities, renames, the units and their numbers |
| `src/rules.js` | the two rules and the verdict |
| `src/json.js`, `src/glob.js` | the strict JSON reader, and the pattern matcher written without a regular expression |
| `src/files.js` | bounded reading of the named files, and the check of the repository folder |
| `src/report.js`, `src/text.js`, `src/size.js`, `src/ratio.js` | the reports, the cleaning of text from the history, number formats, exact shares |
| `src/data.js` | the sentences the tool rests on, compared with the saved pages in `research/sources` |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the example with its real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| `--since`, `--no-merges`, `--format`, `tformat:`, the placeholders `%H`, `%ct`, `%ae`, `%an`, `--numstat` and `-z` | git-log documentation, https://git-scm.com/docs/git-log |
| The `--numstat` output, renames with and without `-z`, and `-M` | git-diff documentation, https://git-scm.com/docs/git-diff |
| How path names with unusual characters are quoted | git-config documentation, core.quotePath, https://git-scm.com/docs/git-config |
| Mapping the names and addresses of one person, compared without case | gitmailmap documentation, https://git-scm.com/docs/gitmailmap |
| What the truck factor is, and that there is no agreed way to compute it | Avelino, Passos, Hora and Valente, https://arxiv.org/abs/1604.06766 |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |

## Limits

The tool counts lines, not knowledge. A person who reviews every change to a folder, or wrote it long before the window, knows it and is not counted; a person who ran a formatter over it is counted for every line. Code moved within a file, files that a build writes and that you do not leave out with `ignore`, and vendored code all add lines. Squash merges put the work of many people on one author, and rebased branches keep their authors. A shallow clone holds part of the history. [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

How a dedicated team spreads the knowledge of a code base across its members, and keeps it spread as people join and leave, is described on the page [Dedicated Software Development Team Services](https://innerluxes.dev/software-development/dedicated-teams).

## License

MIT
