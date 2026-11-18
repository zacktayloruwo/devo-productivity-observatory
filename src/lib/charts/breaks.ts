// Known breaks in a country's regional series, drawn as a dashed line
// between the last year before and the first year after, with the change
// across them left out. None is drawn at present.
//
// United Kingdom: the OECD's regional employment changes source in 2015
// (TL3 and TL2b: a different estimate before, far wider across regions;
// TL2: ONS filled jobs before, about 9% lower after). Every UK view uses
// series made comparable across it (common database table uk_consistent,
// analysis plan §18 for TL3 and TL2b, §19 for TL2), so it is not drawn.
import * as Plot from '@observablehq/plot';

// country -> level -> first year after the break
const BREAKS: Record<string, Partial<Record<string, number>>> = {};
export function seriesBreak(iso3: string, level: string | null): number | null {
  return level ? BREAKS[iso3]?.[level] ?? null : null;
}
// the dashed rule, halfway between the two years
export function breakRule(year: number, tokens: Record<string, string>) {
  return Plot.ruleX([year - 0.5], { stroke: tokens['fg-2'], strokeDasharray: '4 3', strokeWidth: 1.2 });
}
