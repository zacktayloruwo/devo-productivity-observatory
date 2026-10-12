// Route state shared by the views: `#/<view>/<ISO3>/...`. The country is the
// second path segment on every view; a bare view opens the default.
import { route } from './router.svelte';
import { manifest } from './db/manifest.svelte';

export const DEFAULT_COUNTRY = 'USA';
export const VIEWS = ['overview', 'productivity', 'autonomy', 'map', 'sources', 'about'] as const;
export type View = (typeof VIEWS)[number];

export function routeView(): View {
  const v = route.path[0] ?? 'overview';
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
