// A land underlay for the map (every country, for context), from the
// world-atlas package on a CDN (Natural Earth 1:50m). Optional: a failed fetch
// leaves the map without it. The selected country's own boundary is not taken
// from here but from its national-level polygon (geo/topo.ts nationalOutline).
import * as topojson from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';

const URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
export interface Land { countries: Feature<Geometry>[] }
let cached: Promise<Land> | null = null;

export function landFeatures(): Promise<Land> {
  return (cached ??= fetch(URL).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const topo = (await r.json()) as Topology;
    const fc = topojson.feature(topo, topo.objects.countries as GeometryCollection) as any;
    return { countries: fc.features as Feature<Geometry>[] };
  }).catch(() => ({ countries: [] })));
}
