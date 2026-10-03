// The rules. Each rule looks at one unit (a file or a folder) and compares its numbers with the numbers of the
// configuration; it has no number of its own. A unit with fewer changed lines than minLines is not looked at. The
// rules, the levels and the fail level are defined in docs/method.md.

import { atLeast, percentText, thresholdText } from './ratio.js';
import { LEVELS } from './data.js';
import { grouped, plural } from './size.js';
import { holders } from './metrics.js';

export const RULES = [
  {
    id: 'concentration',
    title: 'One author made most of the changed lines, and few others touched the unit',
    basis: ['truckFactor'],
    rule: (r) => `the top author made at least ${thresholdText(r.minTopShare.scaled)} of the changed lines and at most ${plural(r.maxOtherAuthors, 'other author')} changed the unit`,
    evaluate(unit, ranked, r) {
      const top = ranked[0];
      const others = ranked.length - 1;
      const share = atLeast(top.lines, unit.lines, r.minTopShare.scaled);
      if (!share || others > r.maxOtherAuthors) return null;
      return {
        found: `${top.label} made ${percentText(top.lines, unit.lines)} of ${plural(unit.lines, 'changed line')}; ${others === 0 ? 'no other author' : `${plural(others, 'other author')}`}`,
        why: `${percentText(top.lines, unit.lines)} is at least ${thresholdText(r.minTopShare.scaled)}, and ${grouped(others)} is at most ${grouped(r.maxOtherAuthors)}`,
        holders: null
      };
    }
  },
  {
    id: 'holders',
    title: 'Few authors hold the given share of the changed lines',
    basis: ['truckFactorDefinition', 'truckFactorNoConsensus'],
    rule: (r) => `at most ${plural(r.maxHolders, 'author')} ${r.maxHolders === 1 ? 'is' : 'are'} needed to cover ${thresholdText(r.coverShare.scaled)} of the changed lines`,
    evaluate(unit, ranked, r) {
      const h = holders(ranked, unit.lines, r.coverShare.scaled);
      if (h.count > r.maxHolders) return null;
      const lines = h.authors.reduce((s, a) => s + a.lines, 0);
      return {
        found: `${plural(h.count, 'author')} (${h.authors.map((a) => a.label).join(', ')}) made ${percentText(lines, unit.lines)} of ${plural(unit.lines, 'changed line')}`,
        why: `${grouped(h.count)} ${h.count === 1 ? 'author covers' : 'authors cover'} at least ${thresholdText(r.coverShare.scaled)}, and ${grouped(h.count)} is at most ${grouped(r.maxHolders)}`,
        holders: { count: h.count, labels: h.authors.map((a) => a.label) }
      };
    }
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// Whether a level is the fail level or above.
export const atOrAbove = (level, failOn) => LEVELS.indexOf(level) >= LEVELS.indexOf(failOn);

// The findings of every configured rule over the units, highest level first, then folders before files, then by path.
export function evaluate(units, config) {
  const findings = [];
  for (const r of config.rules) {
    const spec = ruleById(r.id);
    for (const { unit, ranked } of units) {
      if (!r.appliesTo.includes(`${unit.kind}s`)) continue;
      if (unit.lines === 0 || unit.lines < r.minLines) continue;
      const hit = spec.evaluate(unit, ranked, r);
      if (hit) findings.push({ rule: r.id, level: r.level, kind: unit.kind, path: unit.path, unit, ranked, ...hit, ruleText: spec.rule(r) });
    }
  }
  const order = (f) => [-LEVELS.indexOf(f.level), f.kind === 'folder' ? 0 : 1];
  findings.sort((a, b) => {
    const [la, ka] = order(a);
    const [lb, kb] = order(b);
    return la - lb || ka - kb || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0);
  });
  return findings;
}

// The verdict: the findings at the fail level or above fail the run.
export function decide(findings, failOn) {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, findings.filter((f) => f.level === l).length]));
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const pass = failing === 0;
  const text = pass
    ? `PASS - no finding at or above ${failOn}${findings.length ? ` (${plural(findings.length, 'finding')} below it)` : ''}`
    : `FAIL - ${plural(failing, 'finding')} at or above ${failOn}`;
  return { failOn, pass, failing, byLevel, text };
}
