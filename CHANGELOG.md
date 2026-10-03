# Changes

## 1.0.0

First release.

- Reports knowledge concentration in a git repository: for each file and each folder down to a configured depth, the authors in a window of days, the changed lines (added plus deleted) of each, the share of the top author, the fewest authors who together made a configured share of the lines, and the days since the last change.
- Two rules, with every number from the configuration: `concentration` (the top author made at least `minTopShare` percent of the lines and at most `maxOtherAuthors` others changed the unit) and `holders` (at most `maxHolders` authors are needed to cover `coverShare` percent). Each rule has a level, units it applies to and a least number of lines; the run fails on a finding at `failOn` or above, or at `--fail-on`.
- Reads the history by running git through `execFile` with no shell and a fixed list of arguments that ends with `--`, with the repository as the working folder, and with the options and the environment that keep the configuration of a repository from starting a pager, an external diff program, a conversion filter or a signature check. Or reads a log saved with the same command, in the exact `-z` form or the readable form, so it runs where git is not installed.
- A strict reader of the log: a fixed header per commit, every count and path checked, renames in both forms, binary files, quoted path names with C escapes and octal bytes, CRLF line ends, and a path out of the repository refused, with limits on sizes and counts.
- Follows renames back through the log, joins the addresses of one person through aliases compared without case, leaves out bots by patterns of addresses, and leaves out paths by patterns; patterns are matched without a regular expression.
- The window ends at the newest commit read, so the same history gives the same report on any day, and the report holds no date.
- Reports as text, Markdown and JSON. `--explain` shows, for each finding, the rule, why it matched, every author of the unit with lines, share, commits and last change, and the sentences of the saved pages each rule rests on, and lists every file. Email addresses are hidden unless `--show-emails` is given. Exit code `0` with no finding at the fail level, `1` with one, `2` for a usage or input error with no verdict.
- Every quoted sentence comes from the git-log, git-diff, git-config and gitmailmap documentation, the abstract of "A Novel Approach for Estimating Truck Factors" and RFC 8259, saved in `research/sources`; a test compares `src/data.js` with the saved text.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the repository.
