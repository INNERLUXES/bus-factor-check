import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, GIT_FIXED, LEVELS, LOG_FORMAT, SOURCES, UNIT_KINDS, factPage, flat, source } from '../src/index.js';

// These tests read the saved pages again and compare them with src/data.js: every sentence that a report or a document
// quotes, and every option and placeholder of the fixed git command.

const text = async (id) => readFile(new URL(`../research/sources/${source(id).file}`, import.meta.url), 'utf8');
const has = (page, needle) => flat(page).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['gene', 'rated'].join('')}|${['assis', 'tants?'].join('')}|${['g', 'pt'].join('')}|${['l', 'lms?'].join('')})\\b|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ses', 'sion'].join('')}`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;

test('sources: every saved page has its address on the first line, as listed in src/data.js, and holds text', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.equal(page.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(page.length > 200, `${s.file} holds the page text`);
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9/._-]*$/);
  }
  for (const key of ['url', 'file', 'id']) assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s[key])).size, key);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(new URL('../research/sources/', import.meta.url))).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
  assert.deepEqual([...new Set(SOURCES.map((s) => new URL(s.url).host))].sort(), ['arxiv.org', 'git-scm.com', 'www.rfc-editor.org']);
});

test('sources: no saved page holds a year, a mention of a tool that wrote it, a control byte, a carriage return or a character that is not ASCII', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.doesNotMatch(page, YEAR, s.file);
    assert.doesNotMatch(page, WRITTEN, s.file);
    assert.doesNotMatch(page, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!page.includes('\r'), s.file);
    assert.ok([...page].every((c) => c.charCodeAt(0) < 128), s.file);
    assert.ok(page.endsWith('\n'), s.file);
  }
});

test('facts: every quoted sentence is on its saved page, word for word, under the section it names', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    const page = await text(fact.source);
    assert.ok(has(page, fact.text), `${key}: "${fact.text}" is not on ${source(fact.source).file}`);
    assert.ok(has(page, fact.section), `${key}: the section ${fact.section}`);
    assert.doesNotMatch(fact.text, YEAR, key);
    assert.equal(factPage(key), source(fact.source).url);
  }
});

test('the saved git-log page names every option and placeholder of the fixed command', async () => {
  const log = await text('git-log');
  const diff = await text('git-diff');
  for (const option of ['--since=<date>', '--no-merges', '--format=<format>', '--numstat', '-z', 'tformat:', '--use-mailmap']) assert.ok(log.includes(`\n${option}\n`), option);
  for (const placeholder of ['%H', '%ct', '%ae', '%an', '%n']) {
    assert.ok(log.includes(`\n${placeholder}\n`), placeholder);
    assert.ok(LOG_FORMAT.includes(placeholder), placeholder);
  }
  assert.ok(diff.includes('3\t1\tarch/{i386 => x86}/Makefile'), 'the compact rename of --numstat');
  assert.ok(diff.includes('3\t1\tNUL arch/i386/Makefile NUL arch/x86/Makefile NUL'), 'the rename of --numstat with -z');
  assert.ok(diff.includes('\n-M[<n>]\n'));
  assert.ok(GIT_FIXED.includes('--no-merges'));
});

test('the saved pages say what the reader and the aliases rely on: quoting, the case of addresses, the truck factor', async () => {
  assert.ok(has(await text('git-config'), 'quote "unusual" characters in the pathname by enclosing the pathname in double-quotes and escaping those characters with backslashes in the same way C escapes control characters'));
  assert.ok(has(await text('gitmailmap'), 'Both E-Mails and names are matched case-insensitively.'));
  const paper = await text('avelino');
  assert.ok(paper.includes('Title: A Novel Approach for Estimating Truck Factors'));
  assert.ok(paper.includes('Authors: Guilherme Avelino, Leonardo Passos, Andre Hora, Marco Tulio Valente'));
  assert.ok(has(await text('rfc8259'), FACTS.jsonUnpredictable.text));
});

test('levels and kinds: three levels from the lowest, and the two kinds of unit', () => {
  assert.deepEqual(LEVELS, ['notice', 'warning', 'error']);
  assert.deepEqual(UNIT_KINDS, ['files', 'folders']);
});
