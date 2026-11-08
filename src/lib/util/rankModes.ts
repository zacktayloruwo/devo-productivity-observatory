// The rank and change readings shared by the Map and the Productivity view:
// rank in the whole sample, rank within the country, and change over the
// fixed 2004-2019 window (2004 the first year of full FUA coverage, 2019 the
// last before the pandemic). See ranks.ts for the percentile classes.
import { rankAll, rankWithin, changes, type ChangeMethod, type Rank, type Change } from './ranks';
import { seriesBreak } from '../charts/breaks';
import { route, setQuery } from '../router.svelte';

export const CH0 = 2004, CH1 = 2019;
export type RankMode = 'values' | 'srank' | 'crank' | 'change';

// FUA dollar values are current prices: their change is nominal growth or
// the change in relative position (?chg=nominal; relative position by
// default); regional and national dollar values are constant prices (real
// growth); indicators that can be zero or negative change as a difference
export function changeMethodFor(level: string, fmt: string | undefined, pref: 'nominal' | 'relpos'): ChangeMethod {
  const usd = fmt === 'usd' || fmt === 'usd2';
  if (level === 'fua' && usd && pref === 'relpos') return 'relpos';
  return usd || fmt === 'num' ? 'growth' : 'diff';
}
export function chgPref(): 'nominal' | 'relpos' { return route.query.chg === 'nominal' ? 'nominal' : 'relpos'; }
export function setChgPref(c: 'nominal' | 'relpos') { setQuery({ chg: c === 'relpos' ? undefined : c }); }

// a known series break inside the window leaves a country's units out (UK TL3, TL2b)
export function breaksWindow(iso3: string | undefined, level: string): boolean {
  const b = iso3 ? seriesBreak(iso3, level) : null;
  return b != null && b > CH0 && b <= CH1;
}

export interface PoolRow { id: string; cntry_iso3: string; year: number; value: number | null }
export interface RankModeData { sRank: Map<string, Rank>; cRank: Map<string, Rank>; chg: Map<string, Change>; chgRank: Map<string, Rank>; nSample: number; nCountries: number }

// every reading for one level: ranks in `year`, change over the window
export function rankModeData(pool: PoolRow[], level: string, year: number, method: ChangeMethod): RankModeData {
  const inYear = pool.filter((r) => r.year === year && r.value != null);
  const country = new Map(pool.map((r) => [r.id, r.cntry_iso3]));
  const sRank = rankAll(inYear, (r) => r.value, (r) => r.id);
  const cRank = rankWithin(inYear, (r) => r.value, (r) => r.id, (r) => r.cntry_iso3);
  const chg = changes(pool, CH0, CH1, method, (id) => !breaksWindow(country.get(id), level));
  const chgRank = rankAll([...chg].map(([id, c]) => ({ id, v: c.change })), (x) => x.v, (x) => x.id);
  return { sRank, cRank, chg, chgRank, nSample: sRank.size, nCountries: new Set(inYear.map((r) => r.cntry_iso3)).size };
}
