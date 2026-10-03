# Limits

## Lines, not knowledge

The tool counts the lines people changed. Knowledge is more than that, and the numbers miss it in known ways:

- A person who reviews every change to a folder, pairs on it or designed it knows it, and is not counted. A person who wrote a folder before the window started is not counted either.
- A person who ran a formatter, renamed a symbol across the code base or moved code within a file is counted for every line it touched. Lines deleted count as much as lines added.
- Files that a build writes and that are committed, lock files, vendored code and data files add lines. Leave them out with `ignore`.
- A binary file adds a commit and no line, so a folder of images has no share to compare.
- A rule says where knowledge looks concentrated; it does not say that the person is the only one who could change the code, nor that the code matters.

## What the history cannot show

- **Squash merges** put the work of everyone on a branch under the author of the squash commit. **Merge commits** are not read; a change made only in a merge, such as the resolution of a conflict, is not counted.
- **Co-authors** named in a commit message are not read; only the author of the commit is.
- **Commits from several addresses** count as several people unless `authors.aliases` joins them. The tool does not read `.mailmap`.
- **A shallow clone** holds part of the history; the report is about that part. In GitHub Actions, check out with `fetch-depth: 0`.
- **Rewritten history**: a rebase keeps the author and may change the committer time, which the window uses.
- **Renames** are found by git with `-M` and its default similarity. A file moved and rewritten at once may be read as one file deleted and another added, and its history then stays on the old path. Copies are not followed. When an old path was renamed twice in the window, to two different files, the newest rename wins.
- **Deleted files** still count for their folders: the knowledge of the code removed counted while it was there. A deleted file is listed with its old path.
- **The readable form of a saved log** cannot tell a file name that holds ` => ` or braces from a rename; the `-z` form, which the tool uses when it runs git, is exact.
- **The window** ends at the newest commit read. A repository with a commit whose committer time is in the future, by a clock that was wrong, moves the whole window.

## Size and counts

| Limit | Value |
| --- | --- |
| output of git, or a saved log | 256 MB |
| time of one run of git | 300 seconds |
| configuration file | 1 MB |
| commits | 1,000,000 |
| file entries | 5,000,000 |
| length of a path | 4,096 characters |
| length of an author name | 256 characters |
| length of an address | 320 characters |
| a count of lines in one entry | nine digits |
| `window.days` | 1 to 36,500 |
| `folders.depth` | 1 to 16 |
| patterns in one list | 100, each at most 200 characters and 16 parts |
| aliases | 1,000, each with at most 50 addresses |
| JSON nesting of the configuration | 32 levels |

Past a limit the input is refused with exit code `2`, never read in part.
