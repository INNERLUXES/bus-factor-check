# Threat model

## What the tool touches

- It reads the configuration file, and either a saved log named with `--log` or the history of the folder named with `--repo`. Nothing else is opened.
- With `--repo` it looks at `.git` in the folder with `lstat`, without following a link, and starts one program, git, twice. It reads no file of the working tree.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, evaluates nothing it reads, and runs no program but git.

## What the input may hold

The history of a repository is written by everyone who ever committed to it, and anyone can write any author name, any address and any file name into a commit. A repository cloned from elsewhere, a fork, or a log someone sent you is hostile data. Its `.git/config` can name a pager, an external diff program, a text conversion filter, hooks and aliases. The configuration lives in your repository, so a change to it is a change to the check.

Through the history, an attacker can try to:

- make the tool run a program of their choosing: a folder or a file named like a shell command (`$(touch x)`, `; rm -rf`), a folder name that starts with `--` to be read as an option of git (option injection), or a configuration of the repository that names a pager (`core.pager`), an external diff program (`diff.external`), a text conversion filter (`diff.<driver>.textconv`) or a signature program;
- point git at another repository or add configuration through the environment (`GIT_DIR`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`);
- make the reader fail open or read a path out of the repository: a log with absolute paths, `..` parts, a quoted path that never closes, an escape git never writes, a header in another form, a count that is not a number, a binary marker on one side only;
- exhaust the memory or the time: a log of gigabytes, millions of commits or entries, a path, a name or an address of megabytes, a million braces or arrows in one path, a configuration nested thousands deep or with a number of hundreds of digits, a pattern of sixteen `**` parts against a path of thousands of parts;
- rewrite the terminal, break a Markdown table or make a link: control characters, ANSI escapes, direction controls and line separators in a name or a path, and pipes, brackets and angle brackets that a Markdown table would render;
- change how objects behave: an author, an address, a path or an alias named `__proto__`, `constructor` or `toString`;
- move the verdict: an address written in another case to look like a second person, a bot that edits a folder to make it look shared, a key named twice in the configuration, a share written as 79.99999 to round up to 80;
- leak personal data: a report posted in a public place with the email addresses of every author.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A folder or file name runs a command | No shell is ever used: git is started with `execFile` and `shell: false`, and the folder is the working folder of the process, never part of a command line. A test names a repository folder `repo $(touch pwned) ; echo hi`, runs the tool on it with a real git and checks that no file appears |
| A folder name is read by git as an option (option injection) | No name or path from the input is ever an argument of git. The arguments are fixed lists in `src/git.js`, and every list ends with `--`. A test records the arguments of every call and checks them |
| The repository configuration runs a program: `core.pager`, `diff.external`, a textconv driver, a signature check | `--no-pager`, `--no-ext-diff`, `--no-textconv` and `--no-show-signature` on every run; `git log` runs no hooks; git is never given a terminal. The tool does trust the git binary on the machine, and git's own handling of a repository it has not cloned (such as `safe.directory`) |
| The environment points git at another repository or adds configuration | `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, `GIT_EXTERNAL_DIFF`, `GIT_PAGER`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n`, `GIT_DIFF_OPTS`, `GIT_EXEC_PATH`, `GIT_SSH_COMMAND`, `GIT_ASKPASS` and `GIT_TRACE*` are removed from the environment of git. A test checks the list |
| A `.git` that is a symbolic link leads to another history | `.git` is looked at with `lstat` and a symbolic link is refused (a test, guarded by the system) |
| A path in the log points out of the repository | The reader refuses a path that is empty, absolute or has an empty, `.` or `..` part, with its line or record; a report never shows such a path |
| A log that is not the output of the fixed command is half read | The header has a fixed form, every count and path is checked, and anything else stops the run with exit code `2` and no verdict |
| The output of git or a saved log exhausts the memory | git output and a saved log are capped at 256 MB, the run of git at 300 seconds; commits, entries, paths, names and addresses are capped; past a cap the input is refused |
| Work grows faster than the input | The reader reads each field once; a rename is found with one `indexOf` and one `lastIndexOf`; a quoted path is read once; the pattern matcher does at most parts of the pattern times parts of the path; people, files and folders are maps. Tests read a hundred thousand commits and a path of a million braces with a time check |
| A pattern from the configuration is slow | No regular expression is built from the configuration or the history; patterns are matched by the tool's own matcher |
| Text from the history rewrites the terminal or breaks a Markdown table | Every text from the history goes through `safeText`, which removes control, line separator and direction characters and caps the length; Markdown cells escape the characters a table or a link needs. Tests put ANSI escapes and direction controls in names, addresses and paths |
| `__proto__` in a name changes how objects behave | People, files and folders are kept in maps; the JSON reader defines own properties. A test names an author, an address, an alias and a folder `__proto__` and `constructor` |
| A key named twice moves the verdict | The JSON reader refuses an object that names a key twice, as RFC 8259 says the behavior of software that receives one is unpredictable |
| A share just under a limit is read as the limit | Shares are compared in whole numbers, a limit has at most four decimals, and a share is shown cut down |
| One person looks like two, or a bot makes a folder look shared | Addresses are compared without case; `authors.aliases` joins addresses and `authors.exclude` leaves bots out, both under review in the configuration |
| Email addresses are posted with a report | Addresses are personal data and are hidden in every format unless `--show-emails` is given (docs/secure-defaults.md) |

## Out of scope

Whether the numbers mean what a team thinks they mean (docs/limits.md), the safety of the git binary and of the machine that runs it, who may change the configuration in your repository, how your pipeline stores and posts the reports, and the law that applies to the personal data in a commit history.
