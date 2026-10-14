// Map projections chosen per country, and the fixed insets for parts far
// from the mainland (Alaska and Hawaii; the French overseas departments;
// the Canary Islands; Okinawa; Svalbard and Jan Mayen). Each inset is a small panel with its own
// projection that does not pan or zoom with the main map.
//
// Conic conformal projections with each country's customary parallels
// (Lambert-93 for France, the Statistics Canada Lambert, the CONUS Lambert,
// ...); Great Britain, the Nordic countries and New Zealand on transverse
// Mercator (the National Grid, SWEREF 99 TM, ETRS-TM35FIN, NZTM meridians);
// Australia on the GDA Albers parallels; every country at once on Equal Earth.
import { geoConicConformal, geoTransverseMercator, geoEqualEarth, geoMercator, geoCentroid, type GeoProjection } from 'd3-geo';
import type { Feature, Geometry } from 'geojson';

export interface Inset {
  id: string;
  label: string;
  // whether a feature (by its centroid) belongs to this inset
  test: (lon: number, lat: number) => boolean;
  make: () => GeoProjection;
}
export interface Layout { make: () => GeoProjection; insets: Inset[] }

const conic = (lon0: number, p1: number, p2: number) => () => geoConicConformal().rotate([-lon0, 0]).parallels([p1, p2]);
const inBox = (x0: number, y0: number, x1: number, y1: number) => (lon: number, lat: number) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;

const LAYOUTS: Record<string, Layout> = {
  USA: { make: conic(-96, 33, 45), insets: [
    { id: 'AK', label: 'Alaska', test: inBox(-180, 50, -128, 72), make: conic(-154, 55, 65) },
    { id: 'HI', label: 'Hawaii', test: inBox(-161, 18, -154, 23), make: conic(-157, 8, 18) }
  ] },
  CAN: { make: conic(-91.87, 49, 77), insets: [] },
  FRA: { make: conic(3, 44, 49), insets: [
    { id: 'ANT', label: 'Antilles', test: inBox(-63, 13, -59, 18.5), make: conic(-61, 14, 16) },
    { id: 'GUF', label: 'Guyane', test: inBox(-55, 1.5, -50, 6.5), make: () => geoMercator().rotate([52.5, 0]) },
    { id: 'REU', label: 'La Réunion', test: inBox(54.5, -21.8, 56.2, -20.5), make: () => geoMercator().rotate([-55.5, 0]) },
    { id: 'MYT', label: 'Mayotte', test: inBox(44.5, -13.5, 45.8, -12.3), make: () => geoMercator().rotate([-45.2, 0]) }
  ] },
  DEU: { make: conic(10.5, 48.67, 52.67), insets: [] },
  ITA: { make: conic(12.5, 38, 46), insets: [] },
  ESP: { make: conic(-3, 37, 43), insets: [
    { id: 'CAN', label: 'Canary Islands', test: inBox(-19, 27, -13, 29.8), make: conic(-15.5, 27.5, 28.8) }
  ] },
  GBR: { make: () => geoTransverseMercator().rotate([2, 0]), insets: [] },
  JPN: { make: conic(135, 33, 42), insets: [
    { id: 'OKI', label: 'Okinawa', test: inBox(122, 24, 131, 27.5), make: conic(127.5, 25, 27) }
  ] },
  KOR: { make: conic(127.5, 34, 38), insets: [] },
  AUS: { make: conic(132, -18, -36), insets: [] },
  NZL: { make: () => geoTransverseMercator().rotate([-173, 0]), insets: [] },
  BEL: { make: conic(4.36, 49.83, 51.17), insets: [] },
  NLD: { make: conic(5.4, 51, 53), insets: [] },
  FIN: { make: () => geoTransverseMercator().rotate([-27, 0]), insets: [] },
  SWE: { make: () => geoTransverseMercator().rotate([-15, 0]), insets: [] },
  NOR: { make: () => geoTransverseMercator().rotate([-15, 0]), insets: [
    // Svalbard and Jan Mayen are one TL2 region; its centroid is on Svalbard
    { id: 'SJM', label: 'Svalbard and Jan Mayen', test: inBox(-10, 73.5, 35, 81.5), make: () => geoTransverseMercator().rotate([-15, 0]) }
  ] }
};

export const WORLD: Layout = { make: () => geoEqualEarth(), insets: [] };

export function layoutFor(iso3: string | null): Layout {
  return (iso3 && LAYOUTS[iso3]) || WORLD;
}

// Split features between the main map and the insets (by centroid); insets
// with no feature are dropped.
export function splitFeatures<F extends Feature<Geometry, any>>(features: F[], layout: Layout): { main: F[]; insets: { inset: Inset; features: F[] }[] } {
  const groups = new Map<string, F[]>();
  const main: F[] = [];
  for (const f of features) {
    const [lon, lat] = geoCentroid(f as any);
    const ins = layout.insets.find((i) => i.test(lon, lat));
    if (ins) { const a = groups.get(ins.id) ?? []; a.push(f); groups.set(ins.id, a); } else main.push(f);
  }
  return { main, insets: layout.insets.filter((i) => groups.has(i.id)).map((inset) => ({ inset, features: groups.get(inset.id)! })) };
}
