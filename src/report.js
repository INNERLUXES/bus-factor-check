// The three reports: text for a terminal, Markdown for a pull request comment or a job summary, and JSON for other tools.
// Every text from the history (a path, a name, an address) was cleaned by safeText before it reached the report; the
// Markdown report also escapes it, so a path cannot break a table, make a link or be read as HTML. The reports hold no
// clock time and no date: an age is a number of days before the newest commit read.

import { grouped, listText, plural } from './size.js';

export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[[\]`*_]/g, (c) => `\\${c}`)
    .replace(/\r?\n|\r/g, ' ');
}

const days = (n) => (n === null ? 'never' : `${plural(n, 'day')} before the newest commit`);
const shortDays = (n) => (n === null ? '-' : plural(n, 'day'));

function head(r) {
  return `${r.config.file}${r.config.name ? ` (${r.config.name})` : ''}`;
}

function inputLine(r) {
  const what = r.input.kind === 'git' ? 'git history of the working copy' : `saved git log, ${r.input.form === 'z' ? '-z form' : 'readable form'}`;
  return `${r.input.path} (${what}); ${plural(r.window.commitsRead, 'commit')} read`;
}

function windowLine(r) {
  const w = r.window;
  const extra = [];
  if (w.commitsOutside) extra.push(`${grouped(w.commitsOutside)} older`);
  if (w.commitsExcluded) extra.push(`${grouped(w.commitsExcluded)} by excluded authors`);
  return `${plural(w.days, 'day')} up to the newest commit; ${plural(w.commitsCounted, 'commit')} counted${extra.length ? `, ${extra.join(', ')}` : ''}`;
}

function changesLine(r) {
  const t = r.totals;
  return `${plural(t.authors, 'author')}; ${plural(t.lines, 'changed line')} in ${plural(t.files, 'file')} and ${plural(t.folders, 'folder')} to depth ${r.config.folderDepth}`;
}

function repositoryLine(r) {
  const p = r.repository;
  if (!p.top) return 'no changed lines';
  const parts = [`top author ${p.top.author} with ${p.top.share} of the changed lines`];
  if (p.holders) parts.push(`${plural(p.holders.count, 'author')} ${p.holders.count === 1 ? 'is' : 'are'} needed to cover ${p.holders.coverShare} (${listText(p.holders.authors, 5)})`);
  return parts.join('; ');
}

function rulesLine(r) {
  return r.config.rules.map((x) => `${x.id} (${x.level}, ${x.appliesTo.join(' and ')}, at least ${plural(x.minLines, 'changed line')})`).join('; ');
}

function findingsLine(r) {
  const b = r.verdict.byLevel;
  const parts = ['error', 'warning', 'notice'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.findings.length)}${parts.length ? ` (${parts.join(', ')})` : ''}; fail level ${r.verdict.failOn}`;
}

// Pads the columns of a table of text to their widths.
function table(rows) {
  const widths = rows[0].map((_, i) => Math.min(40, Math.max(...rows.map((row) => String(row[i]).length))));
  return rows.map((row) => `  ${row.map((cell, i) => (i === row.length - 1 ? String(cell) : String(cell).padEnd(widths[i]))).join('  ')}`.trimEnd());
}

function unitRow(u, withHolders) {
  const row = [u.path, grouped(u.lines), grouped(u.authors), u.top ? u.top.author : u.lines === 0 && u.binaryChanges ? 'binary only' : '-', u.top ? u.top.share : '-'];
  if (withHolders) row.push(u.holders ? grouped(u.holders.count) : '-');
  row.push(shortDays(u.lastChangeDays));
  return row;
}

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`bus-factor-check: ${head(r)}`);
  out.push(`history: ${inputLine(r)}`);
  out.push(`window: ${windowLine(r)}`);
  out.push(`changes: ${changesLine(r)}`);
  out.push(`repository: ${repositoryLine(r)}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none');
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(13)}  ${f.kind.padEnd(6)}  ${f.path}`);
    const pad = ' '.repeat(11);
    out.push(`${pad}${f.found}`);
    out.push(`${pad}last change ${days(f.lastChangeDays)}`);
    if (explain) {
      out.push(`${pad}rule: ${f.ruleText}`);
      out.push(`${pad}why: ${f.why}`);
      out.push(`${pad}authors of the unit:`);
      for (const line of table(f.byAuthor.map((a) => [`- ${a.author}`, `${grouped(a.lines)} lines`, `(${a.share})`, plural(a.commits, 'commit'), `last change ${shortDays(a.lastChangeDays)} before`]))) out.push(`${pad}${line.slice(2)}`);
      for (const b of f.basis) out.push(`${pad}basis: "${b.text}" (${b.section}, ${b.page})`);
    }
    out.push('');
  }
  if (!r.findings.length) out.push('');
  const withHolders = r.config.rules.some((x) => x.id === 'holders');
  const header = ['FOLDER', 'LINES', 'AUTHORS', 'TOP AUTHOR', 'TOP SHARE', ...(withHolders ? ['HOLDERS'] : []), 'LAST CHANGE'];
  out.push(`Folders (${grouped(r.folders.length)})`, '');
  if (r.folders.length) out.push(...table([header, ...r.folders.map((u) => unitRow(u, withHolders))]));
  else out.push('  none');
  out.push('', `Authors (${grouped(r.authors.length)})`, '');
  if (r.authors.length) out.push(...table(r.authors.map((a) => [a.author, `${grouped(a.lines)} lines`, `${plural(a.commits, 'commit')}${a.emails ? `  ${a.emails.join(', ')}` : ''}`])));
  else out.push('  none');
  out.push('');
  if (explain) {
    out.push(`Files (${grouped(r.files.length)})`, '');
    if (r.files.length) out.push(...table([['FILE', ...header.slice(1)], ...r.files.map((u) => unitRow(u, withHolders))]));
    else out.push('  none');
    out.push('');
  }
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(`RESULT: ${r.verdict.text}`);
  return `${out.join('\n')}\n`;
}

