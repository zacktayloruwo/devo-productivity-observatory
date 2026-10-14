// Known breaks in a country's regional series, drawn as a dashed line
// between the last year before and the first year after.
//
// United Kingdom, TL3 (and so TL2b, which sums TL3): the OECD's small-region
// employment comes from a different source before 2015, so productivity
// levels and their spread are not comparable across 2014-2015 (with the same
// 159 regions the coefficient of variation falls from 29% to 20%). TL2 has
// no such break.
import * as Plot from '@observablehq/plot';

export function seriesBreak(iso3: string, level: string | null): number | null {
  return iso3 === 'GBR' && (level === 'tl3' || level === 'tl2b') ? 2015 : null;
}
// the dashed rule, halfway between the two years
export function breakRule(year: number, tokens: Record<string, string>) {
  return Plot.ruleX([year - 0.5], { stroke: tokens['fg-2'], strokeDasharray: '4 3', strokeWidth: 1.2 });
}
