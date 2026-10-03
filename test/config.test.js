import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULTS, GLOB_LIMITS, JsonError, KEYS, RULE_KEYS, emailKey, globProblem, jsonProblem, matchGlob, matchesAny, parseJson, readConfig, validateConfig } from '../src/index.js';
import { BASE_CONFIG, configOf, lineOf } from './helpers.js';

// The configuration file and the readers behind it: the strict JSON reader, every key, the defaults, the aliases, the
// patterns and the rules.

const problems = (object) => {
  try {
    configOf(object);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.message;
  }
  return '';
};

test('config: the normal form, with the documented defaults where a key is left out', () => {
  const c = configOf(BASE_CONFIG);
  assert.equal(c.days, 100);
  assert.equal(c.depth, DEFAULTS.depth);
  assert.equal(c.failOn, 'warning');
  assert.deepEqual(c.aliases, []);
  assert.deepEqual(c.exclude, []);
  assert.deepEqual(c.ignore, []);
  assert.equal(c.rules.length, 1);
  const r = c.rules[0];
  assert.equal(r.id, 'concentration');
  assert.deepEqual(r.minTopShare, { scaled: 800000, shown: 80 });
  assert.equal(r.maxOtherAuthors, 1);
  assert.equal(r.minLines, 1);
  assert.equal(r.level, 'warning');
  assert.deepEqual(r.appliesTo, ['folders']);
  assert.deepEqual(DEFAULTS, { depth: 2, appliesTo: ['folders'], level: 'warning', minLines: 1, failOn: 'warning' });
});

test('config: every key is read, with both rules, aliases in lower case and patterns of excluded authors in lower case', () => {
  const c = configOf({
    name: 'Shop',
    window: { days: 90 },
    folders: { depth: 3 },
    authors: { aliases: [{ name: 'Lena Ortiz', emails: ['Lena@Example.com', 'l.o@example.com'] }], exclude: ['*[BOT]@*'] },
    ignore: ['docs/**', '**/*.lock'],
    rules: {
      concentration: { minTopShare: 75.5, maxOtherAuthors: 0, minLines: 20, level: 'error', appliesTo: ['files', 'folders'] },
      holders: { coverShare: 50, maxHolders: 2, level: 'notice' }
    },
    failOn: 'notice'
  });
  assert.equal(c.name, 'Shop');
  assert.equal(c.depth, 3);
  assert.deepEqual(c.aliases, [{ name: 'Lena Ortiz', emails: ['lena@example.com', 'l.o@example.com'] }]);
  assert.deepEqual(c.exclude, ['*[bot]@*']);
  assert.deepEqual(c.ignore, ['docs/**', '**/*.lock']);
  assert.deepEqual(c.rules.map((r) => [r.id, r.level, r.appliesTo, r.minLines]), [['concentration', 'error', ['files', 'folders'], 20], ['holders', 'notice', ['folders'], 1]]);
  assert.deepEqual(c.rules[0].minTopShare, { scaled: 755000, shown: 75.5 });
  assert.equal(c.failOn, 'notice');
  assert.equal(emailKey('  A@B.Example '), 'a@b.example');
});

test('config: window.days and at least one rule are needed; a rule needs its numbers', () => {
  assert.match(problems({ rules: BASE_CONFIG.rules }), /window: is needed, with days/);
  assert.match(problems({ window: {}, rules: BASE_CONFIG.rules }), /window\.days: is needed/);
  assert.match(problems({ window: { days: 10 } }), /rules: is needed: at least one rule/);
  assert.match(problems({ window: { days: 10 }, rules: {} }), /rules: states no rule; a check with no rule would always pass/);
  assert.match(problems({ window: { days: 10 }, rules: { concentration: { minTopShare: 80 } } }), /rules\.concentration\.maxOtherAuthors: is needed by the concentration rule/);
  assert.match(problems({ window: { days: 10 }, rules: { holders: { maxHolders: 1 } } }), /rules\.holders\.coverShare: is needed by the holders rule/);
  assert.match(problems({ window: { days: 10 }, rules: { holders: { coverShare: 0, maxHolders: 1 } } }), /must be above 0/);
  assert.deepEqual(RULE_KEYS, { concentration: ['minTopShare', 'maxOtherAuthors'], holders: ['coverShare', 'maxHolders'] });
});

test('config: an unknown key is an error with a suggestion, at every level, with its line', () => {
  const text = '{\n  "window": { "days": 10 },\n  "rules": {\n    "concentration": { "minTopShar": 80, "maxOtherAuthors": 1 }\n  },\n  "colour": "red"\n}\n';
  assert.throws(() => readConfig(text, 'c.json'), (error) => {
    assert.ok(error.message.includes(`c.json:${lineOf(text, '"minTopShar"')}: rules.concentration.minTopShar: unknown key; did you mean minTopShare?`));
    assert.ok(error.message.includes(`c.json:${lineOf(text, '"colour"')}: colour: unknown key; the keys here are name, window, folders, authors, ignore, rules, failOn`));
    return true;
  });
  assert.match(problems({ ...BASE_CONFIG, authors: { alias: [] } }), /authors\.alias: unknown key; did you mean aliases\?/);
  assert.match(problems({ ...BASE_CONFIG, authors: { aliases: [{ name: 'A', emails: ['a@x'], team: 'b' }] } }), /authors\.aliases\[0\]\.team: unknown key; an alias holds name and emails/);
});

