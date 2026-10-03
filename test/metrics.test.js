import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, analyze, atOrAbove, byText, daysBefore, decide, evaluate, foldersOf, holders, identify, labelPeople, rankAuthors, ruleById, RULES, scaledPercent } from '../src/index.js';
import { BASE_CONFIG, configOf, dayTime } from './helpers.js';

// The numbers of the files and folders, and the rules over them. Every history here is small enough to work out by hand,
// and every rule has a near miss on each side of its limit.

let n = 0;
// A commit as the log reader gives it. changes: [path, added, deleted] or [path, added, deleted, from]; added null is
// binary.
function commit(day, email, changes, name = email.split('@')[0]) {
  n += 1;
  return { hash: String(n % 10).repeat(40), time: dayTime(day), email, name, changes: changes.map(([path, added, deleted, from]) => ({ path, added, deleted: added === null ? null : deleted, from: from ?? null })) };
}

const config = (parts = {}) => configOf({ ...BASE_CONFIG, ...parts });
const unitOf = (a, path) => a.folders.get(path) ?? a.files.get(path);

test('identify: an alias joins addresses without case; a pattern of authors.exclude leaves a bot out', () => {
  const c = config({ authors: { aliases: [{ name: 'Lena Ortiz', emails: ['lena@example.com', 'L.Ortiz@old.example.com'] }], exclude: ['*[bot]@*', 'ci@example.com'] } });
  assert.deepEqual(identify('l.ortiz@OLD.example.com', c), { key: 'alias:0', alias: 'Lena Ortiz', excluded: false });
  assert.deepEqual(identify('Ravi@Example.com', c), { key: 'email:ravi@example.com', alias: null, excluded: false });
  assert.equal(identify('dependabot[bot]@users.noreply.example', c).excluded, true);
  assert.equal(identify('CI@example.com', c).excluded, true);
  assert.equal(identify('cia@example.com', c).excluded, false);
});

test('foldersOf: the folders of a path from the top, down to the depth; a file at the top has none', () => {
  assert.deepEqual(foldersOf('a/b/c/d.js', 2), ['a', 'a/b']);
  assert.deepEqual(foldersOf('a/b/c/d.js', 5), ['a', 'a/b', 'a/b/c']);
  assert.deepEqual(foldersOf('a/d.js', 2), ['a']);
  assert.deepEqual(foldersOf('README.md', 2), []);
});

test('analyze: changed lines are added plus deleted, per author, per file and per folder; commits are counted once per unit', () => {
  const a = analyze([
    commit(10, 'bo@example.com', [['src/api/b.js', 5, 1], ['src/api/c.js', 2, 2]]),
    commit(9, 'ann@example.com', [['src/api/b.js', 10, 0], ['src/ui/d.js', 4, 0], ['README.md', 1, 0]])
  ], config());
  const api = unitOf(a, 'src/api');
  assert.equal(api.lines, 20);
  assert.equal(api.added, 17);
  assert.equal(api.deleted, 3);
  assert.equal(api.commits, 2);
  assert.equal(unitOf(a, 'src').commits, 2);
  assert.equal(unitOf(a, 'src').lines, 24);
  assert.equal(a.repository.lines, 25);
  assert.equal(a.files.size, 4);
  assert.deepEqual([...a.folders.keys()].sort(), ['src', 'src/api', 'src/ui']);
  const ranked = rankAuthors(api, a.people);
  assert.deepEqual(ranked.map((r) => [r.label, r.lines, r.commits]), [['ann', 10, 1], ['bo', 10, 1]]);
  assert.equal(a.newest, dayTime(10));
});

test('analyze: the window ends at the newest commit; a commit exactly window.days before it is in, one second older is out', () => {
  const edge = commit(0, 'old@example.com', [['a.js', 1, 0]]);
  edge.time = dayTime(100) - 100 * DAY;
  const older = commit(0, 'older@example.com', [['a.js', 1, 0]]);
  older.time = dayTime(100) - 100 * DAY - 1;
  const a = analyze([commit(100, 'new@example.com', [['a.js', 1, 0]]), edge, older], config());
  assert.equal(a.counts.inWindow, 2);
  assert.equal(a.counts.outside, 1);
  assert.deepEqual([...a.people.values()].map((p) => p.label).sort(), ['new', 'old']);
});

test('analyze: renames are followed back through the log, in chains, so older changes count on the newest path', () => {
  const a = analyze([
    commit(30, 'c@example.com', [['src/final.js', 1, 0, 'src/middle.js']]),
    commit(20, 'b@example.com', [['src/middle.js', 2, 0, 'lib/first.js']]),
    commit(10, 'a@example.com', [['lib/first.js', 4, 0]])
  ], config());
  assert.deepEqual([...a.files.keys()], ['src/final.js']);
  assert.equal(a.files.get('src/final.js').lines, 7);
  assert.equal(a.folders.has('lib'), false);
  assert.equal(a.counts.renames, 2);
});

