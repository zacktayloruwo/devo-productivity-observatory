// Small statistics used by the views: quantiles, OLS, correlation, quantile
// class bounds for the map.
import { rampColour, type Ramp } from '../theme/ramps';

export function quantileSorted(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const h = (xs.length - 1) * p;
  const i = Math.floor(h);
  return i + 1 < xs.length ? xs[i] + (h - i) * (xs[i + 1] - xs[i]) : xs[i];
}
export function quantile(values: number[], p: number): number {
  return quantileSorted([...values].sort((a, b) => a - b), p);
}
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
export function median(xs: number[]): number { return quantile(xs, 0.5); }

// Ordinary least squares y = a + b x
export function ols(pts: [number, number][]): { a: number; b: number; r2: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { a: my - b * mx, b, r2 };
}

// Class bounds for k quantile classes: [min, q(1/k), ..., max]. Tied
// quantiles collapse, so fewer classes may come back.
export function quantileBounds(values: Iterable<number | null | undefined>, k = 5): number[] {
  const xs: number[] = [];
  for (const v of values) if (v != null && Number.isFinite(v)) xs.push(v);
  if (!xs.length) return [];
  xs.sort((a, b) => a - b);
  const lo = xs[0], hi = xs[xs.length - 1];
  if (lo === hi) return [lo, hi];
  const inner: number[] = [];
  for (let i = 1; i < k; i++) {
    const q = quantileSorted(xs, i / k);
    if (q > lo && q < hi && q !== inner[inner.length - 1]) inner.push(q);
  }
  return [lo, ...inner, hi];
}

export function classOf(v: number | null | undefined, bounds: number[]): number {
  if (v == null || !Number.isFinite(v) || bounds.length < 2) return -1;
  const n = bounds.length - 1;
  for (let i = n - 1; i >= 1; i--) if (v >= bounds[i]) return i;
  return 0;
}

export function classColours(ramp: Ramp, n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [rampColour(ramp, 1)];
  const lo = 0.15;
  return Array.from({ length: n }, (_, i) => rampColour(ramp, lo + (1 - lo) * (i / (n - 1))));
}

export function classLabels(bounds: number[], fmt: (x: number) => string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = fmt(bounds[i]), b = fmt(bounds[i + 1]);
    out.push(a === b ? a : `${a}–${b}`);
  }
  return out;
}
