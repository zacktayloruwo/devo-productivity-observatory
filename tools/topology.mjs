// Builds one TopoJSON per country from the full-resolution sources that
// data-prep/build_geography.R writes (cache/src/<ISO3>.tl3.geojson and
// <ISO3>.tl2.geojson), and a light all-countries national file.
//
//   node tools/topology.mjs <src_dir> <out_dir> CAN,FRA,...
//
// Per country the objects are tl3 (where the country has TL3 data), tl2 and
// national. They are imported into one mapshaper dataset, so every border is
// a single arc: TL2 and national are dissolved from TL3 (all but the USA) and
// simplification moves shared arcs together, so the levels stay nested.
// Simplification is to a vertex budget per country, keeping every shape.
// Polygons valid in different years (eras) share arcs where unchanged.
import mapshaper from 'mapshaper';
import { topology } from 'topojson-server';
import { existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [srcDir, outDir, list] = process.argv.slice(2);
const countries = list.split(',');
const BUDGET = 25000;       // vertices kept per country, per independent layer set
const LIGHT = 4000;         // vertices per country in the all-countries national file

function vertexCount(geojson) {
  let n = 0;
  const walk = (c) => { if (typeof c[0] === 'number') n++; else c.forEach(walk); };
  for (const f of geojson.features) if (f.geometry) walk(f.geometry.coordinates);
  return n;
}

async function run(cmd, input) {
  return mapshaper.applyCommands(cmd, input);
}

const lightParts = [];
for (const iso of countries) {
  const tl3 = join(srcDir, `${iso}.tl3.geojson`);
  const tl2 = join(srcDir, `${iso}.tl2.geojson`);
  const has3 = existsSync(tl3);
  const input = { 'tl2.json': readFileSync(tl2, 'utf8') };
  if (has3) input['tl3.json'] = readFileSync(tl3, 'utf8');
  const nested = has3 && iso !== 'USA';
  // TL2b (NUTS 2 where the OECD's TL2 is NUTS 1): TL3 dissolved by its tl2b
  // field, attributes joined from <ISO3>.tl2b.csv
  const tl2bCsv = join(srcDir, `${iso}.tl2b.csv`);
  const has2b = nested && existsSync(tl2bCsv);
  if (has2b) input['tl2b.csv'] = readFileSync(tl2bCsv, 'utf8');
  const tl2bCmd = has2b
    ? `-dissolve tl2b target=tl3 + name=tl2b_d -filter "tl2b != null && tl2b !== ''" target=tl2b_d ` +
      `-i tl2b.csv name=tl2b_attr string-fields=id,parent ` +
      `-join tl2b_attr keys=tl2b,id fields=id,name,parent,from,to target=tl2b_d -rename-layers tl2b target=tl2b_d -drop target=tl2b_attr `
    : '';
  const targets = has2b ? 'tl3,tl2b,tl2,national' : 'tl3,tl2,national';
  const v = vertexCount(JSON.parse(has3 ? input['tl3.json'] : input['tl2.json']));
  const keepFor = (n) => Math.max(0.2, Math.min(100, (100 * BUDGET) / n)).toFixed(3);
  const keep = keepFor(v);

  // Nested countries: TL2 and national dissolved from TL3 in the same arc
  // table. USA: TL3 and TL2 imported together (shared arcs where they
  // coincide), national dissolved from TL2.
  const cmd = nested
    ? `-i tl3.json name=tl3 ${tl2bCmd}-dissolve parent target=tl3 copy-fields=parent + name=tl2_d -i tl2.json name=tl2_attr ` +
      `-join tl2_attr keys=parent,id fields=id,name,from,to target=tl2_d -rename-layers tl2 target=tl2_d ` +
      `-drop target=tl2_attr -dissolve target=tl2 + name=national ` +
      `-simplify ${keep}% keep-shapes target=* -clean target=* ` +
      `-o format=topojson quantization=100000 target=${targets} out.json`
    : has3
      ? `-i combine-files tl3.json tl2.json -rename-layers tl3,tl2 -dissolve target=tl2 + name=national ` +
        `-simplify ${keep}% keep-shapes target=* -clean target=* ` +
        `-o format=topojson quantization=100000 target=tl3,tl2,national out.json`
      : `-i tl2.json name=tl2 -dissolve + name=national ` +
        `-simplify ${keep}% keep-shapes target=* -clean target=* ` +
        `-o format=topojson quantization=100000 target=tl2,national out.json`;
  let topo;
  if (has3 && !nested) {
    // TL3 and TL2 from separate surveys (USA): simplify each on its own arc
    // table, then build one topology (arcs shared only where identical)
    const v2 = vertexCount(JSON.parse(input['tl2.json']));
    const a = await run(`-i tl3.json name=tl3 -simplify ${keep}% keep-shapes -clean -o format=geojson tl3.out.json`, { 'tl3.json': input['tl3.json'] });
    const b = await run(`-i tl2.json name=tl2 -simplify ${keepFor(v2)}% keep-shapes -clean -dissolve2 gap-fill-area=20km2 + name=national ` +
      `-o format=geojson geojson-type=FeatureCollection target=tl2 tl2.out.json ` +
      `-o format=geojson geojson-type=FeatureCollection target=national national.out.json`, { 'tl2.json': input['tl2.json'] });
    const gj = (buf) => JSON.parse(buf.toString());
    const layers = { tl3: gj(a['tl3.out.json']), tl2: gj(b['tl2.out.json']), national: gj(b['national.out.json']) };
    topo = topology(layers, 1e5);
  } else {
    const out = await run(cmd, input);
    topo = JSON.parse(out['out.json'].toString());
  }
  // national: the country code as id and name
  for (const g of topo.objects.national.geometries) g.properties = { id: iso, name: iso, parent: '' };
  // tl2 from the dissolve keeps the join's fields; drop helper fields
  for (const g of topo.objects.tl2.geometries) {
    const p = g.properties ?? {};
    g.properties = { id: p.id ?? p.parent, name: p.name ?? p.id ?? p.parent, parent: iso, from: p.from, to: p.to };
  }
  // tl2b: the joined attributes; tl3 drops its helper field
  for (const g of topo.objects.tl2b?.geometries ?? []) {
    const p = g.properties ?? {};
    g.properties = { id: p.id ?? p.tl2b, name: p.name ?? p.id ?? p.tl2b, parent: p.parent, from: p.from, to: p.to };
  }
  for (const g of topo.objects.tl3?.geometries ?? []) if (g.properties) delete g.properties.tl2b;
  const file = join(outDir, `${iso}.topo.json`);
  writeFileSync(file, JSON.stringify(topo));
  const n = (k) => topo.objects[k]?.geometries.length ?? 0;
  console.log(`${iso}  tl3 ${String(n('tl3')).padStart(3)}  tl2b ${String(n('tl2b')).padStart(2)}  tl2 ${String(n('tl2')).padStart(2)}  ${(statSync(file).size / 1024).toFixed(0).padStart(4)} KB  keep ${keep}%`);

  // light national outline for the all-countries map
  const light = await run(
    `-i tl2.json -dissolve2 gap-fill-area=20km2 -each 'id="${iso}",name="${iso}",parent=""' -simplify ${Math.max(0.2, Math.min(100, (100 * LIGHT) / v)).toFixed(3)}% keep-shapes -o format=geojson out.json`,
    { 'tl2.json': input['tl2.json'] });
  lightParts.push(...JSON.parse(light['out.json'].toString()).features);
}
const nat = await run(`-i nat.json name=national -o format=topojson quantization=100000 out.json`,
  { 'nat.json': JSON.stringify({ type: 'FeatureCollection', features: lightParts }) });
writeFileSync(join(outDir, 'national.topo.json'), nat['out.json'].toString());
console.log(`national.topo.json  ${(statSync(join(outDir, 'national.topo.json')).size / 1024).toFixed(0)} KB`);