test('analyze: a new file at an old path after a rename is its own file; older changes go to the renamed file', () => {
  const a = analyze([
    commit(30, 'c@example.com', [['a.js', 3, 0]]),
    commit(20, 'b@example.com', [['b.js', 0, 0, 'a.js']]),
    commit(10, 'a@example.com', [['a.js', 5, 0]])
  ], config());
  assert.equal(a.files.get('a.js').lines, 3);
  assert.equal(a.files.get('b.js').lines, 5);
});

test('analyze: binary changes add a commit and no line; ignored paths and excluded authors are left out and counted', () => {
  const a = analyze([
    commit(10, 'ann@example.com', [['assets/logo.png', null], ['docs/guide.md', 9, 0], ['src/a.js', 2, 0]]),
    commit(9, 'build-bot@example.com', [['src/a.js', 50, 0]])
  ], config({ ignore: ['docs/**'], authors: { exclude: ['*-bot@example.com'] } }));
  const logo = a.files.get('assets/logo.png');
  assert.equal(logo.lines, 0);
  assert.equal(logo.binary, 1);
  assert.equal(logo.commits, 1);
  assert.equal(a.files.has('docs/guide.md'), false);
  assert.equal(a.files.get('src/a.js').lines, 2);
  assert.deepEqual([a.counts.binary, a.counts.ignoredChanges, a.counts.ignoredPaths, a.counts.excluded, a.counts.inWindow], [1, 1, 1, 1, 1]);
});

test('labels: the alias, else the newest name; two people with one name are told apart, the same way on every machine', () => {
  const a = analyze([
    commit(10, 'sam@a.example', [['x.js', 1, 0]], 'Sam'),
    commit(9, 'sam@b.example', [['x.js', 1, 0]], 'Sam'),
    commit(8, 'sam@a.example', [['x.js', 1, 0]], 'Samuel Old'),
    commit(7, 'lo@example.com', [['x.js', 1, 0]], 'L. O.'),
    commit(6, 'x@example.com', [['x.js', 1, 0]], '   ')
  ], config({ authors: { aliases: [{ name: 'Lena Ortiz', emails: ['lo@example.com'] }] } }));
  assert.deepEqual([...a.people.values()].map((p) => [p.key, p.label]).sort((x, y) => byText(x[0], y[0])), [['alias:0', 'Lena Ortiz'], ['email:sam@a.example', 'Sam'], ['email:sam@b.example', 'Sam (2)'], ['email:x@example.com', '(no name)']]);
  const people = labelPeople(new Map([['k2', { key: 'k2', name: 'Al' }], ['k1', { key: 'k1', name: 'al' }]]));
  assert.equal(people.get('k1').label, 'al');
  assert.equal(people.get('k2').label, 'Al (2)');
});

test('holders: the fewest authors who reach the share, taken from the top, in whole numbers', () => {
  const ranked = [{ lines: 50 }, { lines: 30 }, { lines: 20 }];
  assert.equal(holders(ranked, 100, scaledPercent(50)).count, 1);
  assert.equal(holders(ranked, 100, scaledPercent(50.0001)).count, 2);
  assert.equal(holders(ranked, 100, scaledPercent(80)).count, 2);
  assert.equal(holders(ranked, 100, scaledPercent(80.0001)).count, 3);
  assert.equal(holders(ranked, 100, scaledPercent(100)).count, 3);
  assert.equal(holders([{ lines: 1 }, { lines: 1 }, { lines: 1 }], 3, scaledPercent(66.6667)).count, 3);
  assert.equal(holders([{ lines: 1 }, { lines: 1 }, { lines: 1 }], 3, scaledPercent(66.6666)).count, 2);
  assert.equal(holders([], 0, scaledPercent(50)), null);
});

test('daysBefore: whole days, rounded down', () => {
  assert.equal(daysBefore(dayTime(10), dayTime(10)), 0);
  assert.equal(daysBefore(dayTime(10), dayTime(9) + 1), 0);
  assert.equal(daysBefore(dayTime(10), dayTime(9)), 1);
});

// A unit with authors of these lines, for the rules.
function unitWith(lines) {
  const a = analyze(lines.map((l, i) => commit(10, `p${i}@example.com`, [['src/a.js', l, 0]])), config());
  const unit = a.folders.get('src');
  return [{ unit, ranked: rankAuthors(unit, a.people) }];
}

