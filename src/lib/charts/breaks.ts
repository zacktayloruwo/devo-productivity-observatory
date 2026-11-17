// Known breaks in a country's regional series, drawn as a dashed line
// between the last year before and the first year after.
//
// United Kingdom: the OECD's regional employment changes source in 2015.
// - TL3 (and TL2b, which sums TL3): before 2015 a different estimate whose
//   spread across regions is far wider (with the same 159 regions the
//   coefficient of variation of productivity falls from 29% to 20%).
// - TL2: before 2015 equal to ONS filled jobs, about 9% lower after, so
//   productivity jumps about 11% in 2015, unevenly by region.
// The UK's own TL3 and TL2b views use a series made comparable across the
// break (common database table uk_consistent): `own` = true says the data
// shown are that series, so there is no break; TL2 has no such series yet.
import * as Plot from '@observablehq/plot';

export function seriesBreak(iso3: string, level: string | null, own = false): number | null {
  if (iso3 !== 'GBR') return null;
  if (level === 'tl2') return 2015;
  return (level === 'tl3' || level === 'tl2b') && !own ? 2015 : null;
}
// the dashed rule, halfway between the two years
export function breakRule(year: number, tokens: Record<string, string>) {
  return Plot.ruleX([year - 0.5], { stroke: tokens['fg-2'], strokeDasharray: '4 3', strokeWidth: 1.2 });
}
