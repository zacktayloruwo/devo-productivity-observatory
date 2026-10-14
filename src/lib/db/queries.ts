// Every query the views run. Country codes are validated against the
// manifest before they reach SQL; numeric parameters go through prepared
// statements.
import { query, lit } from './db';
import { manifest, levelInfo, type Level } from './manifest.svelte';

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

// ---- labour productivity by unit (FUA, TL2 or TL3 region), one shape for
// the Productivity view: id, name, population and productivity
export type UnitLevel = 'fua' | 'tl2' | 'tl2b' | 'tl3';
export interface UnitRow { cntry_iso3: string; id: string; name: string; year: number; pop: number | null; lp: number | null; filled?: boolean }
const UNIT_LP: Record<UnitLevel, string> = { fua: 'labprod_usdppp', tl2: 'lp_lpr', tl2b: 'lp_lpr', tl3: 'lp_lpr' };
// The UK's own views read its gap-filled TL3 and TL2b (the OECD's 23 blank
// units filled from ONS and BRES, 2015-2023, rows marked `filled`); every
// cross-country view keeps the OECD-published tables
function regTable(level: Level, iso3: string | null): { table: string; filled: string } {
  if (iso3 === 'GBR' && (level === 'tl3' || level === 'tl2b') && manifest.value?.files.ukfill?.[level]) return { table: `${level}_uk`, filled: 'filled' };
  return { table: LEVEL_SQL[level].table, filled: 'false' };
}
function unitCols(level: UnitLevel, prefix = '', filled = 'false'): string {
  const L = LEVEL_SQL[level];
  // some recoded TL3 regions carry no name in the panel: show the code
  const name = level === 'fua' ? `${prefix}${L.name}` : `coalesce(${prefix}${L.name}, ${prefix}${L.id})`;
  return `${prefix}cntry_iso3, ${prefix}${L.id} AS id, ${name} AS name, ${prefix}year, ${prefix}${L.pop} AS pop, ${prefix}${UNIT_LP[level]} AS lp, ${filled} AS filled`;
}
function requireUnitLevel(level: string): UnitLevel {
  if (level !== 'fua' && level !== 'tl2' && level !== 'tl2b' && level !== 'tl3') throw new Error(`unknown level ${level}`);
  return level;
}

// one country, every unit and year (the country's own file only)
export async function unitsCountry(level: UnitLevel, iso3: string): Promise<UnitRow[]> {
  const lv = requireUnitLevel(level), T = regTable(lv, iso3);
  return (await query(`SELECT ${unitCols(lv, '', T.filled)} FROM ${T.table} WHERE cntry_iso3 = ${requireCountry(iso3)} ORDER BY id, year`)) as UnitRow[];
}

// every country, units with labour productivity in one year (the scatter)
export async function unitsYearAll(level: UnitLevel, year: number): Promise<UnitRow[]> {
  const lv = requireUnitLevel(level);
  return (await query(`SELECT ${unitCols(lv)} FROM ${LEVEL_SQL[lv].table} WHERE year = ? AND ${UNIT_LP[lv]} IS NOT NULL ORDER BY cntry_iso3, id`, [year])) as UnitRow[];
}

// every country, its own latest year with labour productivity (distribution, R²)
export async function unitsLatestAll(level: UnitLevel): Promise<UnitRow[]> {
  const lv = requireUnitLevel(level), T = LEVEL_SQL[lv].table, lp = UNIT_LP[lv];
  return (await query(`
    WITH latest AS (SELECT cntry_iso3, max(year) AS year FROM ${T} WHERE ${lp} IS NOT NULL GROUP BY cntry_iso3)
    SELECT ${unitCols(lv, 'f.')}
    FROM ${T} f JOIN latest l ON f.cntry_iso3 = l.cntry_iso3 AND f.year = l.year
    WHERE f.${lp} IS NOT NULL ORDER BY f.cntry_iso3, id`)) as UnitRow[];
}

