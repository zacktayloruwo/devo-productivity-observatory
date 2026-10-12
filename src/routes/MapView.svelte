<script lang="ts">
  // The Map view: any FUA indicator in any year, on the OECD boundaries.
  // Route: #/map/<ISO3>/<year>?var=<variable>&scope=all&sel=<fua_id>
  import * as Plot from '@observablehq/plot';
  import { route, go, setQuery } from '../lib/router.svelte';
  import { routeCountry, routeYear } from '../lib/routeState';
  import { manifest, countryName, type Variable } from '../lib/db/manifest.svelte';
  import { mapValues, fuaSeries, type MapValue, type FuaRow } from '../lib/db/queries';
  import { geoFor, geoForAll, adminFor, type FuaFeature, type AdminFeature } from '../lib/geo/geojson';
  import { landFeatures, countryOutline, type Land } from '../lib/geo/land';
  import { layoutFor } from '../lib/geo/projections';
  import { fmtBy, fmtShortBy, fmtInt, type Fmt } from '../lib/util/format';
  import { quantileBounds, classOf, classColours, classLabels } from '../lib/util/stats';
  import { SEQ_LIGHT, SEQ_DARK } from '../lib/theme/ramps';
  import { theme } from '../lib/theme/theme.svelte';
  import { liveTokens } from '../lib/theme/liveTokens.svelte';
  import { esc, type TipContent } from '../lib/tooltip';
  import { plotStyle, yearAxis, yearTicks, covidRect } from '../lib/charts/plot';
  import { downloadCsv } from '../lib/util/csv';
    import MapCanvas from '../lib/components/MapCanvas.svelte';
  import TimeSlider from '../lib/components/TimeSlider.svelte';
  import Legend from '../lib/components/Legend.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import Spinner from '../lib/components/Spinner.svelte';

  // ---- route state
  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const variables = $derived(manifest.variables);
  const variable = $derived<Variable | undefined>(variables.find((v) => v.id === route.query.var) ?? variables[0]);
  const scopeAll = $derived(route.query.scope === 'all');
  const selected = $derived(route.query.sel ?? '');
  const tokens = $derived(liveTokens.value);

  // ---- data: the variable's values for the scope, every year
  let values = $state<MapValue[]>([]);
  let features = $state<FuaFeature[]>([]);
  let land = $state<Land>({ countries: [], borders: null });
  let admin = $state<AdminFeature[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const v = variable?.id, c = iso3, all = scopeAll; const my = ++token;
    if (!v || !manifest.countries.length) return;
    loading = true; error = '';
    const isos = manifest.countries.map((x) => x.iso3);
    // the subnational outlines are the selected country's only; none when every country is shown
    Promise.all([mapValues(v, all ? null : c), all ? geoForAll(isos) : geoFor(c), all ? Promise.resolve([] as AdminFeature[]) : adminFor(c)]).then(([vals, fs, ad]) => {
      if (my !== token) return;
      values = vals; features = fs; admin = ad; loading = false;
    }).catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });
  $effect(() => { landFeatures().then((l) => { land = l; }); });

  // years with data in the scope; hollow ticks where fewer than half the peak count
  const yearCounts = $derived.by(() => { const m = new Map<number, number>(); for (const r of values) m.set(r.year, (m.get(r.year) ?? 0) + 1); return m; });
  const years = $derived([...yearCounts.keys()].sort((a, b) => a - b));
  const peak = $derived(Math.max(0, ...yearCounts.values()));
  const sparse = $derived(years.filter((y) => (yearCounts.get(y) ?? 0) < peak / 2));
  const year = $derived(routeYear(years, manifest.refYear));
  const inYear = $derived(new Map(values.filter((r) => r.year === year).map((r) => [r.fua_id, r])));
  const nMapped = $derived(features.filter((f) => inYear.has(f.properties.fua_id)).length);
  const nNoGeo = $derived([...inYear.keys()].filter((id) => !features.some((f) => f.properties.fua_id === id)).length);

  // quantile classes pooled over every year of the scope, so a colour keeps
  // its meaning as the year changes
  const bounds = $derived(quantileBounds(values.map((r) => r.value), 6));
  const colours = $derived(classColours(theme.isDark ? SEQ_DARK : SEQ_LIGHT, Math.max(0, bounds.length - 1)));
  const fmt = $derived<Fmt>(variable?.fmt ?? 'num');
  const labels = $derived(classLabels(bounds, (x) => fmtShortBy(fmt, x)));
  const fillFor = $derived.by(() => { const b = bounds, cs = colours, m = inYear, neutral = tokens.neutral; return (id: string) => { const k = classOf(m.get(id)?.value, b); return k < 0 ? neutral : cs[k]; }; });
  const rankIn = $derived.by(() => { const s = [...inYear.values()].filter((r) => r.value != null).sort((a, b) => b.value! - a.value!); return new Map(s.map((r, i) => [r.fua_id, i + 1])); });
  const tipFor = $derived.by(() => { const m = inYear, v = variable, y = year, rk = rankIn; return (id: string): TipContent => {
    const r = m.get(id); const f = features.find((x) => x.properties.fua_id === id);
    const nm = r?.fua_name ?? f?.properties.fua_name ?? id;
    const cty = countryName(r?.cntry_iso3 ?? f?.properties.cntry_iso3 ?? '');
    if (!r || r.value == null) return { html: `<b>${esc(nm)}</b> · ${esc(cty)}<br><span class="tipdef">No ${esc(v?.short.toLowerCase() ?? 'data')} in ${y}</span>` };
    return { html: `<b>${esc(nm)}</b> · ${esc(cty)}<br>${esc(v?.short ?? '')} ${y}: <b>${esc(fmtBy(fmt, r.value))}</b><br><span class="tipdef">Rank ${rk.get(id)} of ${rk.size}${r.pop != null ? ` · population ${esc(fmtInt(r.pop))}` : ''}</span>` };
  }; });

  function setYear(y: number) { go(['map', iso3, String(y)], route.query); }
  function setVar(e: Event) { setQuery({ var: (e.target as HTMLSelectElement).value, sel: undefined }); }
  function setScope(all: boolean) { setQuery({ scope: all ? 'all' : undefined, sel: undefined }); }
  function select(id: string | null) { setQuery({ sel: id ?? undefined }); }

  // ---- the inspector: the selected FUA across years
  let series = $state<FuaRow[]>([]);
  const selRow = $derived(inYear.get(selected) ?? values.find((r) => r.fua_id === selected));
  const selFeature = $derived(features.find((f) => f.properties.fua_id === selected));
  const selIso = $derived(selRow?.cntry_iso3 ?? selFeature?.properties.cntry_iso3 ?? '');
  const selName = $derived(selRow?.fua_name ?? selFeature?.properties.fua_name ?? selected);
  let selToken = 0;
  $effect(() => {
    const id = selected, c = selIso; const my = ++selToken;
    if (!id || !c) { series = []; return; }
    fuaSeries(c, id).then((s) => { if (my === selToken) series = s; }).catch(() => {});
  });
  const seriesMake = $derived((o: { width: number; tokens: any }) => {
    const v = variable; if (!v) return null;
    const rows = series.filter((r) => (r as any)[v.id] != null);
    if (rows.length < 2) return null;
    const ys = rows.map((r) => r.year); const lo = Math.min(...ys), hi = Math.max(...ys);
    const cur = rows.filter((r) => r.year === year);
    return Plot.plot({ width: o.width, height: 170, marginLeft: 52, marginRight: 16, style: plotStyle(o.tokens),
      x: yearAxis([lo, hi], yearTicks(lo, hi, hi - lo > 20 ? 10 : 5)), y: { label: v.short, grid: true, tickFormat: (d: number) => fmtShortBy(fmt, d) },
      marks: [...covidRect(ys, o.tokens), Plot.line(rows, { x: 'year', y: v.id, stroke: o.tokens.accent, strokeWidth: 2 }), Plot.dot(cur, { x: 'year', y: v.id, r: 4, fill: o.tokens.accent }),
        Plot.tip(rows, Plot.pointerX({ x: 'year', y: v.id, title: (d: any) => `${d.year}: ${fmtBy(fmt, d[v.id])}` }))] });
  });
  const selOthers = $derived(variables.filter((v) => v.id !== variable?.id).map((v) => ({ v, val: (series.find((r) => r.year === year) as any)?.[v.id] as number | null })).filter((x) => x.val != null));

  function exportYear() {
    const rows = [...inYear.values()].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    downloadCsv(`map_${variable?.id}_${year}${scopeAll ? '_all' : '_' + iso3}`, [{ key: 'cntry', label: 'Country', value: (r: MapValue) => countryName(r.cntry_iso3) }, { key: 'fua_id', label: 'FUA id' }, { key: 'fua_name', label: 'FUA' }, { key: 'year', label: 'Year' }, { key: 'value', label: variable?.label ?? 'Value' }, { key: 'pop', label: 'Population' }], rows);
  }
  let mapRef: MapCanvas | undefined = $state();
