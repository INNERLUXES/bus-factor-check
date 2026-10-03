# Rules and sources

Every sentence the tool or its documents quote comes from a page saved in `research/sources`, with the address of the page on the first line of the file. `src/data.js` holds the sentences, and `test/data.test.js` checks that each one is on its saved page, word for word. Where the tool makes its own choice, the documents say so.

## The saved pages

| File | Page | What it is used for |
| --- | --- | --- |
| `git-log-options.txt` | https://git-scm.com/docs/git-log | the options of the fixed git command: `--since`, `--since-as-filter`, `--no-merges`, `--format` and `tformat:`, the placeholders `%H`, `%an`, `%ae`, `%ct`, `%n`, `--numstat`, `-z`, and `--use-mailmap` |
| `git-diff-numstat-format.txt` | https://git-scm.com/docs/git-diff | the form of a `--numstat` entry with and without `-z`, renames in both forms, and `-M` |
| `git-config-core-quotepath.txt` | https://git-scm.com/docs/git-config | how path names with unusual characters are quoted in the readable form |
| `gitmailmap.txt` | https://git-scm.com/docs/gitmailmap | what a mailmap is for, and that names and addresses are matched without case |
| `avelino-truck-factor-abstract.txt` | https://arxiv.org/abs/1604.06766 | the title, the authors and the abstract of "A Novel Approach for Estimating Truck Factors" by Guilherme Avelino, Leonardo Passos, Andre Hora and Marco Tulio Valente; only the abstract page was read |
| `rfc8259-json-objects.txt` | https://www.rfc-editor.org/rfc/rfc8259 | section 4, objects: why a configuration that names a key twice is refused |

The saved pages are excerpts: the sections named in each file, as the page showed them, in plain ASCII and with no date.

## The sentences the reports quote

| Rule | Sentence | Page |
| --- | --- | --- |
| `concentration` | "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." | Avelino and others, abstract |
| `holders` | "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." | Avelino and others, abstract |
| `holders` | "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." | Avelino and others, abstract |

`--explain` prints these under each finding. They say why the question is worth asking; they do not define the rules, which are the tool's own (docs/method.md).

## Every quoted sentence

| Key in src/data.js | Sentence | Section | Page |
| --- | --- | --- | --- |
| `since` | "Show commits more recent than <date>." | `--since` | git-log |
| `sinceAsFilter` | "This visits all commits in the range, rather than stopping at the first commit which is older than <date>." | `--since-as-filter` | git-log |
| `noMerges` | "Do not print commits with more than one parent." | `--no-merges` | git-log |
| `tformat` | "In other words, each commit has the message terminator character (usually a newline) appended, rather than a separator placed between entries." | `tformat:` | git-log |
| `placeholderHash` | "commit hash" | `%H` | git-log |
| `placeholderAuthorName` | "author name" | `%an` | git-log |
| `placeholderAuthorEmail` | "author email" | `%ae` | git-log |
| `placeholderCommitTime` | "committer date, UNIX timestamp" | `%ct` | git-log |
| `numstatBinary` | "For binary files, outputs two - instead of saying 0 0." | `--numstat` | git-log |
| `zSeparates` | "Separate the commits with NULs instead of newlines." | `-z` | git-log |
| `zNumstat` | "Also, when --raw or --numstat has been given, do not munge pathnames and use NULs as output field terminators." | `-z` | git-log |
| `numstatEntry` | "pathname (possibly with rename/copy information);" | Other diff formats | git-diff |
| `numstatRenameZ` | "a NUL (only exists if renamed/copied);" | Other diff formats | git-diff |
| `renameCompact` | "formats the pathnames compactly by combining common prefix and suffix of the pathnames." | Other diff formats | git-diff |
| `findRenames` | "Detect renames." | `-M` | git-diff |
| `quotePathAlways` | "Double-quotes, backslash and control characters are always escaped regardless of the setting of this variable." | core.quotePath | git-config |
| `quotePathVerbatim` | "Many commands can output pathnames completely verbatim using the -z option." | core.quotePath | git-config |
| `mailmapPurpose` | "it is used to map author and committer names and email addresses to canonical real names and email addresses." | DESCRIPTION | gitmailmap |
| `mailmapCase` | "Both E-Mails and names are matched case-insensitively." | SYNTAX | gitmailmap |
| `truckFactor` | "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." | Abstract | arXiv |
| `truckFactorDefinition` | "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." | Abstract | arXiv |
| `truckFactorNoConsensus` | "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." | Abstract | arXiv |
| `jsonUnpredictable` | "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." | 4. Objects | RFC 8259 |

## What is the tool's own

- The two rules, their numbers and their names (`concentration`, `holders`) are the tool's own. They are not the algorithm of the paper above, which estimates the truck factor of a whole project from the authorship of its files.
- Counting changed lines as added plus deleted, from `--numstat`, is the tool's choice: it is what git reports per file and per commit, and it can be checked by anyone.
- Ending the window at the newest commit, not at the clock, is the tool's choice, so the same history gives the same report.
- Reading the aliases from the configuration rather than from `.mailmap` is the tool's choice; the aliases follow gitmailmap in comparing addresses without case.
