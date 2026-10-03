import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE, atLeast, atMost, displayPath, fileError, grouped, lineStarts, listText, parseSize, percentText, plural, positionOf, readBounded, safeText, scaledPercent, sizeText, thresholdText } from '../src/index.js';
import { resolve } from 'node:path';
import { withFiles } from './helpers.js';

// The small helpers: numbers and sizes, exact shares, text cleaning, lines and columns, and paths as reports show them.

test('ratio: percentages as whole numbers, compared by multiplying, shown cut down and never rounded up', () => {
  assert.equal(SCALE, 10000);
  assert.equal(scaledPercent(80), 800000);
  assert.equal(scaledPercent(99.9), 999000);
  assert.equal(scaledPercent(80.00001), null);
  assert.equal(scaledPercent(-1), null);
  assert.equal(scaledPercent(101), null);
  assert.equal(scaledPercent('80'), null);
  assert.ok(atLeast(80, 100, scaledPercent(80)));
  assert.ok(!atLeast(7999, 10000, scaledPercent(80)));
  assert.ok(atMost(80, 100, scaledPercent(80)));
  assert.ok(!atMost(8001, 10000, scaledPercent(80)));
  assert.equal(percentText(2, 3), '66.66%');
  assert.equal(percentText(1, 1), '100%');
  assert.equal(percentText(1, 0), 'n/a');
  assert.equal(thresholdText(scaledPercent(50.5)), '50.5%');
});

test('size: grouped numbers, sizes, lists and plurals', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(parseSize('3K'), 3072);
  assert.equal(parseSize('0x10'), 16);
  assert.equal(parseSize('x'), null);
  assert.equal(sizeText(3072), '3 KB');
  assert.equal(sizeText(3145728), '3 MB');
  assert.equal(sizeText(10), '10 bytes');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(plural(1, 'day'), '1 day');
  assert.equal(plural(2, 'day'), '2 days');
});

test('text: control, line separator and direction characters become spaces; long text is cut', () => {
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d`), 'a b c d');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
});

test('lines: LF, CRLF and a lone CR each end a line; positions count from 1', () => {
  const starts = lineStarts('a\nb\r\nc\rd');
  assert.deepEqual(starts, [0, 2, 5, 7]);
  assert.deepEqual(positionOf(starts, 6), { line: 3, column: 2 });
});

test('files: a path relative to the base with forward slashes, and an error that names the file', async () => {
  const base = resolve('base');
  assert.equal(displayPath(resolve(base, 'a/b.log'), base), 'a/b.log');
  assert.equal(displayPath(base, base), '.');
  assert.ok(displayPath(resolve(base, '../x.log'), base).endsWith('/x.log'));
  assert.equal(fileError('a.log', 'why').message, 'a.log: why');
  await withFiles({ 'a.txt': 'hello' }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.txt'), 10)).toString(), 'hello');
    await assert.rejects(readBounded(resolve(dir, 'a.txt'), 2), /5 bytes is over the 2 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'none.txt'), 2), /no such file/);
    await assert.rejects(readBounded(dir, 2), /not a regular file|cannot be read/);
  });
});