// mean labour productivity and coefficient of variation (%) by country-year:
// the OECD's published value for FUAs, computed across regions for TL2/TL3
export interface CountryYear { cntry_iso3: string; year: number; mean_lp: number | null; cov: number | null; n: number }
export async function productivityByCountryYear(level: UnitLevel): Promise<CountryYear[]> {
  const lv = requireUnitLevel(level), lp = UNIT_LP[lv];
  const cov = lv === 'fua' ? 'any_value(labprod_cov)' : `100 * stddev_samp(${lp}) / avg(${lp})`;
  return (await query(`
    SELECT cntry_iso3, year, avg(${lp}) AS mean_lp, ${cov} AS cov, count(*)::BIGINT AS n
    FROM ${LEVEL_SQL[lv].table} WHERE ${lp} IS NOT NULL GROUP BY cntry_iso3, year ORDER BY cntry_iso3, year`)) as CountryYear[];
}

// years for which any country has labour productivity (the snapshot year picker)
export async function productivityYears(level: UnitLevel): Promise<{ year: number; n: number; n_countries: number }[]> {
  const lv = requireUnitLevel(level), lp = UNIT_LP[lv];
  return (await query(`SELECT year, count(*)::BIGINT AS n, count(DISTINCT cntry_iso3)::BIGINT AS n_countries FROM ${LEVEL_SQL[lv].table} WHERE ${lp} IS NOT NULL GROUP BY year ORDER BY year`)) as any;
}

// ---- TL2/TL3: one country, every region and year, with the columns the
// Overview and Autonomy views use
export interface RegionRow {
  cntry_iso3: string; reg_id: string; reg_name: string; year: number; lp_lpr: number | null; pop_total: number | null; lp_gap_frontier_pct: number | null;
  lai_total_reg: number | null; lai_fiscal_reg: number | null; lai_policy_reg: number | null;
  rai_total_reg: number | null; rai_selfrule_reg: number | null; rai_sharedrule_reg: number | null; rai_fiscalautonomy_reg: number | null;
  filled: boolean;
}
const REGION_COLS = 'cntry_iso3, reg_id, coalesce(reg_name, reg_id) AS reg_name, year, lp_lpr, pop_total, lp_gap_frontier_pct, lai_total_reg, lai_fiscal_reg, lai_policy_reg, rai_total_reg, rai_selfrule_reg, rai_sharedrule_reg, rai_fiscalautonomy_reg';
export async function regionsCountry(level: 'tl2' | 'tl2b' | 'tl3', iso3: string): Promise<RegionRow[]> {
  const lv = requireUnitLevel(level), T = regTable(lv, iso3);
  return (await query(`SELECT ${REGION_COLS}, ${T.filled} AS filled FROM ${T.table} WHERE cntry_iso3 = ${requireCountry(iso3)} ORDER BY reg_id, year`)) as RegionRow[];
}

// TL2/TL3: every country-year, the median and spread of regional
// productivity and the median gap to the country's frontier region
export interface RegionCountryYear { cntry_iso3: string; year: number; n: number; p10: number | null; p50: number | null; p90: number | null; gap_med: number | null }
export async function regionsByCountryYear(level: 'tl2' | 'tl2b' | 'tl3'): Promise<RegionCountryYear[]> {
  const lv = requireUnitLevel(level);
  return (await query(`
    SELECT cntry_iso3, year, count(*)::BIGINT AS n, quantile_cont(lp_lpr, 0.1) AS p10, quantile_cont(lp_lpr, 0.5) AS p50,
      quantile_cont(lp_lpr, 0.9) AS p90, quantile_cont(lp_gap_frontier_pct, 0.5) AS gap_med
    FROM ${lv} WHERE lp_lpr IS NOT NULL GROUP BY cntry_iso3, year ORDER BY cntry_iso3, year`)) as RegionCountryYear[];
}

