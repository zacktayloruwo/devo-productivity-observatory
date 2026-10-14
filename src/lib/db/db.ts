// DuckDB-WASM data layer: one engine, one connection, one view per Parquet
// table listed in data/manifest.json, prepared statements, a small LRU cache.
//
// Boot is deferred until the first query (ensureDb()), so the chrome paints
// from manifest.json before ~3 MB of WASM arrives. Only the single-threaded
// bundles are offered: GitHub Pages cannot send the cross-origin isolation
// headers the threaded bundle needs.
//
// The FUA table is segmented by country in Hive layout
// (fua/cntry_iso3=USA/part.parquet). The `fua` view reads the whole list with
// hive_partitioning on, so a `WHERE cntry_iso3 = ?` filter is pushed down to
// the partition column and only that country's file is fetched; the
// cross-country views read them all (about 400 KB in total).
//
// All SQL lives in src/lib/db/queries.ts. Components never build SQL.

import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import type { Table } from 'apache-arrow';
import { versionedDataUrl, loadManifest, manifest } from './manifest.svelte';
import { dbStatus } from './status.svelte';

export type Row = Record<string, any>;

declare global {
  interface Window { __duckdbEh?: Promise<Blob | null> }
}

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready: Promise<void> | null = null;

async function startEngine(): Promise<void> {
  const bundles: duckdb.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
    eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker }
  };
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!);
  db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  let main = bundle.mainModule, blobUrl: string | null = null;
  if (bundle.mainModule === duckdb_wasm_eh && typeof window !== 'undefined' && window.__duckdbEh) {
    const blob = await window.__duckdbEh.catch(() => null);
    if (blob) { blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/wasm' })); main = blobUrl; }
  }
  try { await db.instantiate(main, bundle.pthreadWorker); }
  finally { if (blobUrl) URL.revokeObjectURL(blobUrl); }
  // GitHub Pages gzips .parquet when the browser accepts it, so a HEAD
  // reports the compressed length; take sizes from range responses instead.
  await db.open({ filesystem: { reliableHeadRequests: false } });
  conn = await db.connect();
}

async function createViews(): Promise<void> {
  const m = manifest.value;
  if (!m) throw new Error('no data build (manifest.json missing)');
  const q = (f: string) => `'${versionedDataUrl(f)}'`;
  const fuaList = Object.values(m.files.fua).map(q).join(', ');
  await conn!.query(`CREATE OR REPLACE VIEW fua AS SELECT * FROM read_parquet([${fuaList}], hive_partitioning = true, union_by_name = true)`);
  await conn!.query(`CREATE OR REPLACE VIEW nat AS SELECT * FROM read_parquet(${q(m.files.nat)})`);
  // regional levels: segmented by country like the FUA table
  for (const lv of ['tl2', 'tl2b', 'tl3'] as const) {
    const files = Object.values(m.files[lv] ?? {});
    if (files.length) await conn!.query(`CREATE OR REPLACE VIEW ${lv} AS SELECT * FROM read_parquet([${files.map(q).join(', ')}], hive_partitioning = true, union_by_name = true)`);
  }
  if (m.files.national) await conn!.query(`CREATE OR REPLACE VIEW national AS SELECT * FROM read_parquet(${q(m.files.national)})`);
  await conn!.query(`CREATE OR REPLACE VIEW lai AS SELECT * FROM read_parquet(${q(m.files.lai)})`);
  await conn!.query(`CREATE OR REPLACE VIEW rai AS SELECT * FROM read_parquet(${q(m.files.rai)})`);
  await conn!.query(`CREATE OR REPLACE VIEW sources AS SELECT * FROM read_parquet(${q(m.files.sources)})`);
  await conn!.query(`CREATE OR REPLACE VIEW countries AS SELECT * FROM read_parquet(${q(m.files.countries)})`);
}

async function boot(): Promise<void> {
  await Promise.all([startEngine(), loadManifest()]);
  await createViews();
}

export function ensureDb(): Promise<void> {
  if (!ready) {
    dbStatus.booting = true;
    ready = boot().catch((e) => { ready = null; throw e; }).finally(() => { dbStatus.booting = false; });
  }
  return ready;
}

function toRows(table: Table): Row[] {
  const out: Row[] = [];
  const cols = table.schema.fields.map((f) => f.name);
  for (const r of table) {
    const o: Row = {};
    for (const c of cols) {
      let v = (r as any)[c];
      if (typeof v === 'bigint') v = Number(v);
      else if (v instanceof Date) v = v.toISOString();
      else if (v && typeof v === 'object' && typeof v.toArray === 'function') v = Array.from(v.toArray());
      o[c] = v;
    }
    out.push(o);
  }
  return out;
}

let inflight = 0;
const CACHE_MAX = 200;
const cache = new Map<string, Row[]>();

export async function query(sql: string, params: any[] = []): Promise<Row[]> {
  const key = sql + ' ' + JSON.stringify(params);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  inflight++; dbStatus.pending = inflight;
  try {
    await ensureDb();
    let rows: Row[];
    if (params.length) {
      const stmt = await conn!.prepare(sql);
      try { rows = toRows(await stmt.query(...params)); } finally { await stmt.close(); }
    } else {
      rows = toRows(await conn!.query(sql));
    }
    cache.set(key, rows);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    return rows;
  } finally { inflight--; dbStatus.pending = inflight; }
}

export async function one(sql: string, params: any[] = []): Promise<Row | null> {
  const r = await query(sql, params);
  return r[0] ?? null;
}

// SQL literal for values already validated against a whitelist.
export function lit(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

// a console hook for debugging queries in development only
if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__query = query;
