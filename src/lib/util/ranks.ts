// Ranks, percentile classes and change over a window, for the map's
// "Rank in sample", "Rank in country" and "Change" modes.
//
// A percentile p in [0, 1] is the unit's position among the units compared:
// 0 the lowest, 1 the highest, ties sharing the mean of their positions.
// Classes are fixed percentile bands (bottom 10%, 10-25, 25-40, 40-60,
// 60-75, 75-90, top 10%) or quintiles, coloured red (low) to blue (high).

export type ClassScheme = 'bands' | 'quint';
export const SCHEME_CUTS: Record<ClassScheme, number[]> = {
  bands: [0.1, 0.25, 0.4, 0.6, 0.75, 0.9],
  quint: [0.2, 0.4, 0.6, 0.8]
};
// ColorBrewer RdBu: 7 classes for the bands, 5 for quintiles
export const SCHEME_COLOURS: Record<ClassScheme, string[]> = {
  bands: ['#b2182b', '#ef8a62', '#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac'],
  quint: ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0']
};
// below this many units in a comparison only bottom, middle and top are shown
export const MIN_UNITS = 5;

export interface Rank { rank: number; n: number; p: number }

// rank 1 = highest value; p from 0 (lowest) to 1 (highest)
export function rankAll<T>(rows: T[], value: (r: T) => number | null, id: (r: T) => string): Map<string, Rank> {
  const xs = rows.map((r) => ({ id: id(r), v: value(r) })).filter((x): x is { id: string; v: number } => x.v != null && Number.isFinite(x.v));
  xs.sort((a, b) => a.v - b.v);
  const n = xs.length, out = new Map<string, Rank>();
  for (let i = 0; i < n; ) {
    let j = i; while (j + 1 < n && xs[j + 1].v === xs[i].v) j++;
    const pos = (i + j) / 2;                     // mean ascending position of the tie
    const p = n > 1 ? pos / (n - 1) : 0.5;
    for (let k = i; k <= j; k++) out.set(xs[k].id, { rank: n - j, n, p });
    i = j + 1;
  }
  return out;
}

// the same within groups (each country)
export function rankWithin<T>(rows: T[], value: (r: T) => number | null, id: (r: T) => string, group: (r: T) => string): Map<string, Rank> {
  const groups = new Map<string, T[]>();
  for (const r of rows) { const g = group(r); const a = groups.get(g); if (a) a.push(r); else groups.set(g, [r]); }
  const out = new Map<string, Rank>();
  for (const g of groups.values()) for (const [k, v] of rankAll(g, value, id)) out.set(k, v);
  return out;
}

// class index for a percentile; with few units, only bottom / middle / top
export function classOfRank(r: Rank | undefined, scheme: ClassScheme): number {
  if (!r) return -1;
  const cuts = SCHEME_CUTS[scheme], top = cuts.length, mid = Math.floor(top / 2);
  if (r.n < MIN_UNITS) return r.n === 1 ? mid : r.rank === 1 ? top : r.rank === r.n ? 0 : mid;
  let k = 0; while (k < cuts.length && r.p >= cuts[k] - 1e-9) k++;
  return k;
}

// "Top 9%" / "Bottom 12%" / "Middle" style descriptions of a percentile
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

// ---- change over a window
export type ChangeMethod = 'growth' | 'diff' | 'relpos';
export interface Change { v0: number; v1: number; change: number }
// growth: compound annual growth (%); diff: v1 - v0 in the indicator's units;
// relpos: the unit's value relative to the mean of the units compared, at
// the end against the start, minus one (%), so common inflation drops out
export function changes(rows: { id: string; year: number; value: number | null }[], y0: number, y1: number, method: ChangeMethod, keep: (id: string) => boolean = () => true): Map<string, Change> {
  const a = new Map<string, number>(), b = new Map<string, number>();
  for (const r of rows) { if (r.value == null || !keep(r.id)) continue; if (r.year === y0) a.set(r.id, r.value); else if (r.year === y1) b.set(r.id, r.value); }
  const ids = [...a.keys()].filter((id) => b.has(id) && (method === 'diff' || (a.get(id)! > 0 && b.get(id)! > 0)));
  const out = new Map<string, Change>();
  if (method === 'relpos') {
    const m0 = ids.reduce((s, id) => s + a.get(id)!, 0) / ids.length, m1 = ids.reduce((s, id) => s + b.get(id)!, 0) / ids.length;
    for (const id of ids) out.set(id, { v0: a.get(id)!, v1: b.get(id)!, change: 100 * ((b.get(id)! / m1) / (a.get(id)! / m0) - 1) });
  } else if (method === 'growth') {
    for (const id of ids) out.set(id, { v0: a.get(id)!, v1: b.get(id)!, change: 100 * (Math.pow(b.get(id)! / a.get(id)!, 1 / (y1 - y0)) - 1) });
  } else {
    for (const id of ids) out.set(id, { v0: a.get(id)!, v1: b.get(id)!, change: b.get(id)! - a.get(id)! });
  }
  return out;
}