export function toMarkdown(r, { explain = false } = {}) {
  const lines = [`## bus-factor-check: ${r.verdict.text}`, ''];
  lines.push(`- Configuration: ${mdCell(head(r))}`);
  lines.push(`- History: ${mdCell(inputLine(r))}`);
  lines.push(`- Window: ${mdCell(windowLine(r))}`);
  lines.push(`- Changes: ${mdCell(changesLine(r))}`);
  lines.push(`- Repository: ${mdCell(repositoryLine(r))}`);
  lines.push(`- Rules: ${mdCell(rulesLine(r))}`);
  lines.push(`- Findings: ${mdCell(findingsLine(r))}`);
  lines.push('', '### Findings', '');
  if (r.findings.length) {
    lines.push('| Level | Rule | Unit | Found | Last change |', '| --- | --- | --- | --- | --- |');
    for (const f of r.findings) lines.push(`| ${f.level === 'error' ? '**error**' : f.level} | ${f.rule} | ${f.kind} ${mdCell(f.path)} | ${mdCell(f.found)} | ${mdCell(days(f.lastChangeDays))} |`);
  } else lines.push('None.');
  if (explain) {
    for (const f of r.findings) {
      lines.push('', `#### ${f.rule}: ${mdCell(f.path)}`, '');
      lines.push(`- Rule: ${mdCell(f.ruleText)}`, `- Why: ${mdCell(f.why)}`);
      for (const a of f.byAuthor) lines.push(`- ${mdCell(a.author)}: ${grouped(a.lines)} lines (${mdCell(a.share)}), ${plural(a.commits, 'commit')}, last change ${shortDays(a.lastChangeDays)} before the newest commit`);
      for (const b of f.basis) lines.push(`- Basis: ${mdCell(`"${b.text}" (${b.section}, ${b.page})`)}`);
    }
  }
  const withHolders = r.config.rules.some((x) => x.id === 'holders');
  const mdTable = (title, first, units) => {
    lines.push('', `### ${title}`, '');
    if (!units.length) {
      lines.push('None.');
      return;
    }
    const cols = [first, 'Lines', 'Authors', 'Top author', 'Top share', ...(withHolders ? ['Holders'] : []), 'Last change'];
    lines.push(`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`);
    for (const u of units) lines.push(`| ${unitRow(u, withHolders).map(mdCell).join(' | ')} |`);
  };
  mdTable('Folders', 'Folder', r.folders);
  if (explain) mdTable('Files', 'File', r.files);
  lines.push('', '### Authors', '');
  if (r.authors.length) {
    lines.push(`| Author | Lines | Commits${r.showEmails ? ' | Emails' : ''} |`, `| --- | --- | ---${r.showEmails ? ' | ---' : ''} |`);
    for (const a of r.authors) lines.push(`| ${mdCell(a.author)} | ${grouped(a.lines)} | ${grouped(a.commits)}${a.emails ? ` | ${mdCell(a.emails.join(', '))}` : ''} |`);
  } else lines.push('None.');
  if (r.notes.length) {
    lines.push('', '### Notes', '');
    for (const n of r.notes) lines.push(`- ${mdCell(n)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined })) };
  delete out.showEmails;
  return `${JSON.stringify(out, null, 2)}\n`;
}
