// One line per country over years, styled as the report's cross-country
// figures: the selected country heavy and red, the others light in their
// palette colour, the line style by region, the pandemic band behind.
import * as Plot from '@observablehq/plot';
import type { Tokens } from '../theme/tokens';
import type { Country } from '../db/manifest.svelte';
import { byRegion, REGION_DASH } from '../countries';
import { plotStyle, yearAxis, yearTicks, MARGIN, covidRect, FIRST_YEAR } from './plot';
import { breakRule } from './breaks';

export interface CountryLinesOpts<T> {
  rows: T[];
  x: (d: T) => number;
  y: (d: T) => number | null;
  iso: (d: T) => string;
  countries: Country[];
  colours: Map<string, string>;
  focus: string;
  tokens: Tokens;
  width: number;
  height: number;
  yLabel: string;
  yFormat: (v: number) => string;
  yDomain?: [number, number];
  step?: boolean;          // step-after, for the autonomy indices
  covid?: boolean;
  tickStep?: number;
  breakAt?: number | null;  // a series break before this year (dashed line)
  title: (d: T) => string;
}

export function countryLines<T>(o: CountryLinesOpts<T>): Element | null {
  const rows = o.rows.filter((d) => o.y(d) != null && o.x(d) >= FIRST_YEAR);
  if (!rows.length) return null;
  const ys = rows.map(o.x);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const marks: any[] = o.covid ? covidRect(ys, o.tokens) : [];
  if (o.breakAt != null && o.breakAt > lo && o.breakAt <= hi) marks.push(breakRule(o.breakAt, o.tokens as any));
  // the focus country last, so it draws on top
  for (const g of byRegion(o.countries)) {
    const others = rows.filter((d) => o.iso(d) !== o.focus && g.items.some((c) => c.iso3 === o.iso(d)));
    if (others.length) marks.push(Plot.line(others, { x: o.x, y: o.y as any, z: o.iso, stroke: (d: T) => o.colours.get(o.iso(d))!, strokeDasharray: REGION_DASH[g.region] || undefined, strokeWidth: 1.2, strokeOpacity: 0.65, curve: o.step ? 'step-after' : 'linear' }));
  }
  const focus = rows.filter((d) => o.iso(d) === o.focus);
  const focusRegion = o.countries.find((c) => c.iso3 === o.focus)?.region;
  if (focus.length) marks.push(Plot.line(focus, { x: o.x, y: o.y as any, stroke: o.colours.get(o.focus)!, strokeDasharray: focusRegion ? REGION_DASH[focusRegion] || undefined : undefined, strokeWidth: 2.8, curve: o.step ? 'step-after' : 'linear' }));
  marks.push(Plot.tip(rows, Plot.pointer({ x: o.x, y: o.y as any, title: o.title })));
  return Plot.plot({
    width: o.width, height: o.height, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
    x: yearAxis([lo, hi], yearTicks(lo, hi, o.tickStep ?? (hi - lo > 40 ? 10 : 5))),
    y: { label: o.yLabel, grid: true, tickFormat: o.yFormat, domain: o.yDomain },
    marks
  });
}
