// Shared Observable Plot settings so every chart draws with the theme tokens
// the DOM uses, plus the figure elements the report repeats: the pandemic
// band and the region-grouped country legend.
import * as Plot from '@observablehq/plot';
import type { Tokens } from '../theme/tokens';
import { COVID } from '../countries';

export function plotStyle(tokens: Tokens): Record<string, string> {
  return { background: 'transparent', color: tokens.fg, fontFamily: tokens.sans, fontSize: '12px', overflow: 'visible' };
}

export const MARGIN = { left: 60, right: 40 };

// Every chart over time starts in this year (its table and CSV too)
export const FIRST_YEAR = 2000;
export function fromFirstYear<T extends { year: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.year >= FIRST_YEAR);
}

// Year ticks every `step` years inside [lo, hi]
export function yearTicks(lo: number, hi: number, step = 5): number[] {
  const out: number[] = [];
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) out.push(y);
  return out;
}
export function yearAxis(domain: number[], ticks: number[]) {
  return { domain, ticks, tickFormat: (d: number) => String(d), label: null };
}

// The WHO pandemic emergency as a shaded band, clamped to the plotted years
// so it cannot stretch the axis past the data.
export function covidRect(years: number[], tokens: Tokens) {
  if (!years.length) return [];
  const lo = Math.min(...years), hi = Math.max(...years);
  const x1 = Math.max(COVID[0], lo), x2 = Math.min(COVID[1], hi);
  if (x1 >= x2) return [];
  return [Plot.rectX([{ x1, x2 }], { x1: 'x1', x2: 'x2', fill: tokens.covid })];
}
