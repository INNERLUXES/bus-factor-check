# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "bus-factor-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up input that shows the problem: a saved log, a configuration, or the commands that build a small repository, what you expected and what happened. Use made-up names and addresses on `example.com`, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- a folder name, a file name, an author name, an address or a configuration that makes the tool start a program other than git, pass text of its own choosing to git as an argument, or run git through a shell
- a configuration of the repository or of the environment that makes the tool's run of git start a pager, an external diff program, a conversion filter or a signature program, read another repository, or write anything
- a `.git` or a folder that makes the tool read the history of another folder, or read any file of the working tree
- a log that the tool reads in part, or with a wrong count, instead of refusing it; a path in a report that points out of the repository
- an input that makes the tool hang, take very long, or use unbounded memory, such as a very large log, very many commits, entries or authors, a very long path, name or address, a quoted path that is never closed, a configuration nested very deep, or a pattern built to be slow
- text from a name, an address or a path that breaks a Markdown table, rewrites the terminal through control or direction characters, or is shown unescaped in a report
- a name such as `__proto__` that changes how objects behave inside the tool
- an email address in a report made without `--show-emails`
- a finding reported when the numbers are on the wrong side of a limit of the configuration, a share just under a limit treated as the limit, or a finding missed when they are on the right side
- a sentence in src/data.js that differs from the saved page in research/sources

Out of scope: whether lines changed measure knowledge (docs/limits.md lists what the tool cannot see), the safety of the git binary itself, who may change the configuration in your repository, and how your pipeline stores and posts the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
