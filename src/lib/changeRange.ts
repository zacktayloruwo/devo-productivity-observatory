// The "Change over time" range in the top bar (?from=&to=): the start and
// end years of every change the views compute (the map's change mode, the
// Productivity change column and growth table). It defaults to 2004 (the
// first year of full FUA coverage) to 2019 (the last before the pandemic),
// or the nearest years with data for the indicator in view.
import { route, setQuery } from './router.svelte';
import { levelInfo, manifest, type Level } from './db/manifest.svelte';
import { FIRST_YEAR } from './charts/plot';

export const DEFAULT_FROM = 2004, DEFAULT_TO = 2019;
export const RANGE_VIEWS = ['map', 'productivity'];

// the indicator whose years the range is drawn from in a view
export function rangeVariable(view: string, level: Level): string | null {
  if (view === 'map') {
    const vars = levelInfo(level).variables;
    return (vars.some((v) => v.id === route.query.var) ? route.query.var : vars[0]?.id) ?? null;
  }
  if (view === 'productivity') return level === 'fua' ? 'labprod_usdppp' : level === 'national' ? 'gdp_pw' : 'lp_lpr';
  return null;
}
// years with data for that indicator (any country)
export function rangeYears(view: string, level: Level): number[] {
  const v = rangeVariable(view, level);
  return v ? (levelInfo(level).var_years?.[v] ?? []).filter((y) => y >= FIRST_YEAR) : [];
}
// every year the pulldowns list: from the first year the views show to the latest in the data
export function allYears(): number[] {
  const m = manifest.value; let hi = DEFAULT_TO;
  for (const lv of Object.values(m?.levels ?? {})) for (const ys of Object.values(lv.var_years ?? {})) for (const y of ys) if (y > hi) hi = y;
  return Array.from({ length: hi - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
}
function nearest(avail: number[], y: number): number | null {
  if (!avail.length) return null;
  return avail.reduce((b, x) => (Math.abs(x - y) < Math.abs(b - y) || (Math.abs(x - y) === Math.abs(b - y) && x < b) ? x : b));
}
// the range in force: the route's years, else the defaults, moved to the
// nearest years with data; the start always before the end
export function changeRange(view: string, level: Level): [number, number] {
  const avail = rangeYears(view, level);
  const q0 = Number(route.query.from) || DEFAULT_FROM, q1 = Number(route.query.to) || DEFAULT_TO;
  let a = nearest(avail, q0) ?? q0, b = nearest(avail, q1) ?? q1;
  if (a >= b) {
    const later = avail.filter((y) => y > a);
    if (later.length) b = later.reduce((x, y) => (Math.abs(y - q1) < Math.abs(x - q1) ? y : x));
    else { const earlier = avail.filter((y) => y < b); if (earlier.length) a = earlier[earlier.length - 1]; }
  }
  return [a, b];
}
export function setRange(from: number | null, to: number | null) {
  const patch: Record<string, string | undefined> = {};
  if (from != null) patch.from = from === DEFAULT_FROM ? undefined : String(from);
  if (to != null) patch.to = to === DEFAULT_TO ? undefined : String(to);
  setQuery(patch);
}
