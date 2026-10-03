// The configuration file: the window of history, the depth of the folders, the aliases and the excluded authors, the
// paths to leave out, the rules and the fail level. Every number a rule compares comes from this file: the tool has no
// threshold of its own, and a file must state window.days and at least one rule. The defaults that exist are listed in
// DEFAULTS and in docs/inputs.md, each with its reason, and none of them is a threshold. Every key the tool does not know
// is an error, so a typo such as minTopShar cannot silently switch a rule off. The file is read with the strict JSON
// reader of src/json.js, which refuses an object that names a key twice.

import { JsonError, jsonProblem, parseJson } from './json.js';
import { scaledPercent } from './ratio.js';
import { GLOB_LIMITS, globProblem } from './glob.js';
import { LEVELS, UNIT_KINDS } from './data.js';
import { safeText } from './text.js';

export const CONFIG_LIMITS = { maxDays: 36500, maxDepth: 16, maxAliases: 1000, maxEmailsPerAlias: 50, maxString: 200 };

// The defaults, none of them a threshold: the depth of the folders that are reported, the units a rule looks at, the
// level of a finding, the least changed lines a unit needs before a rule looks at it, and the fail level.
export const DEFAULTS = { depth: 2, appliesTo: ['folders'], level: 'warning', minLines: 1, failOn: 'warning' };

// The keys of the configuration file, as a tree: what each level may hold.
export const KEYS = {
  name: 'string',
  window: { days: 'days' },
  folders: { depth: 'depth' },
  authors: { aliases: 'aliases', exclude: 'globs' },
  ignore: 'globs',
  rules: {
    concentration: { minTopShare: 'percent', maxOtherAuthors: 'count', minLines: 'count', level: 'level', appliesTo: 'kinds' },
    holders: { coverShare: 'percent', maxHolders: 'count', minLines: 'count', level: 'level', appliesTo: 'kinds' }
  },
  failOn: 'level'
};

// The keys each rule needs.
export const RULE_KEYS = { concentration: ['minTopShare', 'maxOtherAuthors'], holders: ['coverShare', 'maxHolders'] };

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.map((p) => p.text).join('\n'));
    this.problems = problems;
  }
}

// The edit distance of two short words, for the "did you mean" of an unknown key.
function distance(a, b) {
  if (a.length > 40 || b.length > 40) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v === 'object' ? 'an object' : typeof v === 'string' ? 'a string' : typeof v === 'number' ? 'a number' : 'a boolean');
const CONTROL = /[\u0000-\u001f\u007f]/;

// An email address is compared without case, as gitmailmap matches them.
export const emailKey = (email) => String(email).trim().toLowerCase();

