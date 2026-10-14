<script lang="ts">
  // The Map view: any indicator at any geography (national, TL2, TL3, FUA)
  // in any year. Route: #/map/<ISO3>/<year>?geo=<level>&var=<variable>&scope=all&sel=<id>
  // The geography is chosen in the top bar; national maps show every country.
  import * as Plot from '@observablehq/plot';
  import { route, go, setQuery } from '../lib/router.svelte';
  import { routeCountry, routeYear, routeGeo } from '../lib/routeState';
  import { manifest, countryName, levelInfo, levelHasCountry, type Variable } from '../lib/db/manifest.svelte';
  import { mapValues, unitSeries, type MapValue } from '../lib/db/queries';
  import { geoFor, geoForAll, adminFor, type MapFeature, type AdminFeature } from '../lib/geo/geojson';
  import { regionFeatures, regionFeaturesAll, tl2Mesh, nationalOutline } from '../lib/geo/topo';
  import { landFeatures, type Land } from '../lib/geo/land';
  import { layoutFor } from '../lib/geo/projections';
  import { fmtBy, fmtShortBy, fmtInt, fmtNum, type Fmt } from '../lib/util/format';
  import { quantileBounds, classOf, classColours, classLabels, relativeBreaks, classOfRel, mean } from '../lib/util/stats';
  import { VIRIDIS, RDBU7 } from '../lib/theme/ramps';
  import { theme } from '../lib/theme/theme.svelte';
  import { liveTokens } from '../lib/theme/liveTokens.svelte';
  import { esc, type TipContent } from '../lib/tooltip';
  import { plotStyle, yearAxis, yearTicks, covidRect, FIRST_YEAR } from '../lib/charts/plot';
  import { seriesBreak, breakRule } from '../lib/charts/breaks';
  import { downloadCsv } from '../lib/util/csv';
  import { t } from '../lib/text/t';
  import type { MultiLineString } from 'geojson';
  import MapCanvas from '../lib/components/MapCanvas.svelte';
  import TimeSlider from '../lib/components/TimeSlider.svelte';
  import Legend from '../lib/components/Legend.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import Spinner from '../lib/components/Spinner.svelte';

  // ---- route state
  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const level = $derived(routeGeo());
  const national = $derived(level === 'national');
  // a national map is every country; a level the country lacks (Canada TL3)
  // can still be shown for all countries
  const scopeAll = $derived(national || route.query.scope === 'all');
  const missingLevel = $derived(!scopeAll && !levelHasCountry(level, iso3));
  const info = $derived(levelInfo(level));
  const variables = $derived(info.variables);
  const variable = $derived<Variable | undefined>(variables.find((v) => v.id === route.query.var) ?? variables[0]);
  const selected = $derived(route.query.sel ?? '');
  const tokens = $derived(liveTokens.value);
  const GROUPS = ['economy', 'people', 'dispersion', 'autonomy', 'fiscal', 'governance'];
  const grouped = $derived(GROUPS.map((g) => ({ g, items: variables.filter((v) => (v.group ?? 'economy') === g) })).filter((x) => x.items.length));
  const levelName = $derived(t('geo.' + level));

  // ---- data: the variable's values for the scope, every year
  let values = $state<MapValue[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const v = variable?.id, c = iso3, all = scopeAll, lv = level; const my = ++token;
    if (!v || !manifest.countries.length || missingLevel) { values = []; loading = false; return; }
    loading = true; error = '';
    mapValues(lv, v, all ? null : c).then((vals) => { if (my === token) { values = vals; loading = false; } })
      .catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  // years with data in the scope; hollow ticks where fewer than half the peak count
  const yearCounts = $derived.by(() => { const m = new Map<number, number>(); for (const r of values) m.set(r.year, (m.get(r.year) ?? 0) + 1); return m; });
  const years = $derived([...yearCounts.keys()].sort((a, b) => a - b));
  const peak = $derived(Math.max(0, ...yearCounts.values()));
  const sparse = $derived(years.filter((y) => (yearCounts.get(y) ?? 0) < peak / 2));
  const year = $derived(routeYear(years, manifest.refYear));

  // ---- polygons: FUAs, or the regional grid valid in the year shown (the
  // arrays are cached per grid era, so moving the slider keeps the zoom)
  let features = $state<MapFeature[]>([]);
  let land = $state<Land>({ countries: [] });
  let outline = $state<MapFeature | null>(null);
  let admin = $state<AdminFeature[]>([]);
  let mesh = $state<MultiLineString | null>(null);
  let geoToken = 0;
  $effect(() => {
    const lv = level, c = iso3, all = scopeAll, y = years.length ? year : null; const my = ++geoToken;
    if (!manifest.countries.length || missingLevel) { features = []; admin = []; mesh = null; outline = null; return; }
    const isos = manifest.countries.map((x) => x.iso3);
    const fs: Promise<MapFeature[]> = lv === 'fua' ? (all ? geoForAll(isos) : geoFor(c))
      : all ? regionFeaturesAll(lv, y) : regionFeatures(c, lv, y);
    // outlines of the selected country only: its subnational governments on
    // FUA and TL2 maps, its TL2 borders on a TL3 map
    const ad: Promise<AdminFeature[]> = !all && (lv === 'fua' || lv === 'tl2') ? adminFor(c) : Promise.resolve([]);
    const me: Promise<MultiLineString | null> = !all && (lv === 'tl3' || lv === 'tl2b') ? tl2Mesh(c) : Promise.resolve(null);
    // the selected country's boundary, from its own national-level polygon
    const ol: Promise<MapFeature | null> = all ? Promise.resolve(null) : nationalOutline(c);
    Promise.all([fs, ad, me, ol]).then(([f, a, m, o]) => {
      if (my !== geoToken) return;
      if (f !== features) features = f;
      admin = a; mesh = m; outline = o;
    }).catch((e) => { if (my === geoToken) error = e?.message ?? String(e); });
  });
  $effect(() => { landFeatures().then((l) => { land = l; }); });

  const inYear = $derived(new Map(values.filter((r) => r.year === year).map((r) => [r.id, r])));
  const featureIds = $derived(new Set(features.map((f) => f.properties.id)));
  const nMapped = $derived([...inYear.keys()].filter((id) => featureIds.has(id)).length);
  const nNoGeo = $derived([...inYear.keys()].filter((id) => !featureIds.has(id)).length);

  // quantile classes pooled over every year of the scope, so a colour keeps
  // its meaning as the year changes
  // ---- relative to the national mean (?rel=1): each unit against the
  // unweighted mean of its country's units in the same year, as a percentage
  // where every value is positive, otherwise as a difference in the
  // indicator's own units. Not offered on national maps.
  const relative = $derived(!national && route.query.rel === '1');
  const relPct = $derived(values.every((r) => r.value == null || r.value > 0));
  const relValues = $derived.by(() => {
    if (!relative) return new Map<string, number | null>();
    const groups = new Map<string, number[]>();
    for (const r of values) if (r.value != null) { const k = r.cntry_iso3 + '|' + r.year; const a = groups.get(k); if (a) a.push(r.value); else groups.set(k, [r.value]); }
    const means = new Map([...groups].map(([k, v]) => [k, mean(v)]));
    const out = new Map<string, number | null>();
    for (const r of values) {
      const m = means.get(r.cntry_iso3 + '|' + r.year);
      out.set(r.id + '|' + r.year, r.value == null || m == null ? null : relPct ? (100 * (r.value - m)) / m : r.value - m);
    }
    return out;
  });
  const relOf = (id: string, y: number) => relValues.get(id + '|' + y) ?? null;
  const relT = $derived(relative ? relativeBreaks(relValues.values()) : []);

  // ---- classes: quantiles on viridis, or symmetric classes on red-white-blue
  const bounds = $derived(quantileBounds(values.map((r) => r.value), 6));
  const colours = $derived(relative ? RDBU7 : classColours(VIRIDIS, Math.max(0, bounds.length - 1), 0));
  const fmt = $derived<Fmt>(variable?.fmt ?? 'num');
  const relFmt = (x: number) => relPct ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtNum(Math.abs(x), Math.abs(x) < 10 ? 1 : 0)}%` : `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtShortBy(fmt, Math.abs(x))}`;
  const labels = $derived(relative
    ? (relT.length === 3 ? [`${relFmt(-relT[2])} or lower`, `${relFmt(-relT[2])} to ${relFmt(-relT[1])}`, `${relFmt(-relT[1])} to ${relFmt(-relT[0])}`, `${relFmt(-relT[0])} to ${relFmt(relT[0])}`, `${relFmt(relT[0])} to ${relFmt(relT[1])}`, `${relFmt(relT[1])} to ${relFmt(relT[2])}`, `${relFmt(relT[2])} or higher`] : [])
    : classLabels(bounds, (x) => fmtShortBy(fmt, x)));
  const fillFor = $derived.by(() => {
    const b = bounds, cs = colours, m = inYear, neutral = tokens.neutral, rel = relative, rt = relT, y = year;
    return (id: string) => { const k = rel ? classOfRel(relOf(id, y), rt) : classOf(m.get(id)?.value, b); return k < 0 ? neutral : cs[k]; };
  });
  // UK regions the OECD leaves blank, filled from ONS and BRES: hatched
  const marked = $derived(new Set([...inYear.values()].filter((r) => r.filled).map((r) => r.id)));
  const rankIn = $derived.by(() => { const s = [...inYear.values()].filter((r) => r.value != null).sort((a, b) => b.value! - a.value!); return new Map(s.map((r, i) => [r.id, i + 1])); });
  const unitName = (id: string, r?: MapValue, f?: MapFeature) => national ? countryName(id) : (r?.name ?? f?.properties.name ?? id);
  const tipFor = $derived.by(() => { const m = inYear, v = variable, y = year, rk = rankIn, fsm = new Map(features.map((f) => [f.properties.id, f])); return (id: string): TipContent => {
    const r = m.get(id); const f = fsm.get(id);
    const nm = unitName(id, r, f);
    const cty = national ? '' : ` · ${esc(countryName(r?.cntry_iso3 ?? f?.properties.cntry_iso3 ?? ''))}`;
    if (!r || r.value == null) return { html: `<b>${esc(nm)}</b>${cty}<br><span class="tipdef">${esc(t('map.tip.nodata', { year: y }))}</span>` };
    return { html: `<b>${esc(nm)}</b>${cty}<br>${esc(t('map.tip.value', { variable: v?.short ?? '', year: y }))} <b>${esc(fmtBy(fmt, r.value))}</b>${relative && relOf(id, y) != null ? ` <span class="tipdef">(${esc(t('map.rel.tip', { value: relFmt(relOf(id, y)!) }))})</span>` : ''}<br><span class="tipdef">${esc(t('map.tip.rank', { rank: rk.get(id), n: rk.size }))}${r.pop != null ? ` · ${esc(t('map.tip.pop', { pop: fmtInt(r.pop) }))}` : ''}</span>${r.filled ? `<br><span class="tipdef">${esc(t('map.filled.tip'))}</span>` : ''}` };
  }; });

  function setYear(y: number) { go(['map', iso3, String(y)], route.query); }
  function setRel(on: boolean) { setQuery({ rel: on ? '1' : undefined }); }
  function setVar(e: Event) { setQuery({ var: (e.target as HTMLSelectElement).value, sel: undefined }); }
  function select(id: string | null) { setQuery({ sel: id ?? undefined }); }

  // ---- the inspector: the selected unit across years
  let series = $state<Record<string, any>[]>([]);
  const selRow = $derived(inYear.get(selected) ?? values.find((r) => r.id === selected));
  const selFeature = $derived(features.find((f) => f.properties.id === selected));
  const selIso = $derived(national ? selected : (selRow?.cntry_iso3 ?? selFeature?.properties.cntry_iso3 ?? ''));
  const selName = $derived(unitName(selected, selRow, selFeature));
  let selToken = 0;
  $effect(() => {
    const id = selected, c = selIso, lv = level; const my = ++selToken;
    if (!id || !c) { series = []; return; }
    unitSeries(lv, c, id).then((s) => { if (my === selToken) series = s; }).catch(() => {});
  });
  const seriesMake = $derived((o: { width: number; tokens: any }) => {
    const v = variable; if (!v) return null;
    const rows = series.filter((r) => r[v.id] != null && r.year >= FIRST_YEAR);
    if (rows.length < 2) return null;
    const ys = rows.map((r) => r.year); const lo = Math.min(...ys), hi = Math.max(...ys);
    const cur = rows.filter((r) => r.year === year);
    const brk = seriesBreak(selIso, level);
    const brkMarks = brk != null && lo < brk && hi >= brk ? [breakRule(brk, o.tokens)] : [];
    return Plot.plot({ width: o.width, height: 170, marginLeft: 52, marginRight: 16, style: plotStyle(o.tokens),
      x: yearAxis([lo, hi], yearTicks(lo, hi, hi - lo > 20 ? 10 : 5)), y: { label: v.short, grid: true, tickFormat: (d: number) => fmtShortBy(fmt, d) },
      marks: [...covidRect(ys, o.tokens), ...brkMarks, Plot.line(rows, { x: 'year', y: v.id, stroke: o.tokens.accent, strokeWidth: 2 }), Plot.dot(cur, { x: 'year', y: v.id, r: 4, fill: o.tokens.accent }),
        Plot.dot(rows.filter((r) => r.filled), { x: 'year', y: v.id, r: 3, fill: o.tokens.panel, stroke: o.tokens.accent, strokeWidth: 1.5 }),
        Plot.tip(rows, Plot.pointerX({ x: 'year', y: v.id, title: (d: any) => `${d.year}: ${fmtBy(fmt, d[v.id])}` }))] });
  });
  // whether the selected unit's series spans a known break (the dashed line is drawn)
  const seriesCrossesBreak = $derived.by(() => {
    const b = seriesBreak(selIso, level), v = variable;
    if (b == null || !v) return false;
    const ys = series.filter((r) => r[v.id] != null && r.year >= FIRST_YEAR).map((r) => r.year);
    return ys.some((y) => y < b) && ys.some((y) => y >= b);
  });
  const selOthers = $derived(variables.filter((v) => v.id !== variable?.id).map((v) => ({ v, val: series.find((r) => r.year === year)?.[v.id] as number | null })).filter((x) => x.val != null));

  function exportYear() {
    const rows = [...inYear.values()].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    downloadCsv(`map_${level}_${variable?.id}_${year}${scopeAll ? '_all' : '_' + iso3}`, [
      { key: 'cntry', label: 'Country', value: (r: MapValue) => countryName(r.cntry_iso3) },
      { key: 'id', label: `${levelName} code` }, { key: 'name', label: levelName, value: (r: MapValue) => unitName(r.id, r) },
      { key: 'year', label: 'Year' }, { key: 'value', label: variable?.label ?? 'Value' }, { key: 'pop', label: 'Population' },
      { key: 'filled', label: 'Estimated (filled from ONS and BRES)', value: (r: MapValue) => (r.filled ? 'yes' : '') }], rows);
  }
  let mapRef: MapCanvas | undefined = $state();
</script>

<div class="mv">
  <div class="bar">
    <label class="ctl"><span class="muted">{t('map.indicator')}</span>
      <select value={variable?.id} onchange={setVar}>{#each grouped as g (g.g)}<optgroup label={t('map.group.' + g.g)}>{#each g.items as v (v.id)}<option value={v.id}>{v.label}</option>{/each}</optgroup>{/each}</select>
    </label>
    <div class="seg" role="group" aria-label={t('map.rel.label')}>
      <button type="button" aria-pressed={!relative} onclick={() => setRel(false)}>{t('map.rel.values')}</button>
      <button type="button" aria-pressed={relative} disabled={national} title={national ? t('map.rel.national') : t('map.rel.tip_toggle')} onclick={() => setRel(true)}>{t('map.rel.relative')}</button>
    </div>
    <span class="muted small num">{#if missingLevel}{:else if loading}<Spinner size={12} /> {t('map.loading')}{:else}{t('map.status', { n: nMapped, units: t('geo.units.' + level), year })}{#if nNoGeo} · {t('map.status.nogeo', { n: nNoGeo })}{/if}{/if}</span>
    <span class="sp"></span>
    <button type="button" class="lnk" onclick={exportYear} disabled={!inYear.size}>{t('map.download', { year })}</button>
  </div>
  {#if error}<div class="err pad">{error}</div>{/if}
  {#if missingLevel}<div class="caution pad-box">{t('map.level_missing', { level: levelName, country: name })}</div>{/if}
  <div class="body">
    <div class="map">
      <MapCanvas bind:this={mapRef} {features} layout={layoutFor(scopeAll ? null : iso3)} land={land.countries} borders={scopeAll ? null : outline} {admin} {mesh} {marked} {fillFor} {tipFor} {selected} onselect={select} />
      {#if relative ? relT.length === 3 : bounds.length >= 2}
        <Legend title={relative ? t('map.rel.legend_title', { variable: variable?.short ?? '', year }) : t('map.legend.title', { variable: variable?.short ?? '', year })} {labels} {colours} neutral={tokens.neutral} hatched={marked.size ? t('map.filled.legend') : ''} note={relative ? t(relPct ? 'map.rel.note_pct' : 'map.rel.note_diff', { units: t('geo.units.' + level), variable_label: variable?.label ?? '' }) : t('map.legend.note', { n_years: years.length, scope: scopeAll ? t('map.legend.scope_all') : name, variable_label: variable?.label ?? '' }) + ((level === 'tl2' || level === 'tl2b' || level === 'tl3') && variable?.id.startsWith('lai_') ? ' ' + t('map.legend.regions_note') : '')} />
      {/if}
    </div>
    {#if selected}
      <aside class="insp">
        <header>
          <div><h2>{selName}</h2><div class="muted small">{national ? levelName : `${countryName(selIso)} · ${levelName} ${selected}`}</div></div>
          <button type="button" class="x" aria-label="Close" onclick={() => select(null)}>×</button>
        </header>
        <div class="big num">{fmtBy(fmt, selRow?.year === year ? selRow?.value : null)}</div>
        <div class="muted small">{t('map.insp.sub', { variable_label: variable?.label ?? '', year })}{#if rankIn.get(selected)} · {t('map.insp.rank', { rank: rankIn.get(selected), n: rankIn.size })}{/if}</div>
        <PlotChart make={seriesMake} height={170} label={`${selName}: ${variable?.short} over time`} />
        {#if series.some((r) => r.filled && variable && r[variable.id] != null)}<div class="muted small">{t('map.filled.insp')}</div>{/if}
        {#if seriesCrossesBreak}<div class="muted small">{t('map.break.insp')}</div>{/if}
        {#if selOthers.length}
          <table class="data">
            <tbody>{#each selOthers as o (o.v.id)}<tr><td>{o.v.short}</td><td class="num">{fmtBy(o.v.fmt, o.val)}</td></tr>{/each}</tbody>
          </table>
          <div class="muted small">{t('map.insp.others', { year })}</div>
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
  .pad-box { margin: 12px 20px 0; }
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
