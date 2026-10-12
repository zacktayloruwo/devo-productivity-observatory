// A land underlay and the national borders for the map, from the world-atlas
// package on a CDN (Natural Earth 1:50m). Optional: a failed fetch leaves the
// map without them.
import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString } from 'geojson';

const URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
export interface Land { countries: Feature<Geometry>[]; borders: MultiLineString | null }
let cached: Promise<Land> | null = null;

// world-atlas feature ids are ISO 3166-1 numeric codes
const NUMERIC: Record<string, string> = { CAN: '124', FRA: '250', DEU: '276', ITA: '380', JPN: '392', KOR: '410', ESP: '724', GBR: '826', USA: '840' };
// the national boundary of one country: its outline in the world-atlas set
export function countryOutline(land: Land, iso3: string | null): Feature<Geometry> | null {
  if (!iso3) return null;
  return land.countries.find((f) => String(f.id) === NUMERIC[iso3]) ?? null;
}

export function landFeatures(): Promise<Land> {
  return (cached ??= fetch(URL).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const topo = (await r.json()) as Topology;
    const obj = topo.objects.countries as GeometryCollection;
    const fc = topojson.feature(topo, obj) as any;
    // interior borders only (arcs shared by two countries): the coast is the land's edge
    const borders = topojson.mesh(topo, obj, (a, b) => a !== b) as MultiLineString;
    return { countries: fc.features as Feature<Geometry>[], borders };
  }).catch(() => ({ countries: [], borders: null })));
}