// Checks the value of the configuration against KEYS and builds the normal form.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lim = CONFIG_LIMITS;
  const at = (path) => (path === '' ? file : `${file}${lines.has(path) ? `:${lines.get(path)}` : ''}: ${path}`);
  const bad = (path, message) => {
    problems.push({ path, text: `${at(path)}: ${message}` });
  };
  const has = (prefix) => problems.some((p) => p.path === prefix || p.path.startsWith(`${prefix}.`) || p.path.startsWith(`${prefix}[`));

  const text = (v, path) => {
    if (typeof v !== 'string' || v.trim() === '') return bad(path, `must be a string that is not empty, not ${kindOf(v)}`);
    if (v.length > lim.maxString || CONTROL.test(v)) return bad(path, `must be at most ${lim.maxString} characters with no control character`);
    return v;
  };
  const whole = (v, path, min, max, what) => {
    if (typeof v !== 'number') return bad(path, `must be ${what}, not ${kindOf(v)}`);
    if (!Number.isSafeInteger(v) || v < min || v > max) return bad(path, `${safeText(String(v), 30)} is not ${what}`);
    return v;
  };
  const percent = (v, path) => {
    if (typeof v !== 'number') return bad(path, `must be a number from 0 to 100, not ${kindOf(v)}`);
    const s = scaledPercent(v);
    if (s === null) return bad(path, `${safeText(String(v), 30)} is not a percentage from 0 to 100 with at most four decimals`);
    return { scaled: s, shown: v };
  };
  const list = (v, path, max, each) => {
    if (!Array.isArray(v)) return bad(path, `must be a list, not ${kindOf(v)}`);
    if (v.length === 0) return bad(path, 'is an empty list; leave the key out instead');
    if (v.length > max) return bad(path, `holds more than ${max} entries`);
    const out = [];
    let ok = true;
    v.forEach((item, i) => {
      const r = each(item, `${path}[${i}]`, out);
      if (r === undefined) ok = false;
      else out.push(r);
    });
    return ok ? out : undefined;
  };
  const globs = (v, path) => list(v, path, GLOB_LIMITS.maxPatterns, (g, p, out) => {
    const problem = globProblem(g);
    if (problem) return bad(p, `the pattern ${problem}`);
    if (out.includes(g)) return bad(p, `${safeText(g, 60)} is named twice`);
    return g;
  });
  const kinds = (v, path) => list(v, path, UNIT_KINDS.length, (k, p, out) => {
    if (typeof k !== 'string' || !UNIT_KINDS.includes(k)) return bad(p, `must be one of ${UNIT_KINDS.join(', ')}`);
    if (out.includes(k)) return bad(p, `${k} is named twice`);
    return k;
  });
  const level = (v, path) => {
    if (typeof v !== 'string' || !LEVELS.includes(v)) return bad(path, `must be one of ${LEVELS.join(', ')}`);
    return v;
  };
  const seenEmails = new Map();
  const seenNames = new Set();
  const alias = (v, path) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return bad(path, `must be an object with name and emails, not ${kindOf(v)}`);
    let ok = true;
    for (const key of Object.keys(v)) {
      if (key !== 'name' && key !== 'emails') {
        bad(`${path}.${key}`, 'unknown key; an alias holds name and emails');
        ok = false;
      }
    }
    const name = v.name === undefined ? bad(`${path}.name`, 'is needed: the name shown for this person') : text(v.name, `${path}.name`);
    if (name !== undefined) {
      if (seenNames.has(name.trim().toLowerCase())) {
        bad(`${path}.name`, `${safeText(name, 60)} is the name of another alias`);
        ok = false;
      } else seenNames.add(name.trim().toLowerCase());
    }
    const emails = v.emails === undefined ? bad(`${path}.emails`, 'is needed: the email addresses this person commits with') : list(v.emails, `${path}.emails`, lim.maxEmailsPerAlias, (e, p) => {
      const t = text(e, p);
      if (t === undefined) return undefined;
      const key = emailKey(t);
      if (seenEmails.has(key)) return bad(p, `${safeText(t, 60)} is also listed under ${seenEmails.get(key)} (addresses are compared without case)`);
      seenEmails.set(key, path);
      return key;
    });
    if (!ok || name === undefined || emails === undefined) return undefined;
    return { name: name.trim(), emails };
  };

  const check = (kind, v, p) => {
    if (kind === 'string') return text(v, p);
    if (kind === 'days') return whole(v, p, 1, lim.maxDays, `a whole number of days from 1 to ${lim.maxDays}`);
    if (kind === 'depth') return whole(v, p, 1, lim.maxDepth, `a whole number from 1 to ${lim.maxDepth}`);
    if (kind === 'count') return whole(v, p, 0, Number.MAX_SAFE_INTEGER, 'a whole number of 0 or more');
    if (kind === 'percent') return percent(v, p);
    if (kind === 'level') return level(v, p);
    if (kind === 'kinds') return kinds(v, p);
    if (kind === 'globs') return globs(v, p);
    if (kind === 'aliases') return list(v, p, lim.maxAliases, alias);
    return bad(p, 'cannot be read');
  };

  // Walks a level of the configuration against its allowed keys; returns the checked values by key.
  const walk = (obj, spec, path) => {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      bad(path, `must be an object, not ${kindOf(obj)}`);
      return null;
    }
    const out = {};
    for (const key of Object.keys(obj)) {
      const p = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(spec, key)) {
        const near = Object.keys(spec).map((k) => [k, distance(k.toLowerCase(), key.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
        bad(p, `unknown key${near && near[1] <= 3 ? `; did you mean ${near[0]}?` : `; the keys here are ${Object.keys(spec).join(', ')}`}`);
        continue;
      }
      const kind = spec[key];
      out[key] = typeof kind === 'object' ? walk(obj[key], kind, p) : check(kind, obj[key], p);
    }
    return out;
  };

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    bad('', `the configuration must be one JSON object, not ${kindOf(value)}`);
    throw new ConfigError(problems);
  }
  const top = walk(value, KEYS, '');
  if (top.window === undefined && !has('window')) bad('window', 'is needed, with days: the number of days of history to read, up to the newest commit');
  else if (top.window && top.window.days === undefined && !has('window')) bad('window.days', 'is needed: the number of days of history to read, up to the newest commit');
  if (top.rules === undefined && !has('rules')) bad('rules', 'is needed: at least one rule; a check with no rule would always pass');
  const rules = top.rules;
  if (rules) {
    const named = Object.keys(rules).filter((k) => rules[k] !== null && rules[k] !== undefined);
    if (named.length === 0 && !has('rules')) bad('rules', 'states no rule; a check with no rule would always pass');
    for (const [id, needed] of Object.entries(RULE_KEYS)) {
      if (!rules[id] || has(`rules.${id}`)) continue;
      for (const k of needed) if (rules[id][k] === undefined) bad(`rules.${id}.${k}`, `is needed by the ${id} rule`);
    }
    if (rules.holders && rules.holders.coverShare && rules.holders.coverShare.scaled === 0) bad('rules.holders.coverShare', 'must be above 0: no author is needed to cover 0% of the lines');
  }
  if (problems.length) throw new ConfigError(problems);

  const rule = (id, r) => (r ? { id, ...r, minLines: r.minLines ?? DEFAULTS.minLines, level: r.level ?? DEFAULTS.level, appliesTo: r.appliesTo ?? DEFAULTS.appliesTo } : null);
  const aliases = top.authors?.aliases ?? [];
  return {
    name: typeof top.name === 'string' ? safeText(top.name, 120) : '',
    days: top.window.days,
    depth: top.folders?.depth ?? DEFAULTS.depth,
    aliases,
    exclude: (top.authors?.exclude ?? []).map((g) => g.toLowerCase()),
    ignore: top.ignore ?? [],
    rules: [rule('concentration', rules.concentration), rule('holders', rules.holders)].filter(Boolean),
    failOn: top.failOn ?? DEFAULTS.failOn
  };
}

// Reads the text of a configuration file into the normal form. file is the path shown. Throws ConfigError with every
// problem.
export function readConfig(text, file = 'config') {
  let parsed;
  try {
    parsed = parseJson(text);
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([{ path: '', text: `${file}: ${jsonProblem(error, text)}` }]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
