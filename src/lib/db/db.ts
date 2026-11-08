// DuckDB-WASM data layer: one engine, one connection, one view per Parquet
// table listed in data/manifest.json, prepared statements, a small LRU cache.
//
// Boot is deferred until the first query (ensureDb()), so the chrome paints
// from manifest.json before ~3 MB of WASM arrives. Only the single-threaded
// bundles are offered: GitHub Pages cannot send the cross-origin isolation
// headers the threaded bundle needs.
//
// Data: the FUA and regional tables are segmented by country
// (fua/cntry_iso3=USA/part.parquet). A table's files are fetched whole, in
// parallel, the first time a query names the table (with the engine still
// booting, the first time), registered in the engine's memory, and the
// table's view built over them with the country as a column. Reading the
// files over HTTP range requests instead cost several sequential round trips
// per file, about a second for a level's 16 files; a level is at most 1.8 MB.
// Once the first query has returned, the remaining tables load in the
// background, so later views and levels need no network at all.
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

// ---- tables
const TABLES = ['national', 'tl2', 'fua', 'tl3', 'tl2b', 'tl3_uk', 'tl2b_uk', 'nat', 'lai', 'rai', 'sources', 'countries'] as const;
type TableName = (typeof TABLES)[number];
interface Part { file: string; iso3?: string }

// a table's files, with the country of each segmented file
function tableParts(name: TableName): Part[] {
  const f = manifest.value?.files as Record<string, any> | undefined;
  if (!f) throw new Error('no data build (manifest.json missing)');
  const seg = (o: Record<string, string> | undefined) => Object.entries(o ?? {}).filter(([iso]) => /^[A-Z]{3}$/.test(iso)).map(([iso3, file]) => ({ file, iso3 }));
  switch (name) {
    case 'fua': case 'tl2': case 'tl2b': case 'tl3': return seg(f[name]);
    // the UK's gap-filled TL3 and TL2b (its own views; cross-country views keep tl3/tl2b)
    case 'tl3_uk': case 'tl2b_uk': { const file = f.ukfill?.[name.replace('_uk', '')]; return file ? [{ file, iso3: 'GBR' }] : []; }
    default: return f[name] ? [{ file: f[name] }] : [];
  }
}

const tableReady = new Map<TableName, Promise<void>>();
function ensureTable(name: TableName): Promise<void> {
  const hit = tableReady.get(name); if (hit) return hit;
  const p = (async () => {
    if (!manifest.value) await loadManifest();
    const parts = tableParts(name);
    // the download starts at once, in parallel with the engine's boot
    const bufs = await Promise.all(parts.map(async (pt) => {
      const r = await fetch(versionedDataUrl(pt.file));
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${pt.file}`);
      return new Uint8Array(await r.arrayBuffer());
    }));
    await ensureDb();
    if (!parts.length) return;
    const regs = parts.map((_, i) => `${name}__${i}.parquet`);
    for (let i = 0; i < parts.length; i++) await db!.registerFileBuffer(regs[i], bufs[i]);
    const body = parts.map((pt, i) => pt.iso3 ? `SELECT *, '${pt.iso3}' AS cntry_iso3 FROM read_parquet('${regs[i]}')` : `SELECT * FROM read_parquet('${regs[i]}')`).join(' UNION ALL BY NAME ');
    await conn!.query(`CREATE OR REPLACE VIEW ${name} AS ${body}`);
  })();
  tableReady.set(name, p);
  p.catch(() => tableReady.delete(name));
  return p;
}
// the tables a statement names (whole words: tl2b_uk does not name tl2b)
const TABLE_RE = new RegExp(`\\b(${[...TABLES].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
function tablesIn(sql: string): TableName[] {
  return [...new Set([...sql.matchAll(TABLE_RE)].map((m) => m[1] as TableName))];
}

// after the first view: every other table, one at a time, when the browser is idle
let prefetching = false;
function schedulePrefetch(): void {
  if (prefetching || typeof window === 'undefined') return;
  prefetching = true;
  const idle: (f: () => void) => void = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
  setTimeout(() => idle(async () => { for (const t of TABLES) { try { await ensureTable(t); } catch { /* fetched on demand instead */ } } }), 1500);
}

async function boot(): Promise<void> {
  await Promise.all([startEngine(), loadManifest()]);
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
    await Promise.all([ensureDb(), ...tablesIn(sql).map(ensureTable)]);
    let rows: Row[];
    if (params.length) {
      const stmt = await conn!.prepare(sql);
      try { rows = toRows(await stmt.query(...params)); } finally { await stmt.close(); }
    } else {
      rows = toRows(await conn!.query(sql));
    }
    cache.set(key, rows);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    schedulePrefetch();
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
