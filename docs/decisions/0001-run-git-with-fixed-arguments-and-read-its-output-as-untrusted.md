# 1. Run git with fixed arguments, and read its output as untrusted

## Context

The tool needs the history of a repository: for each commit, its author, its time and the lines it changed per file. git has that history, and `git log --numstat` prints it. There are three ways to get it: a git library, a reader of the object store written for the tool, or the git binary.

A library is a dependency, and the tool has none. A reader of the object store would have to understand packs, deltas, and the rename detection of git, and would still be wrong where git is right. The git binary is installed wherever a repository is checked out, and its output is documented.

Running a program is where command injection lives. A folder can be named `$(touch x)` or `--output=/tmp/x`; a repository can name a pager, an external diff program or a conversion filter in its configuration; the environment can point git at another repository. And the output of git is text written by everyone who ever committed: any author name, any address, any file name, including tabs, newlines, quotes and control characters.

## Decision

The tool starts one program, git, from one file, `src/git.js`, through `execFile` with `shell: false`. The arguments are fixed lists in that file. The folder of the repository is the working folder of the process and never an argument. The only value worked out at run time is the start of the window, a whole number of seconds, and every list ends with `--`. `--no-pager`, `--no-ext-diff`, `--no-textconv` and `--no-show-signature` keep the configuration of the repository from running a program, and the environment of git loses the variables that redirect it or add configuration.

The output is read as bytes, capped in size and time, in the `-z` form, where git writes path names verbatim and ends each field with a NUL. A header of three lines in a fixed format starts each commit. The tool's own reader checks every field and stops at the first one that does not fit, with its record. The same reader takes a log saved with the same command, in the `-z` form or the readable one, so the tool can run without git and a test can run without git.

The window ends at the newest commit read, and the tool also checks the time of every commit itself, so a saved log of the whole history and a run of git give the same numbers.

## Consequences

No folder name, file name or author name can reach a command line, and no configuration of the repository runs a program through the tool. The tool still trusts the git binary of the machine. The reader is small and strict; a log saved in another format is refused rather than guessed at. The readable form of a saved log cannot tell a file name holding ` => ` from a rename; the `-z` form can, and it is what the tool uses itself. docs/threat-model.md lists the attacks and the tests that check each control.
