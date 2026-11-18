// Known breaks in a country's regional series, drawn as a dashed line
// between the last year before and the first year after.
//
// United Kingdom: the OECD's regional employment changes source in 2015.
// - TL3 (and TL2b, which sums TL3): before 2015 a different estimate whose
//   spread across regions is far wider (with the same 159 regions the
//   coefficient of variation of productivity falls from 29% to 20%).
// - TL2: before 2015 equal to ONS filled jobs, about 9% lower after, so
//   productivity jumps about 11% in 2015, unevenly by region.
// Every UK TL3 and TL2b view, the cross-country charts included, uses a
// series made comparable across the break (common database table
// uk_consistent), so only TL2, which has no such series yet, keeps the line.
import * as Plot from '@observablehq/plot';

export function seriesBreak(iso3: string, level: string | null): number | null {
  return iso3 === 'GBR' && level === 'tl2' ? 2015 : null;
}
// the dashed rule, halfway between the two years
export function breakRule(year: number, tokens: Record<string, string>) {
  return Plot.ruleX([year - 0.5], { stroke: tokens['fg-2'], strokeDasharray: '4 3', strokeWidth: 1.2 });
}