</script>

<div class="mv">
  <div class="bar">
    <label class="ctl"><span class="muted">Indicator</span>
      <select value={variable?.id} onchange={setVar}>{#each variables as v (v.id)}<option value={v.id}>{v.label}</option>{/each}</select>
    </label>
    <div class="ctl"><span class="muted">Scope</span>
      <div class="seg"><button type="button" aria-pressed={!scopeAll} onclick={() => setScope(false)}>{name}</button><button type="button" aria-pressed={scopeAll} onclick={() => setScope(true)}>All nine countries</button></div>
    </div>
    <span class="muted small num">{#if loading}<Spinner size={12} /> loading{:else}{nMapped} FUAs with data in {year}{#if nNoGeo} · {nNoGeo} without a boundary{/if}{/if}</span>
    <span class="sp"></span>
    <button type="button" class="lnk" onclick={exportYear} disabled={!inYear.size}>Download CSV ({year})</button>
  </div>
  {#if error}<div class="err pad">{error}</div>{/if}
  <div class="body">
    <div class="map">
      <MapCanvas bind:this={mapRef} {features} layout={layoutFor(scopeAll ? null : iso3)} land={land.countries} borders={scopeAll ? null : countryOutline(land, iso3)} {admin} {fillFor} {tipFor} {selected} onselect={select} />
      {#if bounds.length >= 2}
        <Legend title={`${variable?.short ?? ''}, ${year}`} {labels} {colours} neutral={tokens.neutral} note={`Quantile classes pooled over ${years.length} years, ${scopeAll ? 'all countries' : name}. ${variable?.label ?? ''}.`} />
      {/if}
    </div>
    {#if selected}
      <aside class="insp">
        <header>
          <div><h2>{selName}</h2><div class="muted small">{countryName(selIso)} · {selected}</div></div>
          <button type="button" class="x" aria-label="Close" onclick={() => select(null)}>×</button>
        </header>
        <div class="big num">{fmtBy(fmt, selRow?.year === year ? selRow?.value : null)}</div>
        <div class="muted small">{variable?.label} · {year}{#if rankIn.get(selected)} · rank {rankIn.get(selected)} of {rankIn.size}{/if}</div>
        <PlotChart make={seriesMake} height={170} label={`${selName}: ${variable?.short} over time`} />
        {#if selOthers.length}
          <table class="data">
            <tbody>{#each selOthers as o (o.v.id)}<tr><td>{o.v.short}</td><td class="num">{fmtBy(o.v.fmt, o.val)}</td></tr>{/each}</tbody>
          </table>
          <div class="muted small">Other indicators in {year}</div>
        {/if}
      </aside>
    {/if}
  </div>
  <div class="slider">
    {#if years.length}<TimeSlider {years} value={year} {sparse} onchange={setYear} />{/if}
  </div>
</div>

<style>
  .mv { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .bar { min-height: 52px; flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 20px; border-bottom: 1px solid var(--line); background: var(--panel-2); }
  .ctl { display: flex; align-items: center; gap: 8px; }
  .ctl select { min-height: 30px; padding: 2px 8px; max-width: 360px; }
  .sp { flex: 1; }
  .lnk { border: 0; background: transparent; padding: 0; min-height: 0; font-size: 12px; color: var(--accent); }
  .lnk:hover { text-decoration: underline; background: transparent; }
  .pad { padding: 8px 20px; }
  .body { flex: 1; display: flex; min-height: 0; }
  .map { position: relative; flex: 1; min-width: 0; }
  .insp { width: 340px; flex: none; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-left: 1px solid var(--line); background: var(--panel); overflow: auto; }
  .insp header { display: flex; align-items: flex-start; gap: 8px; }
  .insp header > div { flex: 1; min-width: 0; }
  .insp h2 { font-size: 18px; }
  .x { width: 28px; height: 28px; padding: 0; min-height: 0; }
  .big { font-family: var(--serif); font-size: 26px; }
  .slider { flex: none; display: flex; align-items: center; padding: 6px 20px; border-top: 1px solid var(--line); background: var(--panel); }
  @media (max-width: 900px) { .body { flex-direction: column; } .insp { width: 100%; border-left: 0; border-top: 1px solid var(--line); max-height: 45%; } }
</style>
