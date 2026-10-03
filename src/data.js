// The pages and sentences the tool and its documents rest on. Each sentence comes from a page that is saved, with its
// address on the first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a
// sentence here only after saving the new page text and updating docs/rules-and-sources.md. The code in src/ uses these
// constants and never writes a quoted sentence of its own.

export const SOURCES = [
  { id: 'git-log', file: 'git-log-options.txt', url: 'https://git-scm.com/docs/git-log', label: 'git-log documentation: --since, --no-merges, --format, the placeholders, --numstat and -z' },
  { id: 'git-diff', file: 'git-diff-numstat-format.txt', url: 'https://git-scm.com/docs/git-diff', label: 'git-diff documentation: the --numstat output, with and without -z, and -M' },
  { id: 'git-config', file: 'git-config-core-quotepath.txt', url: 'https://git-scm.com/docs/git-config', label: 'git-config documentation: core.quotePath' },
  { id: 'gitmailmap', file: 'gitmailmap.txt', url: 'https://git-scm.com/docs/gitmailmap', label: 'gitmailmap documentation' },
  { id: 'avelino', file: 'avelino-truck-factor-abstract.txt', url: 'https://arxiv.org/abs/1604.06766', label: 'Avelino, Passos, Hora and Valente, A Novel Approach for Estimating Truck Factors (arXiv:1604.06766)' },
  { id: 'rfc8259', file: 'rfc8259-json-objects.txt', url: 'https://www.rfc-editor.org/rfc/rfc8259', label: 'RFC 8259, The JSON Data Interchange Format' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// Sentences quoted in the reports and the documents. Every text is on its saved page word for word (test/data.test.js
// compares them, with runs of white space read as one space), and holds no year.
export const FACTS = {
  since: { source: 'git-log', section: '--since', text: 'Show commits more recent than <date>.' },
  sinceAsFilter: { source: 'git-log', section: '--since-as-filter', text: 'This visits all commits in the range, rather than stopping at the first commit which is older than <date>.' },
  noMerges: { source: 'git-log', section: '--no-merges', text: 'Do not print commits with more than one parent.' },
  tformat: { source: 'git-log', section: 'tformat:', text: 'In other words, each commit has the message terminator character (usually a newline) appended, rather than a separator placed between entries.' },
  placeholderHash: { source: 'git-log', section: '%H', text: 'commit hash' },
  placeholderAuthorName: { source: 'git-log', section: '%an', text: 'author name' },
  placeholderAuthorEmail: { source: 'git-log', section: '%ae', text: 'author email' },
  placeholderCommitTime: { source: 'git-log', section: '%ct', text: 'committer date, UNIX timestamp' },
  numstatBinary: { source: 'git-log', section: '--numstat', text: 'For binary files, outputs two - instead of saying 0 0.' },
  zSeparates: { source: 'git-log', section: '-z', text: 'Separate the commits with NULs instead of newlines.' },
  zNumstat: { source: 'git-log', section: '-z', text: 'Also, when --raw or --numstat has been given, do not munge pathnames and use NULs as output field terminators.' },
  numstatEntry: { source: 'git-diff', section: 'Other diff formats', text: 'pathname (possibly with rename/copy information);' },
  numstatRenameZ: { source: 'git-diff', section: 'Other diff formats', text: 'a NUL (only exists if renamed/copied);' },
  renameCompact: { source: 'git-diff', section: 'Other diff formats', text: 'formats the pathnames compactly by combining common prefix and suffix of the pathnames.' },
  findRenames: { source: 'git-diff', section: '-M', text: 'Detect renames.' },
  quotePathAlways: { source: 'git-config', section: 'core.quotePath', text: 'Double-quotes, backslash and control characters are always escaped regardless of the setting of this variable.' },
  quotePathVerbatim: { source: 'git-config', section: 'core.quotePath', text: 'Many commands can output pathnames completely verbatim using the -z option.' },
  mailmapPurpose: { source: 'gitmailmap', section: 'DESCRIPTION', text: 'it is used to map author and committer names and email addresses to canonical real names and email addresses.' },
  mailmapCase: { source: 'gitmailmap', section: 'SYNTAX', text: 'Both E-Mails and names are matched case-insensitively.' },
  truckFactor: { source: 'avelino', section: 'Abstract', text: 'Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments.' },
  truckFactorDefinition: { source: 'avelino', section: 'Abstract', text: 'It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated.' },
  truckFactorNoConsensus: { source: 'avelino', section: 'Abstract', text: 'Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild.' },
  jsonUnpredictable: { source: 'rfc8259', section: '4. Objects', text: 'When the names within an object are not unique, the behavior of software that receives such an object is unpredictable.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;

// The levels of a finding, from the lowest. A finding fails the run when its level is the fail level or above.
export const LEVELS = ['notice', 'warning', 'error'];

// The two kinds of unit a rule can look at.
export const UNIT_KINDS = ['files', 'folders'];