// ---- the national table (national.parquet): productivity, growth,
// regional dispersion, autonomy and fiscal ratios, country by year
export interface NationalRow {
  cntry_iso3: string; year: number; gdp_pw: number | null; gdp_ph: number | null; gdp_pc: number | null; growth_gdp_pc: number | null; growth_gdp_pw: number | null; pop: number | null;
  rd_tl2_cv: number | null; rd_tl3_cv: number | null; rd_tl2_frontier_empsh: number | null;
  fiscal_dec_dj_z: number | null; administrative_dec_z: number | null; political_dec_z: number | null;
  imf_sd_sng: number | null; imf_rd_sng: number | null; imf_taxd_sng: number | null; ta_ab_share_scg: number | null; [k: string]: any;
}
export async function nationalAll(): Promise<NationalRow[]> {
  return (await query(`SELECT * FROM national ORDER BY cntry_iso3, year`)) as NationalRow[];
}

// ---- national series
export async function natAll(): Promise<NatRow[]> {
  // GDP per worker from the national panel (PDB levels), the series the
  // Devo Analysis treats as canonical; the rest from the datapack's nat file
  return (await query(`SELECT coalesce(n.cntry_iso3, p.cntry_iso3) AS cntry_iso3, coalesce(n.year, p.year) AS year,
    p.gdp_pw, n.pop_nat, n.localexppct, n.lgexp_per_person
    FROM nat n FULL OUTER JOIN national p ON n.cntry_iso3 = p.cntry_iso3 AND n.year = p.year
    ORDER BY 1, 2`)) as NatRow[];
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

// ---- the map: one variable at one level, one country (or all), every
// year, for the pooled quantile classes and the year shown
export interface MapValue { cntry_iso3: string; id: string; name: string; year: number; value: number | null; pop: number | null; filled?: boolean }
const LEVEL_SQL: Record<Level, { table: string; id: string; name: string; pop: string }> = {
  fua: { table: 'fua', id: 'fua_id', name: 'fua_name', pop: 'pop' },
  tl2: { table: 'tl2', id: 'reg_id', name: 'reg_name', pop: 'pop_total' },
  tl2b: { table: 'tl2b', id: 'reg_id', name: 'reg_name', pop: 'pop_total' },
  tl3: { table: 'tl3', id: 'reg_id', name: 'reg_name', pop: 'pop_total' },
  national: { table: 'national', id: 'cntry_iso3', name: 'cntry_iso3', pop: 'pop' }
};
function requireLevelVar(level: Level, v: string): string {
  if (!levelInfo(level).variables.some((x) => x.id === v)) throw new Error(`unknown ${level} variable ${v}`);
  return v;
}
export async function mapValues(level: Level, variable: string, iso3: string | null): Promise<MapValue[]> {
  const L = LEVEL_SQL[level], T = regTable(level, iso3);
  const v = requireLevelVar(level, variable);
  const where = iso3 ? `WHERE cntry_iso3 = ${requireCountry(iso3)} AND ${v} IS NOT NULL` : `WHERE ${v} IS NOT NULL`;
  return (await query(`SELECT cntry_iso3, ${L.id} AS id, ${L.name} AS name, year, ${v} AS value, ${L.pop} AS pop, ${T.filled} AS filled
    FROM ${T.table} ${where} ORDER BY cntry_iso3, id, year`)) as MapValue[];
}

// ---- one unit, every year and every indicator of its level (the map inspector)
export async function unitSeries(level: Level, iso3: string, id: string): Promise<Record<string, any>[]> {
  const L = LEVEL_SQL[level], T = regTable(level, iso3);
  const cols = levelInfo(level).variables.map((x) => x.id).join(', ');
  return await query(`SELECT year, ${cols}, ${T.filled} AS filled FROM ${T.table} WHERE cntry_iso3 = ${requireCountry(iso3)} AND ${L.id} = ? ORDER BY year`, [id]);
}
