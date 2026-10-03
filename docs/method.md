# Method

This page defines every number the tool reports and every rule it checks. The numbers are the tool's own definitions. The paper by Avelino, Passos, Hora and Valente describes the truck factor as follows: "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." It also says: "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." The tool does not compute the truck factor of that paper, which works on files and on its own measure of authorship. It reports simpler numbers, from changed lines, that anyone can check against `git log`.

## The history

The tool reads the commits of the repository with `git log --no-merges --numstat`, or from a log saved with the same command:

```
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --numstat -M "--format=tformat:commit %H %ct%nemail %ae%nname %an" -- > history.log
```

(this is the readable form; docs/inputs.md has the exact `-z` form the tool runs itself). Each commit gives its hash, its committer time in seconds, its author address and author name, and for each file the lines added, the lines deleted and the path. Merge commits are not read: a merge repeats the changes of the branch it joins, and counting it would count them twice.

## The window

The newest commit is the commit with the highest committer time among the commits read. The window holds the commits whose committer time is at least the newest time minus `window.days` times 86,400 seconds. A commit exactly `window.days` days before the newest one is in the window; one second older is not.

The window ends at the newest commit, not at the clock. The same history therefore gives the same report on any day, and a repository nobody has changed for a year still gets a report about its last `window.days` days of work. When the tool runs git, it passes the start of the window as `--since=@<seconds>`. The saved page of git-log says of `--since-as-filter`: "This visits all commits in the range, rather than stopping at the first commit which is older than <date>." `--since` itself can stop at the first older commit it meets, so the tool checks the time of every commit again, and a saved log of the whole history gives the same numbers.

## Authors

An author is identified by the address of the commit, compared without case, as gitmailmap matches addresses: "Both E-Mails and names are matched case-insensitively." An address listed in `authors.aliases` belongs to the person of that alias, so a person who committed from two addresses is one author. An address that matches a pattern of `authors.exclude` is left out with all its commits, as for a bot.

The label of an author is the name of the alias, or else the name of the newest commit of that address. When two authors have the same label, compared without case, the authors are ordered by their identity (`alias:<n>` or `email:<address>`, compared by code unit) and the second and later get ` (2)`, ` (3)` and so on. The address is shown only with `--show-emails`.

The tool reads the author of a commit, not its committer. It does not read `.mailmap` of the repository: the aliases are in the configuration, where they are reviewed with the rules.

## Paths and renames

A path is the path of the file at the newest commit. The log is read newest commit first. When a commit renames `old` to `new`, `old` is pointed at the newest name of `new`, so an older commit that changed `old` counts on that newest name, through any number of renames. A file created at `old` after the rename is a different file: its commits come before the rename in the log and keep the name `old`. A path that matches a pattern of `ignore`, at its newest name, is left out.

The folders of a path are its first part, its first two parts and so on, down to `folders.depth`. `services/billing/tax.js` at depth 2 is in `services` and in `services/billing`. A file at the top of the repository is in no folder.

## The numbers of a unit

A unit is a file or a folder. For each unit the tool counts, over the commits of the window by authors that are counted:

- **changed lines**: the sum of the lines added and the lines deleted in every change to the unit. A line changed is a line deleted and a line added, so it counts twice, as `--numstat` counts it. A change to a binary file ("For binary files, outputs two - instead of saying 0 0.") adds no line.
- **commits**: the commits that changed the unit; a commit that changed three files of a folder is one commit of the folder.
- **authors**: the authors with at least one commit that changed the unit.
- **lines of an author**: the changed lines of the unit in that author's commits.
- **top author**: the author with the most lines; when two have the same lines, the first by label, compared by code unit.
- **top share**: the lines of the top author divided by the changed lines of the unit.
- **holders** for a share S: the fewest authors who together made at least S percent of the changed lines. The authors are ranked by their lines, most first, and taken from the top until their lines reach S; taking the largest first gives the smallest such set. A unit with no changed line has no holders.
- **last change**: the whole days, rounded down, from the newest commit that changed the unit to the newest commit read.

Every share is compared in whole numbers: a percentage in the configuration has at most four decimals and is kept as a whole number of ten-thousandths of a percent, and `part / whole >= S` is checked as `part * 100 * 10000 >= S * 10000 * whole`. A share is shown cut down to two decimals, never rounded up, so a figure just under a limit is never shown as the limit.

The repository line of the report gives the same numbers for the whole repository, with the share of the holders rule when one is configured.

## Rules

A rule looks at the units of the kinds in its `appliesTo` that have at least `minLines` changed lines and at least one. A unit that matches is a finding with the level of the rule. Findings are listed by level, highest first, then folders before files, then by path.

### `concentration`

A unit is a finding when the top share is at least `minTopShare` percent and the number of other authors (the authors minus the top author) is at most `maxOtherAuthors`.

With `minTopShare: 80` and `maxOtherAuthors: 1`: 80 lines of 100 by one author and 20 by another is a finding; 79.999 percent is not; 80 percent with two other authors is not. It answers the question: does one person write nearly all of this, with at most a few others ever touching it?

### `holders`

A unit is a finding when its holders for `coverShare` percent are at most `maxHolders` authors.

With `coverShare: 50` and `maxHolders: 1`: one author with 50 lines of 100 is a finding; 49 lines of 100 needs a second author, and is not. It answers a different question from `concentration`: how many people hold most of the work here? A folder split 60 to 40 between two people is not concentrated in the first sense, but it has one holder of half the lines.

## Result and exit codes

The run fails when a finding has the level `failOn` or above (`notice` is below `warning`, which is below `error`); `--fail-on` overrides `failOn`. Exit code `0`: no finding at or above the fail level; `1`: at least one; `2`: a usage or input error, with no verdict.