test('config: a key named twice is refused by the JSON reader, as RFC 8259 calls the result unpredictable', () => {
  const text = '{"window": {"days": 10}, "window": {"days": 99}, "rules": {"holders": {"coverShare": 50, "maxHolders": 1}}}';
  assert.throws(() => readConfig(text, 'c.json'), /c\.json: line 1, column 26: the name "window" appears twice in one object; RFC 8259 says the behavior of software that receives such an object is unpredictable/);
});

test('config: numbers out of range, wrong types and percentages with more than four decimals are refused, with a near miss on each side', () => {
  const rule = (r) => ({ window: { days: 10 }, rules: { concentration: { minTopShare: 80, maxOtherAuthors: 1, ...r } } });
  assert.match(problems({ window: { days: 0 }, rules: BASE_CONFIG.rules }), /window\.days: 0 is not a whole number of days from 1 to 36500/);
  assert.equal(problems({ window: { days: 1 }, rules: BASE_CONFIG.rules }), '');
  assert.equal(problems({ window: { days: CONFIG_LIMITS.maxDays }, rules: BASE_CONFIG.rules }), '');
  assert.match(problems({ window: { days: CONFIG_LIMITS.maxDays + 1 }, rules: BASE_CONFIG.rules }), /is not a whole number of days/);
  assert.match(problems({ window: { days: '30' }, rules: BASE_CONFIG.rules }), /must be a whole number of days from 1 to 36500, not a string/);
  assert.match(problems({ ...BASE_CONFIG, folders: { depth: 0 } }), /folders\.depth: 0 is not a whole number from 1 to 16/);
  assert.match(problems({ ...BASE_CONFIG, folders: { depth: 17 } }), /folders\.depth: 17 is not/);
  assert.equal(problems({ ...BASE_CONFIG, folders: { depth: 16 } }), '');
  assert.match(problems(rule({ minTopShare: 100.0001 })), /is not a percentage from 0 to 100/);
  assert.match(problems(rule({ minTopShare: 80.00001 })), /with at most four decimals/);
  assert.equal(problems(rule({ minTopShare: 80.0001 })), '');
  assert.equal(problems(rule({ minTopShare: 100 })), '');
  assert.match(problems(rule({ maxOtherAuthors: -1 })), /-1 is not a whole number of 0 or more/);
  assert.match(problems(rule({ maxOtherAuthors: 1.5 })), /1\.5 is not a whole number/);
  assert.match(problems(rule({ minLines: true })), /must be a whole number of 0 or more, not a boolean/);
  assert.match(problems(rule({ level: 'fatal' })), /level: must be one of notice, warning, error/);
  assert.match(problems(rule({ appliesTo: ['dirs'] })), /appliesTo\[0\]: must be one of files, folders/);
  assert.match(problems(rule({ appliesTo: ['files', 'files'] })), /files is named twice/);
  assert.match(problems(rule({ appliesTo: [] })), /is an empty list/);
  assert.match(problems({ ...BASE_CONFIG, failOn: 'all' }), /failOn: must be one of notice, warning, error/);
  assert.match(problems({ ...BASE_CONFIG, name: '' }), /name: must be a string that is not empty/);
  assert.match(problems({ ...BASE_CONFIG, name: 'a\u0007b' }), /no control character/);
  assert.match(problems({ ...BASE_CONFIG, rules: [] }), /rules: must be an object, not an array/);
  assert.match(problems([]), /the configuration must be one JSON object, not an array/);
});

test('config: aliases have a name and addresses; an address on two aliases or a name used twice is refused', () => {
  const with_ = (aliases) => ({ ...BASE_CONFIG, authors: { aliases } });
  assert.match(problems(with_([{ name: 'A', emails: ['a@x.example'] }, { name: 'B', emails: ['A@X.example'] }])), /authors\.aliases\[1\]\.emails\[0\]: A@X\.example is also listed under authors\.aliases\[0\] \(addresses are compared without case\)/);
  assert.match(problems(with_([{ name: 'Ann', emails: ['a@x'] }, { name: 'ann', emails: ['b@x'] }])), /authors\.aliases\[1\]\.name: ann is the name of another alias/);
  assert.match(problems(with_([{ emails: ['a@x'] }])), /authors\.aliases\[0\]\.name: is needed/);
  assert.match(problems(with_([{ name: 'A' }])), /authors\.aliases\[0\]\.emails: is needed/);
  assert.match(problems(with_([{ name: 'A', emails: [] }])), /emails: is an empty list/);
  assert.match(problems(with_(['A <a@x>'])), /authors\.aliases\[0\]: must be an object with name and emails, not a string/);
  assert.match(problems(with_([{ name: 'A', emails: Array.from({ length: 51 }, (_, i) => `a${i}@x`) }])), /holds more than 50 entries/);
});

