# Inputs

The tool reads two things: a configuration file, and the history of a repository, either from git (`--repo`) or from a saved log (`--log`). It reads no file of the working tree.

## The command line

```
bus-factor-check --config <file> (--repo <folder> | --log <file>) [--format text|markdown|json] [--explain] [--show-emails] [--fail-on notice|warning|error]
```

Give `--repo` or `--log`, not both. A path that looks like an address (`https://...`) is refused: the tool never fetches anything. `-` for standard input is refused. Each option that takes a value takes it once, except `--format`, where the last one wins.

## The repository

`--repo` names the top folder of a git working copy: the folder that holds `.git`. `.git` may be a folder, or the file that git writes for a worktree or a submodule; a `.git` that is a symbolic link is refused, so the history read is the history of the folder you named. A folder below the top is refused, because git would read the history of the whole repository from there and the paths would not start where you expect.

The tool then runs git twice in that folder, through `execFile`, with no shell, with these fixed arguments:

```
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --format=tformat:%ct --
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --numstat -z -M --since=@<start> "--format=tformat:commit %H %ct%nemail %ae%nname %an" --
```

The first run gives the committer time of every commit; the newest one ends the window. `<start>` is that time minus `window.days` days, in seconds, worked out by the tool; it is the only value in the arguments that is not written in `src/git.js`, and it is always a whole number. The folder is the working folder of the process, never an argument. The output is limited to 256 MB and the run to 300 seconds. The environment of git loses the variables that would point it at another repository, another index, configuration given on the command line, a pager or an external diff program (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT` and the `GIT_CONFIG_KEY_n` and `GIT_CONFIG_VALUE_n` it names, `GIT_PAGER`, `GIT_EXTERNAL_DIFF` and a few more listed in `src/git.js`), and gets `GIT_TERMINAL_PROMPT=0` and `GIT_OPTIONAL_LOCKS=0`.

Each option has a reason:

| Option | Why |
| --- | --- |
| `--no-pager` | git writes to the tool, never to a pager a configuration names |
| `--no-merges` | "Do not print commits with more than one parent." A merge repeats the changes of its branch |
| `--no-color` | no colour codes in the output, whatever `color.ui` says |
| `--no-ext-diff`, `--no-textconv` | no external diff program and no conversion filter of the repository is run |
| `--no-show-signature` | no signature check, and no text of it in the output |
| `--no-relative` | paths from the top of the repository, whatever `diff.relative` says |
| `--encoding=UTF-8` | names in UTF-8, whatever `i18n.logOutputEncoding` says |
| `--numstat` | the lines added and deleted per file; "For binary files, outputs two - instead of saying 0 0." |
| `-z` | "do not munge pathnames and use NULs as output field terminators" |
| `-M` | "Detect renames.", so a moved file keeps its history |
| `--since=@<start>` | only the commits of the window are read |
| `--format=tformat:...` | the fixed header of each commit: `%H` commit hash, `%ct` "committer date, UNIX timestamp", `%ae` author email, `%an` author name |
| `--` | nothing after it can be read as an option or a revision |

## A saved log

`--log` names a file saved with the same command. In the exact form, with `-z`:

```
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --numstat -z -M "--format=tformat:commit %H %ct%nemail %ae%nname %an" -- > history.log
```

Or in the readable form, as in the example:

```
git --no-pager log --no-merges --no-color --no-ext-diff --no-textconv --no-show-signature --no-relative --encoding=UTF-8 --numstat -M "--format=tformat:commit %H %ct%nemail %ae%nname %an" -- > history.log
```

A log that holds a NUL byte is read as the `-z` form; any other log as the readable form. The saved log may hold the whole history: the tool applies the window itself, from the newest commit in the file. Save it in the order git writes it, newest commit first, because renames are followed from the newest commit back; do not add `--reverse`.

Each commit is a header of three lines and then one entry per file:

```
commit <40 or 64 hexadecimal digits> <seconds>
email <address>
name <name>

<added>	<deleted>	<path>
```

In the readable form git quotes a path with unusual characters: the saved page of `core.quotePath` says "Double-quotes, backslash and control characters are always escaped regardless of the setting of this variable." The reader takes the C escapes (`\a \b \t \n \v \f \r \" \\`) and three octal digits for a byte, and reads the bytes as UTF-8. A rename is `old => new`, each side quoted when it needs to be, or, when neither needs quotes, with the common part outside braces: `src/{old => new}/file.js`, where an empty side leaves one slash (`src/{ => api}/a.js` is `src/a.js` moved to `src/api/a.js`). In the `-z` form a rename is an empty path and then the old and the new name, each ended by a NUL, as the saved page of git-diff shows: `3	1	NUL arch/i386/Makefile NUL arch/x86/Makefile NUL`.

A log is refused, with its line (readable form) or its record (`-z` form), when a header does not have the fixed form, an entry does not have two counts and a path, a count is not a whole number of at most nine digits or `-`, only one count is `-`, a path is empty, starts with `/`, or has an empty, `.` or `..` part, a quoted path is not closed or has an escape git does not write, or a file entry comes before the first header. A log with no commit is refused. Lines may end with LF or CR LF.

## The configuration file

A JSON object, read by the tool's strict reader: no comments, no trailing comma, and an object that names a key twice is refused, because RFC 8259 says "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." Every key the tool does not know is an error, with a suggestion when it is close to a known key.

| Key | Value |
| --- | --- |
| `name` | a name shown in the header of the report; optional |
| `window` | an object; needed |
| `window.days` | the days of history to read, ending at the newest commit: a whole number from 1 to 36500; needed |
| `folders` | an object; optional |
| `folders.depth` | how deep folders are reported: 1 is the top folders, 2 also the folders inside them, up to 16 |
| `authors` | an object; optional |
| `authors.aliases` | a list of `{ "name": ..., "emails": [...] }`: one person, the name shown, and every address that person commits with. Addresses are compared without case; an address on two aliases, or a name on two aliases, is refused |
| `authors.exclude` | a list of patterns of addresses whose commits are not counted, such as bots: `*-bot@example.com`, `*[bot]@*`. Compared without case |
| `ignore` | a list of patterns of paths whose changes are not counted, such as `docs/**` or `**/*.lock`. A path is matched at its newest name |
| `rules` | an object with at least one rule; needed |
| `rules.concentration` | the concentration rule, see docs/method.md |
| `rules.concentration.minTopShare` | the share of changed lines, in percent with at most four decimals, that the top author must reach; needed by the rule |
| `rules.concentration.maxOtherAuthors` | the most other authors a unit may have and still be a finding; needed by the rule |
| `rules.concentration.minLines` | the least changed lines a unit needs before the rule looks at it |
| `rules.concentration.level` | `notice`, `warning` or `error` |
| `rules.concentration.appliesTo` | a list of `folders`, `files` or both |
| `rules.holders` | the holders rule, see docs/method.md |
| `rules.holders.coverShare` | the share of changed lines, in percent above 0 with at most four decimals, that the holders must cover; needed by the rule |
| `rules.holders.maxHolders` | the most holders a unit may have and still be a finding; needed by the rule |
| `rules.holders.minLines` | as for concentration |
| `rules.holders.level` | as for concentration |
| `rules.holders.appliesTo` | as for concentration |
| `failOn` | the lowest level that fails the run; `--fail-on` overrides it |

Patterns have three wildcards and nothing else: `*` is any run of characters inside one part, `?` is one character inside a part, and a part that is exactly `**` is any number of parts, none included. They are matched without a regular expression. A pattern with a backslash, a leading slash or a control character is refused, and a list holds at most 100 patterns. An address holds no slash, so a pattern of addresses is one part.

## Defaults

None of the defaults is a threshold of a rule: every number a rule compares with a unit (`minTopShare`, `maxOtherAuthors`, `coverShare`, `maxHolders`) must be written in the configuration.

| Key | Default | Why |
| --- | --- | --- |
| `folders.depth` | `2` | the top folders and the folders inside them are, in most repositories, the parts a team owns; deeper folders split the same work into units too small to read |
| `rules.<rule>.appliesTo` | `folders` | knowledge is spread across a part of the code, not file by file; a file with one author is common and often fine |
| `rules.<rule>.level` | `warning` | a finding is something to look at; making it an error is your choice |
| `rules.<rule>.minLines` | `1` | a unit with no changed line has no share to compare; any other number would be a threshold of the tool's own |
| `failOn` | `warning` | with the default level, a finding fails the run; a lower level, `notice`, never does unless you ask |

## The example

[examples/config.json](../examples/config.json) reads 120 days of the storefront, folders to depth 2, joins two addresses of one person, leaves out a bot and the docs folder, makes a concentrated folder an error and a folder with one holder of half the lines a warning, and fails on errors only.
