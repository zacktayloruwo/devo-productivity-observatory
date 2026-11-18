// The rank and change readings shared by the Map and the Productivity view:
// rank across all countries, rank within the country, and change over the
// range chosen under "Change over time" in the top bar (changeRange.ts;
// 2004-2019 by default). See ranks.ts for the percentile classes.
import { rankAll, rankWithin, changes, type ChangeMethod, type Rank, type Change } from './ranks';
import { seriesBreak } from '../charts/breaks';
import { route, setQuery } from '../router.svelte';

export type RankMode = 'values' | 'srank' | 'crank' | 'change';

// FUA dollar values are current prices: their change is nominal growth (by
// default, so the sign follows the values) or the change in relative
// position against the average FUA (?chg=relpos); regional and national dollar values are constant prices (real
// growth); indicators that can be zero or negative change as a difference
export function changeMethodFor(level: string, fmt: string | undefined, pref: 'nominal' | 'relpos'): ChangeMethod {
  const usd = fmt === 'usd' || fmt === 'usd2';
  if (level === 'fua' && usd && pref === 'relpos') return 'relpos';
  return usd || fmt === 'num' ? 'growth' : 'diff';
}
export function chgPref(): 'nominal' | 'relpos' { return route.query.chg === 'relpos' ? 'relpos' : 'nominal'; }
export function setChgPref(c: 'nominal' | 'relpos') { setQuery({ chg: c === 'nominal' ? undefined : c }); }

// a known series break inside the window leaves a country's units out (UK TL3, TL2b)
export function breaksWindow(iso3: string | undefined, level: string, range: [number, number]): boolean {
  // the sample is the UK's own (consistent) series at TL3 and TL2b
  const b = iso3 ? seriesBreak(iso3, level) : null;
  return b != null && b > range[0] && b <= range[1];
}

export interface PoolRow { id: string; cntry_iso3: string; year: number; value: number | null }
export interface RankModeData { sRank: Map<string, Rank>; cRank: Map<string, Rank>; chg: Map<string, Change>; chgRank: Map<string, Rank>; nSample: number; nCountries: number }

// every reading for one level: ranks in `year`, change over the window
export function rankModeData(pool: PoolRow[], level: string, year: number, method: ChangeMethod, range: [number, number]): RankModeData {
  const inYear = pool.filter((r) => r.year === year && r.value != null);
  const country = new Map(pool.map((r) => [r.id, r.cntry_iso3]));
  const sRank = rankAll(inYear, (r) => r.value, (r) => r.id);
  const cRank = rankWithin(inYear, (r) => r.value, (r) => r.id, (r) => r.cntry_iso3);
  const chg = changes(pool, range[0], range[1], method, (id) => !breaksWindow(country.get(id), level, range));
  const chgRank = rankAll([...chg].map(([id, c]) => ({ id, v: c.change })), (x) => x.v, (x) => x.id);
  return { sRank, cRank, chg, chgRank, nSample: sRank.size, nCountries: new Set(inYear.map((r) => r.cntry_iso3)).size };
}
