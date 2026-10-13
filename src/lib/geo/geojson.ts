// FUA boundary files: one GeoJSON per country, fetched once and kept.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { geoArea } from 'd3-geo';
import { versionedDataUrl, manifest } from '../db/manifest.svelte';

// d3-geo takes exterior rings clockwise and holes counter-clockwise, the
// opposite of RFC 7946 (which the files follow), so every ring is rewound:
// as a polygon on its own, an exterior ring must cover less than a
// hemisphere and a hole more.
const HEMI = 2 * Math.PI;
function rewindRing(ring: Position[], exterior: boolean): Position[] {
  const a = geoArea({ type: 'Polygon', coordinates: [ring] });
  return (exterior ? a > HEMI : a < HEMI) ? ring.slice().reverse() : ring;
}
function rewindPolygon(rings: Position[][]): Position[][] {
  return rings.map((r, i) => rewindRing(r, i === 0));
}
export function rewind<F extends Feature<Polygon | MultiPolygon, any>>(f: F): F {
  const g = f.geometry;
  if (!g || !('coordinates' in g)) return f;
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: rewindPolygon(g.coordinates) } };
  return { ...f, geometry: { ...g, coordinates: g.coordinates.map(rewindPolygon) } };
}

// Every map layer (FUA, TL3, TL2, national) is drawn from this one shape
export type MapFeature = Feature<Polygon | MultiPolygon, { id: string; name: string; cntry_iso3: string }>;
export type FuaFeature = MapFeature;

const loaded = new Map<string, Promise<FuaFeature[]>>();

export function geoFor(iso3: string): Promise<FuaFeature[]> {
  const file = manifest.value?.files.geo[iso3];
  if (!file) return Promise.resolve([]);
  return (loaded.get(iso3) ?? (() => {
    const p = fetch(versionedDataUrl(file)).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
      const fc = (await r.json()) as FeatureCollection;
      return fc.features.map((f) => {
        const p = f.properties as any;
        return rewind({ ...f, properties: { id: p.fua_id, name: p.fua_name, cntry_iso3: iso3 } } as MapFeature);
      });
    });
    loaded.set(iso3, p);
    p.catch(() => loaded.delete(iso3));
    return p;
  })());
}

// First-tier subnational governments (provinces, states, Länder) for the
// countries the build lists; none for the others.
export type AdminFeature = Feature<Polygon | MultiPolygon, { id: string; name: string; cntry_iso3: string }>;
const adminLoaded = new Map<string, Promise<AdminFeature[]>>();
export function adminFor(iso3: string): Promise<AdminFeature[]> {
  const file = manifest.value?.files.admin?.[iso3];
  if (!file) return Promise.resolve([]);
  return (adminLoaded.get(iso3) ?? (() => {
    const p = fetch(versionedDataUrl(file)).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
      const fc = (await r.json()) as FeatureCollection;
      return fc.features.map((f) => rewind({ ...f, properties: { ...(f.properties as any), cntry_iso3: iso3 } } as AdminFeature));
    });
    adminLoaded.set(iso3, p);
    p.catch(() => adminLoaded.delete(iso3));
    return p;
  })());
}
export async function adminForAll(isos: string[]): Promise<AdminFeature[]> {
  return (await Promise.all(isos.map(adminFor))).flat();
}

export async function geoForAll(isos: string[]): Promise<FuaFeature[]> {
  const parts = await Promise.all(isos.map(geoFor));
  return parts.flat();
}
