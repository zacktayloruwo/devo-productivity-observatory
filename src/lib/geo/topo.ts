// Regional boundaries: one TopoJSON per country (objects national, tl2,
// tl2b where it exists, tl3) and a light all-countries national file, built by
// data-prep/build_geography.R. Each polygon carries its validity years
// (from, to); features(level, year) returns the polygons valid in that year.
//
// The decoded feature arrays are cached by the set of polygons valid, so a
// year change within one grid era returns the same array and the map keeps
// its zoom; a year that crosses an era boundary returns the other era's.
import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiLineString } from 'geojson';
import { versionedDataUrl, manifest } from '../db/manifest.svelte';
import { rewind, type MapFeature } from './geojson';

export type GeoLevel = 'national' | 'tl2' | 'tl2b' | 'tl3';
interface Props { id: string; name: string; parent: string; from?: number; to?: number }

const topoCache = new Map<string, Promise<Topology | null>>();
function loadTopo(file: string | undefined): Promise<Topology | null> {
  if (!file) return Promise.resolve(null);
  return (topoCache.get(file) ?? (() => {
    const p = fetch(versionedDataUrl(file)).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
      return (await r.json()) as Topology;
    });
    topoCache.set(file, p);
    p.catch(() => topoCache.delete(file));
    return p;
  })());
}

const decoded = new Map<string, MapFeature[]>();
function decode(topo: Topology, object: string, iso3: string, year: number | null, key: string): MapFeature[] {
  const obj = topo.objects[object] as GeometryCollection | undefined;
  if (!obj) return [];
  const props = (g: any) => (g.properties ?? {}) as Partial<Props>;
  const valid = obj.geometries.filter((g) => {
    const p = props(g); if (year == null) return true;
    return (p.from == null || p.from <= year) && (p.to == null || p.to >= year);
  });
  const sig = `${key}|${object}|${valid.map((g) => props(g).id + ':' + props(g).from).join(',')}`;
  const hit = decoded.get(sig);
  if (hit) return hit;
  const fc = topojson.feature(topo, { type: 'GeometryCollection', geometries: valid } as any) as any;
  const out = (fc.features as any[]).filter((f) => f.geometry).map((f) => rewind({
    type: 'Feature', geometry: f.geometry,
    properties: { id: String(f.properties.id), name: String(f.properties.name ?? f.properties.id), cntry_iso3: object === 'national' ? String(f.properties.id) : iso3 }
  } as MapFeature));
  decoded.set(sig, out);
  return out;
}

// The polygons of one country at a level, valid in `year`
export async function regionFeatures(iso3: string, level: GeoLevel, year: number | null): Promise<MapFeature[]> {
  const topo = await loadTopo(manifest.value?.files.regions?.[iso3]);
  return topo ? decode(topo, level, iso3, year, iso3) : [];
}

// Every country at a level. National uses the light all-countries file.
export async function regionFeaturesAll(level: GeoLevel, year: number | null): Promise<MapFeature[]> {
  if (level === 'national') {
    const topo = await loadTopo(manifest.value?.files.regions_all);
    return topo ? decode(topo, 'national', '', year, 'all') : [];
  }
  const isos = manifest.countries.map((c) => c.iso3);
  const parts = await Promise.all(isos.map((i) => regionFeatures(i, level, year)));
  // same parts as last time (same eras): same array, so the map keeps its zoom
  const prev = allCache.get(level);
  if (prev && prev.parts.length === parts.length && prev.parts.every((p, i) => p === parts[i])) return prev.out;
  const out = parts.flat();
  allCache.set(level, { parts, out });
  return out;
}
const allCache = new Map<string, { parts: MapFeature[][]; out: MapFeature[] }>();

// The TL2 borders inside a country, as one line (drawn over a TL3 map)
const meshCache = new Map<string, MultiLineString>();
export async function tl2Mesh(iso3: string): Promise<MultiLineString | null> {
  const hit = meshCache.get(iso3); if (hit) return hit;
  const topo = await loadTopo(manifest.value?.files.regions?.[iso3]);
  const obj = topo?.objects.tl2 as GeometryCollection | undefined;
  if (!topo || !obj) return null;
  const m = topojson.mesh(topo, obj, (a, b) => a !== b) as MultiLineString;
  meshCache.set(iso3, m);
  return m;
}

// A country's national boundary: the national object of its topology, which
// is merged from the same polygons as its TL2 and TL3 regions, so the outline
// coincides with the regions' outer edges
const outlineCache = new Map<string, MapFeature | null>();
export async function nationalOutline(iso3: string): Promise<MapFeature | null> {
  if (outlineCache.has(iso3)) return outlineCache.get(iso3)!;
  const f = (await regionFeatures(iso3, 'national', null))[0] ?? null;
  outlineCache.set(iso3, f);
  return f;
}
