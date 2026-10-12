// Number formatting shared by tables, charts and hover boxes.
const LOC = 'en-CA';
const intF = new Intl.NumberFormat(LOC, { maximumFractionDigits: 0 });
const numCache = new Map<number, Intl.NumberFormat>();

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return intF.format(n);
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  let f = numCache.get(digits);
  if (!f) { f = new Intl.NumberFormat(LOC, { minimumFractionDigits: digits, maximumFractionDigits: digits }); numCache.set(digits, f); }
  return f.format(n);
}

// "$104,504"
export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n < 0 ? '-$' : '$') + intF.format(Math.abs(Math.round(n)));
}

// x is a percentage already (53.5) -> "53.5%"
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return fmtNum(x, digits) + '%';
}

// 13,070,873 -> "13.1M"; 348,303 -> "348K"
export function fmtShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return fmtNum(n / 1e9, 1) + 'B';
  if (a >= 1e6) return fmtNum(n / 1e6, 1) + 'M';
  if (a >= 1e3) return fmtNum(n / 1e3, 0) + 'K';
  return fmtNum(n, 0);
}

export type Fmt = 'usd' | 'num' | 'pct' | 'ratio' | 'score';
export function fmtBy(kind: Fmt, v: number | null | undefined): string {
  switch (kind) {
    case 'usd': return fmtUsd(v);
    case 'pct': return fmtPct(v, 1);
    case 'ratio': return fmtNum(v, 2);
    case 'score': return fmtNum(v, 2);
    default: return fmtInt(v);
  }
}
// a compact variant for axis ticks and legends
export function fmtShortBy(kind: Fmt, v: number | null | undefined): string {
  switch (kind) {
    case 'usd': return v == null ? '—' : '$' + fmtShort(v);
    case 'pct': return fmtPct(v, 1);
    case 'ratio': return fmtNum(v, 2);
    case 'score': return fmtNum(v, 2);
    default: return fmtShort(v);
  }
}

// "United States'" / "Canada's"
export function poss(name: string): string {
  return name.endsWith('s') ? name + '\u2019' : name + '\u2019s';
}
