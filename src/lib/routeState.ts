// Route state shared by the views: `#/<view>/<ISO3>/...`. The country is the
// second path segment on every view; a bare view opens the default.
import { route } from './router.svelte';
import { manifest, LEVELS, type Level } from './db/manifest.svelte';

export const DEFAULT_COUNTRY = 'GBR';
// a bare visit opens the map of the United Kingdom in the reference year
export const HOME: string[] = ['map', 'GBR', '2019'];
export const VIEWS = ['overview', 'productivity', 'growth', 'dispersion', 'autonomy', 'map', 'sources', 'about'] as const;

// the geographies each view offers (the rest are disabled in the top bar):
// Growth is national series only, Autonomy has no FUA indices
export function viewLevels(view: View): Level[] {
  if (view === 'growth') return ['national'];
  if (view === 'autonomy') return ['national', 'tl2', 'tl2b', 'tl3'];
  return LEVELS;
}
export type View = (typeof VIEWS)[number];

export function routeView(): View {
  const v = route.path[0] ?? HOME[0];
  return (VIEWS as readonly string[]).includes(v) ? (v as View) : 'overview';
}

// the three-letter country of the route's second segment, else the default
export function routeCountry(): string {
  const c = route.path[1] ?? '';
  if (/^[A-Z]{3}$/.test(c) && (!manifest.countries.length || manifest.countries.some((x) => x.iso3 === c))) return c;
  return DEFAULT_COUNTRY;
}

// the route's year when it is one of `years`, else `fallback` (or the latest)
export function routeYear(years: number[], fallback?: number): number {
  const y = Number(route.path[2]);
  if (years.includes(y)) return y;
  if (fallback != null && years.includes(fallback)) return fallback;
  return years.length ? years[years.length - 1] : 0;
}

// The geography in view (?geo=national|tl2|tl2b|tl3|fua); FUA by default, so
// links made before the selector existed keep their meaning
export function routeGeo(): Level {
  const g = route.query.geo as Level;
  return LEVELS.includes(g) ? g : 'fua';
}