test('config: patterns are globs without a backslash, a leading slash or a control character, at most a hundred', () => {
  assert.match(problems({ ...BASE_CONFIG, ignore: ['docs\\**'] }), /ignore\[0\]: the pattern holds a backslash/);
  assert.match(problems({ ...BASE_CONFIG, ignore: ['/docs'] }), /the pattern starts with a slash/);
  assert.match(problems({ ...BASE_CONFIG, ignore: ['a', 'a'] }), /ignore\[1\]: a is named twice/);
  assert.match(problems({ ...BASE_CONFIG, authors: { exclude: [''] } }), /authors\.exclude\[0\]: the pattern is empty/);
  assert.match(problems({ ...BASE_CONFIG, ignore: Array.from({ length: GLOB_LIMITS.maxPatterns + 1 }, (_, i) => `p${i}`) }), /holds more than 100 entries/);
  assert.equal(globProblem('a/**/b'), null);
});

test('glob: *, ? and ** with forward slashes; an address is one part', () => {
  assert.ok(matchGlob('docs/**', 'docs/a/b.md'));
  assert.ok(matchGlob('docs/**', 'docs'));
  assert.ok(!matchGlob('docs/**', 'doc/a.md'));
  assert.ok(matchGlob('**/*.lock', 'a/b/yarn.lock'));
  assert.ok(matchGlob('**/*.lock', 'yarn.lock'));
  assert.ok(matchGlob('src/?.js', 'src/a.js'));
  assert.ok(!matchGlob('src/?.js', 'src/ab.js'));
  assert.ok(!matchGlob('src/*.js', 'src/a/b.js'));
  assert.ok(matchGlob('*[bot]@*', '49+dependabot[bot]@users.noreply.example'));
  assert.ok(matchGlob('*-bot@example.com', 'build-bot@example.com'));
  assert.ok(!matchGlob('*-bot@example.com', 'robot@example.com'));
  assert.ok(matchesAny(['x', '*.md'], 'a.md'));
  assert.ok(!matchesAny([], 'a.md'));
});

test('json: a strict reader with lines, no comments, no trailing comma, no repeated name, and limits', () => {
  const { value, lines } = parseJson('{\n "a": [1, {"b": true}],\n "c": null\n}');
  assert.deepEqual(value, { a: [1, { b: true }], c: null });
  assert.equal(lines.get('a[1].b'), 2);
  assert.equal(lines.get('c'), 3);
  for (const [text, pattern] of [
    ['{"a": 1,}', /a comma before the closing brace/],
    ['[1,]', /a comma before the closing bracket/],
    ['{"a": 1} // x', /text after the end of the value/],
    ['// x\n{}', /a comment; JSON has no comments/],
    ["{'a': 1}", /a name in double quotes was expected/],
    ['"a\u0001"', /a control character inside a string/],
    ['"\\x"', /an escape \\x that JSON does not have/],
    ['"\\u12"', /an escape \\u that is not followed by four hexadecimal digits/],
    ['[01]', /a comma or a closing bracket was expected/],
    ['{"a" 1}', /a colon after the name was expected/],
    ['NaN', /where a value was expected/],
    ['1e999', /a number too large to read/],
    ['', /the text ends where a value was expected/]
  ]) assert.throws(() => parseJson(text), (e) => e instanceof JsonError && pattern.test(e.message), text);
  assert.throws(() => parseJson('[[[1]]]', { maxDepth: 2 }), /nested more than 2 deep/);
  assert.throws(() => parseJson('[1,2,3]', { maxValues: 3 }), /more than 3 values/);
  assert.throws(() => parseJson('"abcdef"', { maxStringLength: 3 }), /a string longer than 3 characters/);
  assert.equal(jsonProblem(new JsonError('x', 3), 'ab\ncd'), 'line 2, column 1: x');
  assert.equal(jsonProblem(new Error('plain'), ''), 'plain');
  const proto = parseJson('{"__proto__": {"polluted": true}}').value;
  assert.equal(Object.getPrototypeOf(proto), Object.prototype);
  assert.equal(({}).polluted, undefined);
  assert.equal(parseJson(`${String.fromCharCode(0xfeff)}{}`).value.constructor, Object);
});

test('config: the tree of keys is the one docs/inputs.md describes', () => {
  assert.deepEqual(Object.keys(KEYS), ['name', 'window', 'folders', 'authors', 'ignore', 'rules', 'failOn']);
  assert.deepEqual(Object.keys(KEYS.rules), ['concentration', 'holders']);
  assert.throws(() => validateConfig(null), /the configuration must be one JSON object, not null/);
});
