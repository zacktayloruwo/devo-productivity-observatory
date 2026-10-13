// First-paint data: data/manifest.json, fetched without DuckDB so the chrome
// renders before the query engine has loaded. Written by data-prep/build_data.R.

export interface Country { iso3: string; iso2: string; display: string; data_name: string; region: Region }
export type Region = 'Anglo' | 'Continental Europe' | 'Asia';
export interface Variable { id: string; label: string; short: string; fmt: 'usd' | 'usd2' | 'num' | 'pct' | 'ratio' | 'score'; source?: string; group?: string }
export type Level = 'national' | 'tl2' | 'tl3' | 'fua';
export const LEVELS: Level[] = ['national', 'tl2', 'tl3', 'fua'];
export interface LevelInfo { variables: Variable[]; var_years: Record<string, number[]>; countries?: string[] }
export interface Manifest {
  built: string;
  ref_year: number;
  countries: Country[];
  variables: Variable[];
  var_years: Record<string, number[]>;
  years: { fua: number[]; lai: number[]; rai: number[]; nat: number[] };
  bboxes: Record<string, [number, number, number, number]>;   // xmin, ymin, xmax, ymax (lon/lat)
  no_geo: string[];
  files: { fua: Record<string, string>; geo: Record<string, string>; admin?: Record<string, string>; nat: string; lai: string; rai: string; sources: string; countries: string;
    tl2?: Record<string, string>; tl3?: Record<string, string>; national?: string; regions?: Record<string, string>; regions_all?: string };
  levels?: Record<Level, LevelInfo>;
  eras?: Record<string, Record<string, { from: number; to: number }[]>>;
  geo_sources?: {
    sources: Record<string, { url: string; file_url: string; grid: string; retrieved: string }>;
    source_by_country: Record<string, string>;
    units: Record<string, { tl2: number; tl3: number }>;
  };
}

type Status = 'idle' | 'loading' | 'ready' | 'missing' | 'error';
const S = $state<{ status: Status; manifest: Manifest | null; error: string }>({ status: 'idle', manifest: null, error: '' });

// data/ next to index.html, whatever the base path
export function dataUrl(file: string): string {
  return new URL('data/' + file, location.origin + location.pathname.replace(/[^/]*$/, '')).toString();
}
// A data URL that names its build, so no cache answers with another build's file.
export function versionedDataUrl(file: string): string {
  const v = S.manifest?.built;
  const u = dataUrl(file);
  return v ? `${u}?v=${encodeURIComponent(v)}` : u;
}

let started: Promise<void> | null = null;
export function loadManifest(): Promise<void> {
  return (started ??= (async () => {
    S.status = 'loading';
    try {
      const m = await fetch(dataUrl('manifest.json'), { cache: 'no-cache' });
      if (!m.ok) { S.status = 'missing'; return; }
      S.manifest = (await m.json()) as Manifest;
      S.status = 'ready';
    } catch (e: any) {
      S.error = e?.message ?? String(e);
      S.status = 'error';
    }
  })());
}

export const manifest = {
  get status(): Status { return S.status === 'idle' ? 'loading' : S.status; },
  get value(): Manifest | null { return S.manifest; },
  get error(): string { return S.error; },
  get countries(): Country[] { return S.manifest?.countries ?? []; },
  get variables(): Variable[] { return S.manifest?.variables ?? []; },
  get refYear(): number { return S.manifest?.ref_year ?? 2019; }
};

// The indicators offered at a level (FUA falls back to the original list)
export function levelInfo(level: Level): LevelInfo {
  const m = S.manifest;
  const info = m?.levels?.[level];
  if (info) return info;
  return { variables: m?.variables ?? [], var_years: m?.var_years ?? {}, countries: m?.countries.map((c) => c.iso3) };
}
// Whether a country has data at a level (Canada has no TL3)
export function levelHasCountry(level: Level, iso3: string): boolean {
  const c = levelInfo(level).countries;
  return !c || c.includes(iso3);
}

export function countryOf(iso3: string | undefined | null): Country | undefined {
  return manifest.countries.find((c) => c.iso3 === iso3);
}
export function countryName(iso3: string): string {
  return countryOf(iso3)?.display ?? iso3;
}

if (typeof window !== 'undefined') void loadManifest();
