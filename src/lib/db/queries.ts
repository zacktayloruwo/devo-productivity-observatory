// Every query the views run. Country codes are validated against the
// manifest before they reach SQL; numeric parameters go through prepared
// statements.
import { query, lit } from './db';
import { manifest } from './manifest.svelte';

export interface FuaRow {
  cntry_iso3: string; fua_id: string; fua_name: string; year: number;
  pop: number | null; pop_source: string | null; depratio: number | null; patents: number | null;
  gdp_usdppp: number | null; gdp_pct_nat: number | null; gdppc_usdppp: number | null; gdppw_usdppp: number | null;
  labprod_usdppp: number | null; labprod_cov: number | null; popdens_km2: number | null;
}
export interface NatRow { cntry_iso3: string; year: number; gdp_pw: number | null; pop_nat: number | null; localexppct: number | null; lgexp_per_person: number | null }
export interface LaiRow { cntry_iso3: string; year: number; lai_total: number | null; lai_fiscal_score: number | null; [k: string]: any }
export interface RaiRow { cntry_iso3: string; year: number; rai_total: number | null; rai_fiscal_score: number | null; [k: string]: any }
export interface SourceRow { series: string; label: string; value_col: string; geo: string; collection: string; flow_name: string; description: string; agency: string; flow: string; version: string; retrieved_on: string; url: string }

const FUA_COLS = 'cntry_iso3, fua_id, fua_name, year, pop, pop_source, depratio, patents, gdp_usdppp, gdp_pct_nat, gdppc_usdppp, gdppw_usdppp, labprod_usdppp, labprod_cov, popdens_km2';

export function isCountry(iso3: string | undefined | null): iso3 is string {
  return !!iso3 && manifest.countries.some((c) => c.iso3 === iso3);
}
function requireCountry(iso3: string): string {
  if (!isCountry(iso3)) throw new Error(`unknown country ${iso3}`);
  return lit(iso3);
}
const VAR_IDS = () => manifest.variables.map((v) => v.id);
function requireVar(v: string): string {
  if (!VAR_IDS().includes(v)) throw new Error(`unknown variable ${v}`);
  return v;
}

// ---- one country, every FUA and year (the country's own file only)
export async function fuaCountry(iso3: string): Promise<FuaRow[]> {
  return (await query(`SELECT ${FUA_COLS} FROM fua WHERE cntry_iso3 = ${requireCountry(iso3)} ORDER BY fua_id, year`)) as FuaRow[];
}

// ---- every country, FUAs with labour productivity in one year (the scatter)
export async function fuaYearAll(year: number): Promise<FuaRow[]> {
  return (await query(`SELECT ${FUA_COLS} FROM fua WHERE year = ? AND labprod_usdppp IS NOT NULL ORDER BY cntry_iso3, fua_id`, [year])) as FuaRow[];
}

// ---- every country, its own latest year with labour productivity (distribution, R²)
export async function fuaLatestAll(): Promise<FuaRow[]> {
  return (await query(`
    WITH latest AS (SELECT cntry_iso3, max(year) AS year FROM fua WHERE labprod_usdppp IS NOT NULL GROUP BY cntry_iso3)
    SELECT ${FUA_COLS.split(', ').map((c) => 'f.' + c).join(', ')}
    FROM fua f JOIN latest l ON f.cntry_iso3 = l.cntry_iso3 AND f.year = l.year
    WHERE f.labprod_usdppp IS NOT NULL ORDER BY f.cntry_iso3, f.fua_id`)) as FuaRow[];
}

// ---- mean labour productivity and coefficient of variation by country-year
export interface CountryYear { cntry_iso3: string; year: number; mean_lp: number | null; cov: number | null; n: number }
export async function productivityByCountryYear(): Promise<CountryYear[]> {
  return (await query(`
    SELECT cntry_iso3, year, avg(labprod_usdppp) AS mean_lp, any_value(labprod_cov) AS cov, count(*)::BIGINT AS n
    FROM fua WHERE labprod_usdppp IS NOT NULL GROUP BY cntry_iso3, year ORDER BY cntry_iso3, year`)) as CountryYear[];
}