test('concentration: the top share at the limit matches and just under it does not; other authors at the limit match and one more does not', () => {
  const c = config({ rules: { concentration: { minTopShare: 80, maxOtherAuthors: 1, level: 'error' } } });
  assert.equal(evaluate(unitWith([80, 20]), c).length, 1);
  assert.equal(evaluate(unitWith([79999, 20001]), c).length, 0, '79.999% is under 80%');
  assert.equal(evaluate(unitWith([80, 10, 10]), c).length, 0, 'two other authors is over one');
  const f = evaluate(unitWith([90, 10]), c)[0];
  assert.equal(f.rule, 'concentration');
  assert.equal(f.level, 'error');
  assert.equal(f.found, 'p0 made 90% of 100 changed lines; 1 other author');
  assert.equal(f.why, '90% is at least 80%, and 1 is at most 1');
  assert.equal(evaluate(unitWith([5]), c)[0].found, 'p0 made 100% of 5 changed lines; no other author');
});

test('holders: the count at the limit matches and one more does not; minLines keeps small units out', () => {
  const c = config({ rules: { holders: { coverShare: 50, maxHolders: 1, minLines: 100 } } });
  assert.equal(evaluate(unitWith([50, 50]), c).length, 1);
  assert.equal(evaluate(unitWith([49, 51]), c).length, 1);
  assert.equal(evaluate(unitWith([40, 30, 30]), c).length, 0);
  assert.equal(evaluate(unitWith([60, 39]), c).length, 0, '99 lines is under minLines 100');
  const f = evaluate(unitWith([60, 40]), c)[0];
  assert.equal(f.found, '1 author (p0) made 60% of 100 changed lines');
  assert.equal(f.why, '1 author covers at least 50%, and 1 is at most 1');
  assert.deepEqual(f.holders, { count: 1, labels: ['p0'] });
});

test('rules: appliesTo picks files, folders or both; a unit with no changed lines is never a finding', () => {
  const a = analyze([commit(10, 'a@example.com', [['src/a.js', 5, 0], ['src/b.png', null]])], config());
  const units = [...a.folders.values(), ...a.files.values()].map((unit) => ({ unit, ranked: rankAuthors(unit, a.people) }));
  const rule = (appliesTo) => config({ rules: { concentration: { minTopShare: 50, maxOtherAuthors: 0, appliesTo } } });
  assert.deepEqual(evaluate(units, rule(['folders'])).map((f) => f.path), ['src']);
  assert.deepEqual(evaluate(units, rule(['files'])).map((f) => f.path), ['src/a.js']);
  assert.deepEqual(evaluate(units, rule(['files', 'folders'])).map((f) => `${f.kind} ${f.path}`), ['folder src', 'file src/a.js']);
});

test('rules: findings are ordered by level, then folders before files, then path; the verdict counts the fail level and above', () => {
  const a = analyze([commit(10, 'a@example.com', [['b/x.js', 5, 0], ['a/y.js', 5, 0]])], config());
  const units = [...a.folders.values(), ...a.files.values()].map((unit) => ({ unit, ranked: rankAuthors(unit, a.people) }));
  const c = config({ rules: { concentration: { minTopShare: 50, maxOtherAuthors: 0, appliesTo: ['files', 'folders'], level: 'notice' }, holders: { coverShare: 50, maxHolders: 1, appliesTo: ['folders'], level: 'error' } } });
  const found = evaluate(units, c);
  assert.deepEqual(found.map((f) => `${f.level} ${f.kind} ${f.path}`), ['error folder a', 'error folder b', 'notice folder a', 'notice folder b', 'notice file a/y.js', 'notice file b/x.js']);
  assert.deepEqual(decide(found, 'error'), { failOn: 'error', pass: false, failing: 2, byLevel: { notice: 4, warning: 0, error: 2 }, text: 'FAIL - 2 findings at or above error' });
  assert.equal(decide(found.filter((f) => f.level === 'notice'), 'warning').text, 'PASS - no finding at or above warning (4 findings below it)');
  assert.equal(decide([], 'notice').text, 'PASS - no finding at or above notice');
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(atOrAbove('warning', 'warning'));
  assert.ok(!atOrAbove('notice', 'warning'));
});

test('rules: each rule says its rule in words from the numbers of the configuration, and names the sentences it rests on', () => {
  const c = config({ rules: { concentration: { minTopShare: 80, maxOtherAuthors: 1 }, holders: { coverShare: 50.5, maxHolders: 2 } } });
  assert.equal(ruleById('concentration').rule(c.rules[0]), 'the top author made at least 80% of the changed lines and at most 1 other author changed the unit');
  assert.equal(ruleById('holders').rule(c.rules[1]), 'at most 2 authors are needed to cover 50.5% of the changed lines');
  assert.deepEqual(RULES.map((r) => [r.id, r.basis]), [['concentration', ['truckFactor']], ['holders', ['truckFactorDefinition', 'truckFactorNoConsensus']]]);
});
