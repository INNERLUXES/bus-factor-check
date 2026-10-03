# Secure defaults

The default run is the safe run. Nothing in the first two sections needs a flag, and none of it can be switched off. The rest of the document is about what the tool cannot do for you: running it in a pipeline, posting a report, and protecting the configuration.

## How the tool behaves by default

- **No threshold of its own.** Every number a rule compares comes from the configuration. A rule the configuration does not state is not run, and a configuration with no rule is refused. The defaults that exist (docs/inputs.md) are not thresholds of a rule, and each has its reason.
- **Unknown keys are errors.** A key in the configuration that the tool does not know stops the run, with its line and a suggestion, so a typo cannot switch a rule off. A key named twice stops the run.
- **git with a fixed command and no shell.** The only program the tool starts is git, through `execFile`, with a fixed list of arguments written in `src/git.js` that ends with `--`. The folder of the repository is the working folder of the process and never an argument, so a folder named like an option or a command is only a folder. The one value worked out at run time, the start of the window, is a whole number of seconds.
- **No configuration of the repository runs a program.** `--no-pager`, `--no-ext-diff`, `--no-textconv` and `--no-show-signature` keep a pager, an external diff program, a conversion filter or a signature check named by the repository or the machine from running, and the environment of git loses the variables that would point it at another repository or add configuration (docs/inputs.md lists them). `git log` runs no hook.
- **The output of git is untrusted.** It is read by the tool's own strict reader with a size limit and a time limit. Every header, count and path is checked; a path that is absolute or holds `..` is refused, so no path in a report points out of the repository. A log that does not have the fixed form stops the run with its line or record and no verdict.
- **No file of the working tree is read.** The tool looks only at whether the folder holds `.git`, without following a link, and refuses a `.git` that is a symbolic link. It reads the history through git and nothing else.
- **No network.** The tool sends nothing anywhere and refuses an argument that looks like an address. git reads the local repository; `git log` does not fetch.
- **No dependencies.** Node 22 or newer and git. There is no `node_modules` to install before it runs.
- **Exact arithmetic.** Shares are compared with whole numbers. A limit has at most four decimals. A share is shown cut down to two decimals, never rounded up.
- **Clean output.** Text from the history has control characters, line separators and direction controls removed and its length capped before it reaches a report or an error message. Markdown cells escape pipes, backslashes, square brackets, backticks, asterisks, underscores, line breaks and `<`, `>` and `&`.
- **No prototype tricks.** People, files and folders are kept in maps keyed by text, and JSON objects are built with own properties, so a name such as `__proto__` is just data.
- **The same history gives the same report.** The window ends at the newest commit, not at the clock; the tool reads no clock and no random number, and the report holds no date.
- **Writes nothing to disk.** The report goes to the screen.

## Email addresses are hidden

Author names and email addresses are personal data. A report is often posted where more people can read it than can read the repository: a pull request comment, a job summary, a channel of the team, a ticket. An address in such a place can be collected, and it is rarely needed: the people who read the report know each other by name.

So the reports show the name of the newest commit of each author, or the alias of the configuration, and never an address, in text, Markdown and JSON alike. `--show-emails` shows them, for the person who has to set up the aliases and needs to see which addresses belong to whom. The choice is a default, not a promise: the names are still personal data, and the commit history the report is built from is readable by anyone who can read the repository.

Before you post a report:

- Post it where only the team reads it. A finding names one person as the main author of a part of the code; read in the wrong place, it can look like blame.
- Do not post `--show-emails` output outside the team.
- Remember what the numbers are: changed lines in a window. They do not measure work, skill or value, and a team should read the report as a list of places to share, never as a ranking of people.

## Rules that make the check stricter

- **`appliesTo: ["folders", "files"]`.** Files are also checked; expect more findings, most of them small.
- **A lower `minLines`.** Smaller units are looked at.
- **`failOn: "notice"`.** Every finding fails the run.
- **`authors.exclude` for every bot.** A bot that edits a folder makes it look shared when no person knows it.

## Running it in a pipeline

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

- Give the job read access to the contents and nothing more. The tool needs no secret and does not write to the repository.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because `npx` runs what it downloads.
- Run it on the default branch, on a schedule or after a merge. A history from a fork or an unreviewed branch is data the tool treats as hostile, but its authors control the names and the addresses it shows.
- Check out the full history (`fetch-depth: 0`); a shallow clone gives a report about one commit.
- Do not hide the exit code of the gate with a trailing `|| true`.

## Protecting the configuration

The configuration decides what is a finding and who counts as whom. Keep it in the repository, in its own path, and put the path in `CODEOWNERS` with the people who own the team's process; require their review in branch protection. Change a rule in its own pull request, with the reason in the description. An alias joins two addresses into one person, so a wrong alias can hide a concentration; review aliases like code.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with `ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