// ---- years for which any country has labour productivity (the snapshot year picker)
export async function productivityYears(): Promise<{ year: number; n: number; n_countries: number }[]> {
  return (await query(`SELECT year, count(*)::BIGINT AS n, count(DISTINCT cntry_iso3)::BIGINT AS n_countries FROM fua WHERE labprod_usdppp IS NOT NULL GROUP BY year ORDER BY year`)) as any;
}

// ---- national series
export async function natAll(): Promise<NatRow[]> {
  return (await query(`SELECT cntry_iso3, year, gdp_pw, pop_nat, localexppct, lgexp_per_person FROM nat ORDER BY cntry_iso3, year`)) as NatRow[];
}

// ---- autonomy indices
export async function laiAll(): Promise<LaiRow[]> {
  return (await query(`SELECT * FROM lai ORDER BY cntry_iso3, year`)) as LaiRow[];
}
export async function raiAll(): Promise<RaiRow[]> {
  return (await query(`SELECT * FROM rai ORDER BY cntry_iso3, year`)) as RaiRow[];
}

// ---- sources
export async function sourcesAll(): Promise<SourceRow[]> {
  return (await query(`SELECT * FROM sources ORDER BY flow_name, label`)) as SourceRow[];
}

// coverage of each value column for a country: first and last year with data
export interface Coverage { col: string; first_year: number | null; last_year: number | null }
export async function coverageFor(iso3: string): Promise<Coverage[]> {
  const c = requireCountry(iso3);
  const fuaCols = ['pop', 'depratio', 'patents', 'gdp_usdppp', 'gdp_pct_nat', 'gdppc_usdppp', 'labprod_usdppp', 'popdens_km2'];
  const natCols = ['gdp_pw', 'pop_nat', 'localexppct', 'lgexp_per_person'];
  const parts = [
    ...fuaCols.map((k) => `SELECT '${k}' AS col, min(year) AS first_year, max(year) AS last_year FROM fua WHERE cntry_iso3 = ${c} AND ${k} IS NOT NULL`),
    ...natCols.map((k) => `SELECT '${k}' AS col, min(year), max(year) FROM nat WHERE cntry_iso3 = ${c} AND ${k} IS NOT NULL`),
    `SELECT 'lai_total', min(year), max(year) FROM lai WHERE cntry_iso3 = ${c} AND lai_total IS NOT NULL`,
    `SELECT 'rai_total', min(year), max(year) FROM rai WHERE cntry_iso3 = ${c} AND rai_total IS NOT NULL`
  ];
  return (await query(parts.join(' UNION ALL '))) as Coverage[];
}

// ---- the map: one variable, one country (or all), every year, for the
// pooled quantile classes and the year shown
export interface MapValue { cntry_iso3: string; fua_id: string; fua_name: string; year: number; value: number | null; pop: number | null }
export async function mapValues(variable: string, iso3: string | null): Promise<MapValue[]> {
  const v = requireVar(variable);
  const where = iso3 ? `WHERE cntry_iso3 = ${requireCountry(iso3)} AND ${v} IS NOT NULL` : `WHERE ${v} IS NOT NULL`;
  return (await query(`SELECT cntry_iso3, fua_id, fua_name, year, ${v} AS value, pop FROM fua ${where} ORDER BY cntry_iso3, fua_id, year`)) as MapValue[];
}

// ---- one FUA, every year (the map inspector)
export async function fuaSeries(iso3: string, fuaId: string): Promise<FuaRow[]> {
  return (await query(`SELECT ${FUA_COLS} FROM fua WHERE cntry_iso3 = ${requireCountry(iso3)} AND fua_id = ? ORDER BY year`, [fuaId])) as FuaRow[];
}
