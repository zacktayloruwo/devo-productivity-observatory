// Country colours and line styles, as in profile.qmd: the selected country is
// always red, the others take the palette in alphabetical order of display
// name; the line style follows the region (Anglo solid, Continental Europe
// dashed, Asia dotted).
import type { Country, Region } from './db/manifest.svelte';

export const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#9c755f', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7'];
export const REGIONS: Region[] = ['Anglo', 'Continental Europe', 'Asia'];
// SVG dash arrays per region
export const REGION_DASH: Record<Region, string> = { Anglo: '', 'Continental Europe': '7 3', Asia: '2 3' };

// iso3 -> colour, the focus country red
export function countryColours(countries: Country[], focus: string, focal: string): Map<string, string> {
  const others = countries.filter((c) => c.iso3 !== focus).sort((a, b) => a.display.localeCompare(b.display));
  const m = new Map<string, string>();
  others.forEach((c, i) => m.set(c.iso3, PALETTE[i % PALETTE.length]));
  m.set(focus, focal);
  return m;
}

// Countries grouped by region, each group sorted by name: the legend order
export function byRegion(countries: Country[]): { region: Region; items: Country[] }[] {
  return REGIONS.map((region) => ({ region, items: countries.filter((c) => c.region === region).sort((a, b) => a.display.localeCompare(b.display)) }))
    .filter((g) => g.items.length);
}

// WHO pandemic emergency: characterised 11 March 2020, PHEIC ended 5 May 2023.
export const COVID = [2020 + 2 / 12, 2023 + 4 / 12] as const;
