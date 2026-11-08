<script lang="ts">
  // The Map view: any indicator at any geography (national, TL2, TL2b, TL3,
  // FUA) in any year, coloured by value, by rank in the whole sample, by rank
  // within the country, by change 2004-2019, or relative to the national mean.
  // Route: #/map/<ISO3>/<year>?geo=<level>&var=<variable>&scope=all&sel=<id>
  //   &mode=srank|crank|change|rel &cls=quint &chg=nominal &view=table
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
  import { rankAll, rankWithin, classOfRank, changes, ordinal, SCHEME_CUTS, SCHEME_COLOURS, type ClassScheme, type ChangeMethod, type Rank, type Change } from '../lib/util/ranks';
  import { quantileSorted } from '../lib/util/stats';
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

  // ---- data: the variable's values for every country, every year (the
  // sample the ranks are taken in); `values` is the scope shown
  let pool = $state<MapValue[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const v = variable?.id, c = iso3, all = scopeAll, lv = level; const my = ++token;
    if (!v || !manifest.countries.length || missingLevel) { pool = []; loading = false; return; }
    loading = true; error = '';
    void c; void all;
    mapValues(lv, v, null).then((vals) => { if (my === token) { pool = vals; loading = false; } })
      .catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  const values = $derived(scopeAll ? pool : pool.filter((r) => r.cntry_iso3 === iso3));

  // ---- colour mode
  type Mode = 'values' | 'srank' | 'crank' | 'change' | 'rel';
  const MODES: Mode[] = ['values', 'srank', 'crank', 'change', 'rel'];
  // a national map has one unit per country: no rank within it, no national mean
  const modeOff = (m: Mode) => national && (m === 'crank' || m === 'rel');
  const mode = $derived.by<Mode>(() => {
    const q = route.query.mode as Mode;
    const m: Mode = MODES.includes(q) ? q : route.query.rel === '1' ? 'rel' : 'values';
    return modeOff(m) ? 'values' : m;
  });
  const scheme = $derived<ClassScheme>(route.query.cls === 'quint' ? 'quint' : 'bands');
  const tableView = $derived(route.query.view === 'table');
  function setMode(e: Event) { const m = (e.target as HTMLSelectElement).value as Mode; setQuery({ mode: m === 'values' ? undefined : m, rel: undefined }); }
  function setScheme(c: ClassScheme) { setQuery({ cls: c === 'bands' ? undefined : c }); }
  function setView(v: 'map' | 'table') { setQuery({ view: v === 'map' ? undefined : v }); }

  // ---- change over the fixed window: 2004 is the first year of full FUA
  // coverage, 2019 the last before the pandemic
  const CH0 = 2004, CH1 = 2019;
  // FUA dollar values are current prices: their change is nominal growth, or
  // the change in relative position (the user's choice); regional and
  // national productivity are at constant prices (real growth)
  const usdVar = $derived(variable?.fmt === 'usd' || variable?.fmt === 'usd2');
  const fuaUsd = $derived(level === 'fua' && usdVar);
  const chgPref = $derived(route.query.chg === 'nominal' ? 'nominal' : 'relpos');
  function setChg(c: 'nominal' | 'relpos') { setQuery({ chg: c === 'relpos' ? undefined : c }); }
  const positiveVar = $derived(variable?.fmt === 'usd' || variable?.fmt === 'usd2' || variable?.fmt === 'num');
  const changeMethod = $derived<ChangeMethod>(fuaUsd && chgPref === 'relpos' ? 'relpos' : positiveVar ? 'growth' : 'diff');
  const countryOfUnit = $derived(new Map(pool.map((r) => [r.id, r.cntry_iso3])));
  // a known series break inside the window leaves the unit out (UK TL3, TL2b)
  const breaksWindow = (c: string | undefined) => { const b = c ? seriesBreak(c, level) : null; return b != null && b > CH0 && b <= CH1; };
  const chg = $derived(changes(pool, CH0, CH1, changeMethod, (id) => !breaksWindow(countryOfUnit.get(id))));
  const chgRank = $derived(rankAll([...chg].map(([id, c]) => ({ id, v: c.change })), (x) => x.v, (x) => x.id));
  // for the units left out: the change since the break
  const chgSinceBreak = $derived.by(() => {
    const ids = new Set([...countryOfUnit].filter(([, c]) => breaksWindow(c)).map(([id]) => id));
    if (!ids.size) return new Map<string, Change>();
    const b = seriesBreak('GBR', level) ?? CH0;
    return changes(pool.filter((r) => ids.has(r.id)), b, CH1, changeMethod === 'relpos' ? 'growth' : changeMethod);
  });
  // the change since a break is growth (or a difference), never relative position
  const sinceMethod = $derived<ChangeMethod>(changeMethod === 'diff' ? 'diff' : 'growth');
  const fmtChange = (x: number | null | undefined, m: ChangeMethod = changeMethod) => x == null ? '—'
    : m === 'diff' ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtShortBy(variable?.fmt ?? 'num', Math.abs(x))}`
    : `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtNum(Math.abs(x), Math.abs(x) < 10 ? 1 : 0)}%${m === 'growth' ? ' a year' : ''}`;

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
  // ranks in the year shown: across the whole sample, and within each country
  const poolYear = $derived(pool.filter((r) => r.year === year));
  const sRank = $derived(rankAll(poolYear, (r) => r.value, (r) => r.id));
  const cRank = $derived(rankWithin(poolYear, (r) => r.value, (r) => r.id, (r) => r.cntry_iso3));
  const nCountriesYear = $derived(new Set(poolYear.filter((r) => r.value != null).map((r) => r.cntry_iso3)).size);
  const pctDesc = (r: Rank) => r.p >= 0.5 ? t('map.pct.top', { pct: Math.max(1, Math.round((1 - r.p) * 100)) }) : t('map.pct.bottom', { pct: Math.max(1, Math.round(r.p * 100)) });
  const rankText = (r: Rank | undefined) => r ? `${ordinal(r.rank)} of ${r.n}` : '—';
  const featureIds = $derived(new Set(features.map((f) => f.properties.id)));
  const nMapped = $derived(mode === 'change' ? [...chg.keys()].filter((id) => featureIds.has(id)).length : [...inYear.keys()].filter((id) => featureIds.has(id)).length);
  const nNoGeo = $derived([...inYear.keys()].filter((id) => !featureIds.has(id)).length);

  // quantile classes pooled over every year of the scope, so a colour keeps
  // its meaning as the year changes
  // ---- relative to the national mean (?rel=1): each unit against the
  // unweighted mean of its country's units in the same year, as a percentage
  // where every value is positive, otherwise as a difference in the
  // indicator's own units. Not offered on national maps.
  const relative = $derived(mode === 'rel');
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
  const rankMode = $derived(mode === 'srank' || mode === 'crank' || mode === 'change');
  const colours = $derived(rankMode ? SCHEME_COLOURS[scheme] : relative ? RDBU7 : classColours(VIRIDIS, Math.max(0, bounds.length - 1), 0));
  // change classes: the change at the class cuts, for the legend
  const chgCuts = $derived.by(() => { const xs = [...chg.values()].map((c) => c.change).sort((a, b) => a - b); return xs.length ? SCHEME_CUTS[scheme].map((p) => quantileSorted(xs, p)) : []; });
  const fmt = $derived<Fmt>(variable?.fmt ?? 'num');
  const relFmt = (x: number) => relPct ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtNum(Math.abs(x), Math.abs(x) < 10 ? 1 : 0)}%` : `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtShortBy(fmt, Math.abs(x))}`;
  const rankLabels = $derived(SCHEME_CUTS[scheme].length === 6 ? [0, 1, 2, 3, 4, 5, 6].map((i) => t('map.band.' + i)) : [0, 1, 2, 3, 4].map((i) => t('map.quint.' + i)));
  const changeLabels = $derived.by(() => {
    const c = chgCuts; if (!c.length) return [];
    const f = (x: number) => fmtChange(x).replace(' a year', '');
    return [`${f(c[0])} or less`, ...c.slice(0, -1).map((x, i) => `${f(x)} to ${f(c[i + 1])}`), `${f(c[c.length - 1])} or more`];
  });
  const labels = $derived(mode === 'change' ? changeLabels : rankMode ? rankLabels : relative
    ? (relT.length === 3 ? [`${relFmt(-relT[2])} or lower`, `${relFmt(-relT[2])} to ${relFmt(-relT[1])}`, `${relFmt(-relT[1])} to ${relFmt(-relT[0])}`, `${relFmt(-relT[0])} to ${relFmt(relT[0])}`, `${relFmt(relT[0])} to ${relFmt(relT[1])}`, `${relFmt(relT[1])} to ${relFmt(relT[2])}`, `${relFmt(relT[2])} or higher`] : [])
    : classLabels(bounds, (x) => fmtShortBy(fmt, x)));
  const fillFor = $derived.by(() => {
    const b = bounds, cs = colours, m = inYear, neutral = tokens.neutral, rel = relative, rt = relT, y = year;
    const md = mode, sr = sRank, cr = cRank, gr = chgRank, sc = scheme;
    return (id: string) => {
      const k = md === 'srank' ? classOfRank(sr.get(id), sc) : md === 'crank' ? classOfRank(cr.get(id), sc) : md === 'change' ? classOfRank(gr.get(id), sc)
        : rel ? classOfRel(relOf(id, y), rt) : classOf(m.get(id)?.value, b);
      return k < 0 ? neutral : cs[k];
    };
  });
  // UK regions the OECD leaves blank, filled from ONS and BRES: hatched
  const marked = $derived(new Set([...inYear.values()].filter((r) => r.filled).map((r) => r.id)));
  const rankIn = $derived.by(() => { const s = [...inYear.values()].filter((r) => r.value != null).sort((a, b) => b.value! - a.value!); return new Map(s.map((r, i) => [r.id, i + 1])); });
  const unitName = (id: string, r?: MapValue, f?: MapFeature) => national ? countryName(id) : (r?.name ?? f?.properties.name ?? id);
  const tipFor = $derived.by(() => { const m = inYear, v = variable, y = year, rk = rankIn, fsm = new Map(features.map((f) => [f.properties.id, f])); return (id: string): TipContent => {
    const r = m.get(id); const f = fsm.get(id);
    const nm = unitName(id, r, f);
    const cty = national ? '' : ` · ${esc(countryName(r?.cntry_iso3 ?? f?.properties.cntry_iso3 ?? ''))}`;
    const head = `<b>${esc(nm)}</b>${cty}`;
    if (mode === 'change') {
      const c = chg.get(id), gr = chgRank.get(id);
      if (c) return { html: `${head}<br>${esc(t('map.tip.change', { start: fmtBy(fmt, c.v0), end: fmtBy(fmt, c.v1), first: CH0, last: CH1 }))}: <b>${esc(fmtChange(c.change))}</b><br><span class="tipdef">${esc(t('map.tip.change_rank', { rank: rankText(gr) }))}</span>` };
      const sb = chgSinceBreak.get(id);
      if (breaksWindow(countryOfUnit.get(id))) return { html: `${head}<br><span class="tipdef">${esc(t('map.tip.ukbreak', { change: sb ? fmtChange(sb.change, sinceMethod) : '—' }))}</span>` };
      return { html: `${head}<br><span class="tipdef">${esc(t('map.tip.nochange', { first: CH0, last: CH1 }))}</span>` };
    }
    if (!r || r.value == null) return { html: `${head}<br><span class="tipdef">${esc(t('map.tip.nodata', { year: y }))}</span>` };
    const sr = sRank.get(id), cr = cRank.get(id);
    const rankLine = mode === 'srank' && sr ? `<br>${esc(t('map.tip.srank', { rank: rankText(sr), where: pctDesc(sr) }))}`
      : mode === 'crank' && cr ? `<br>${esc(t('map.tip.crank', { rank: rankText(cr), country: countryName(r.cntry_iso3) }))}` : '';
    return { html: `${head}<br>${esc(t('map.tip.value', { variable: v?.short ?? '', year: y }))} <b>${esc(fmtBy(fmt, r.value))}</b>${rankLine}${relative && relOf(id, y) != null ? ` <span class="tipdef">(${esc(t('map.rel.tip', { value: relFmt(relOf(id, y)!) }))})</span>` : ''}<br><span class="tipdef">${esc(t('map.tip.rank', { rank: rk.get(id), n: rk.size }))}${r.pop != null ? ` · ${esc(t('map.tip.pop', { pop: fmtInt(r.pop) }))}` : ''}</span>${r.filled ? `<br><span class="tipdef">${esc(t('map.filled.tip'))}</span>` : ''}` };
  }; });

  function setYear(y: number) { go(['map', iso3, String(y)], route.query); }
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

  // ---- the table: the scope's units with their value, ranks and change,
  // sorted by the measure the map is coloured by
  interface TRow { id: string; cntry_iso3: string; name: string; value: number | null; pop: number | null; filled: boolean; s?: Rank; c?: Rank; ch?: Change; g?: Rank }
  const tableRows = $derived.by<TRow[]>(() => {
    const ids = new Set<string>([...inYear.keys(), ...(mode === 'change' ? [...chg.keys()].filter((id) => scopeAll || countryOfUnit.get(id) === iso3) : [])]);
    const rows = [...ids].map((id) => { const r = inYear.get(id); const any = r ?? values.find((x) => x.id === id);
      return { id, cntry_iso3: any?.cntry_iso3 ?? '', name: unitName(id, any), value: r?.value ?? null, pop: r?.pop ?? null, filled: !!r?.filled, s: sRank.get(id), c: cRank.get(id), ch: chg.get(id), g: chgRank.get(id) }; });
    // rank in country: by country, then rank; otherwise highest first
    if (mode === 'crank') return rows.sort((a, b) => a.cntry_iso3.localeCompare(b.cntry_iso3) || (a.c?.rank ?? 1e9) - (b.c?.rank ?? 1e9));
    const key = (r: TRow) => (mode === 'change' ? r.ch?.change : r.value) ?? -Infinity;
    return rows.sort((a, b) => key(b) - key(a));
  });
  const changeTitle = $derived(t('map.col.change.' + changeMethod, { first: CH0, last: CH1 }));
  // a header click sorts by that column (again: the other way); until then
  // the rows keep the colour mode's own order. Missing values sort last.
  type SortKey = 'name' | 'country' | 'value' | 'srank' | 'crank' | 'change';
  let sortKey = $state<SortKey | null>(null);
  let sortAsc = $state(true);
  $effect(() => { void mode; void level; sortKey = null; });
  function sortBy(k: SortKey) {
    if (sortKey === k) sortAsc = !sortAsc;
    // text and ranks read naturally top-down ascending; values and change highest first
    else { sortKey = k; sortAsc = k === 'name' || k === 'country' || k === 'srank' || k === 'crank'; }
  }
  const sortVal = (r: TRow, k: SortKey): string | number | null =>
    k === 'name' ? r.name : k === 'country' ? countryName(r.cntry_iso3) : k === 'value' ? r.value
    : k === 'srank' ? r.s?.rank ?? null : k === 'crank' ? r.c ? r.c.rank / r.c.n : null : r.ch?.change ?? null;
  const shownRows = $derived.by(() => {
    const k = sortKey; if (!k) return tableRows;
    const dir = sortAsc ? 1 : -1;
    return [...tableRows].sort((a, b) => {
      const x = sortVal(a, k), y = sortVal(b, k);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * dir;
    });
  });
  const ariaSort = (k: SortKey) => (sortKey === k ? (sortAsc ? 'ascending' : 'descending') : 'none');
  const arrow = (k: SortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');
  function exportYear() {
    downloadCsv(`map_${level}_${variable?.id}_${mode}_${year}${scopeAll ? '_all' : '_' + iso3}`, [
      { key: 'cntry', label: 'Country', value: (r: TRow) => countryName(r.cntry_iso3) },
      { key: 'id', label: `${levelName} code` }, { key: 'name', label: levelName },
      { key: 'year', label: 'Year', value: () => year }, { key: 'value', label: variable?.label ?? 'Value' }, { key: 'pop', label: 'Population' },
      { key: 'srank', label: 'Rank in sample', value: (r: TRow) => r.s?.rank ?? '' }, { key: 'sn', label: 'Units in sample', value: (r: TRow) => r.s?.n ?? '' },
      { key: 'spct', label: 'Percentile in sample (0 lowest, 100 highest)', value: (r: TRow) => (r.s ? Math.round(r.s.p * 1000) / 10 : '') },
      { key: 'crank', label: 'Rank in country', value: (r: TRow) => r.c?.rank ?? '' }, { key: 'cn', label: 'Units in country', value: (r: TRow) => r.c?.n ?? '' },
      { key: 'v0', label: `${variable?.short ?? 'Value'}, ${CH0}`, value: (r: TRow) => r.ch?.v0 ?? '' }, { key: 'v1', label: `${variable?.short ?? 'Value'}, ${CH1}`, value: (r: TRow) => r.ch?.v1 ?? '' },
      { key: 'change', label: changeTitle, value: (r: TRow) => (r.ch ? Math.round(r.ch.change * 1000) / 1000 : '') },
      { key: 'filled', label: 'Estimated (filled from ONS and BRES)', value: (r: TRow) => (r.filled ? 'yes' : '') }], tableRows);
  }
  // the legend's title and note, by mode
  const unitsWord = $derived(t('geo.units.' + level));
  const unitWord = $derived(t('geo.unit.' + level));
  const legendTitle = $derived(mode === 'srank' ? t('map.srank.title', { variable: variable?.short ?? '', year })
    : mode === 'crank' ? t('map.crank.title', { variable: variable?.short ?? '', year })
    : mode === 'change' ? t('map.change.title.' + changeMethod, { variable: variable?.short ?? '', first: CH0, last: CH1 })
    : relative ? t('map.rel.legend_title', { variable: variable?.short ?? '', year }) : t('map.legend.title', { variable: variable?.short ?? '', year }));
  const ukLeftOut = $derived(mode === 'change' && [...countryOfUnit.values()].some((c) => breaksWindow(c)));
  // the price basis of a growth rate, after "from 2004 to 2019" (CSV cells lose a leading space)
  const basis = $derived(changeMethod !== 'growth' || !usdVar ? '' : ' ' + (fuaUsd ? t('map.change.basis.nominal') : t('map.change.basis.real')));
  const legendNote = $derived(mode === 'srank' ? t('map.srank.note', { unit: unitWord, units: unitsWord, n: sRank.size, k: nCountriesYear, year })
    : mode === 'crank' ? t('map.crank.note', { unit: unitWord, units: unitsWord, year })
    : mode === 'change' ? t('map.change.note.' + changeMethod, { unit: unitWord, units: unitsWord, n: chg.size, first: CH0, last: CH1, basis }) + (ukLeftOut ? ' ' + t('map.change.ukbreak') : '')
    : relative ? t(relPct ? 'map.rel.note_pct' : 'map.rel.note_diff', { units: unitsWord, variable_label: variable?.label ?? '' })
    : t('map.legend.note', { n_years: years.length, scope: scopeAll ? t('map.legend.scope_all') : name, variable_label: variable?.label ?? '' }) + ((level === 'tl2' || level === 'tl2b' || level === 'tl3') && variable?.id.startsWith('lai_') ? ' ' + t('map.legend.regions_note') : ''));
  const showLegend = $derived(mode === 'change' ? chgCuts.length > 0 : rankMode ? sRank.size > 0 : relative ? relT.length === 3 : bounds.length >= 2);
  let mapRef: MapCanvas | undefined = $state();
</script>

<div class="mv">
  <div class="bar">
    <label class="ctl"><span class="muted">{t('map.indicator')}</span>
      <select value={variable?.id} onchange={setVar}>{#each grouped as g (g.g)}<optgroup label={t('map.group.' + g.g)}>{#each g.items as v (v.id)}<option value={v.id}>{v.label}</option>{/each}</optgroup>{/each}</select>
    </label>
    <label class="ctl"><span class="muted">{t('map.mode.label')}</span>
      <select value={mode} onchange={setMode}>{#each MODES as m (m)}<option value={m} disabled={modeOff(m)}>{t('map.mode.' + m)}</option>{/each}</select>
    </label>
    {#if rankMode}
      <div class="seg" role="group" aria-label={t('map.cls.label')}>
        <button type="button" aria-pressed={scheme === 'bands'} title={t('map.cls.bands.tip')} onclick={() => setScheme('bands')}>{t('map.cls.bands')}</button>
        <button type="button" aria-pressed={scheme === 'quint'} onclick={() => setScheme('quint')}>{t('map.cls.quint')}</button>
      </div>
    {/if}
    {#if mode === 'change' && fuaUsd}
      <div class="seg" role="group" aria-label={t('map.chg.label')}>
        <button type="button" aria-pressed={chgPref === 'relpos'} title={t('map.chg.relpos.tip')} onclick={() => setChg('relpos')}>{t('map.chg.relpos')}</button>
        <button type="button" aria-pressed={chgPref === 'nominal'} title={t('map.chg.nominal.tip')} onclick={() => setChg('nominal')}>{t('map.chg.nominal')}</button>
      </div>
    {/if}
    <div class="seg" role="group" aria-label={t('map.view.label')}>
      <button type="button" aria-pressed={!tableView} onclick={() => setView('map')}>{t('map.view.map')}</button>
      <button type="button" aria-pressed={tableView} onclick={() => setView('table')}>{t('map.view.table')}</button>
    </div>
    <span class="muted small num">{#if missingLevel}{:else if loading || !features.length}<Spinner size={12} /> {t('map.loading')}{:else}{mode === 'change' ? t('map.status.change', { n: nMapped, units: unitsWord, first: CH0, last: CH1 }) : t('map.status', { n: nMapped, units: unitsWord, year })}{#if nNoGeo} · {t('map.status.nogeo', { n: nNoGeo })}{/if}{/if}</span>
    <span class="sp"></span>
    <button type="button" class="lnk" onclick={exportYear} disabled={!inYear.size}>{t('map.download', { year })}</button>
  </div>
  {#if error}<div class="err pad">{error}</div>{/if}
  {#if missingLevel}<div class="caution pad-box">{t('map.level_missing', { level: levelName, country: name })}</div>{/if}
  <div class="body">
    <div class="map">
      <MapCanvas bind:this={mapRef} {features} layout={layoutFor(scopeAll ? null : iso3)} land={land.countries} borders={scopeAll ? null : outline} {admin} {mesh} {marked} {fillFor} {tipFor} {selected} onselect={select} />
      {#if showLegend}
        <Legend title={legendTitle} {labels} {colours} highFirst={rankMode} neutral={tokens.neutral} hatched={marked.size && mode !== 'change' ? t('map.filled.legend') : ''} note={legendNote} />
      {/if}
      {#if tableView}
        <div class="tbl">
          <table class="data">
            <thead><tr>
              <th aria-sort={ariaSort('name')}><button type="button" class="sort" onclick={() => sortBy('name')}>{levelName}{arrow('name')}</button></th>
              {#if scopeAll || national}<th aria-sort={ariaSort('country')}><button type="button" class="sort" onclick={() => sortBy('country')}>{t('map.col.country')}{arrow('country')}</button></th>{/if}
              <th class="num" aria-sort={ariaSort('value')}><button type="button" class="sort" onclick={() => sortBy('value')}>{variable?.short}, {year}{arrow('value')}</button></th>
              <th class="num" aria-sort={ariaSort('srank')}><button type="button" class="sort" onclick={() => sortBy('srank')}>{t('map.col.srank')}{arrow('srank')}</button></th>
              {#if !national}<th class="num" aria-sort={ariaSort('crank')}><button type="button" class="sort" title={t('map.col.crank.sort')} onclick={() => sortBy('crank')}>{t('map.col.crank')}{arrow('crank')}</button></th>{/if}
              <th class="num" aria-sort={ariaSort('change')}><button type="button" class="sort" onclick={() => sortBy('change')}>{changeTitle}{arrow('change')}</button></th>
            </tr></thead>
            <tbody>
              {#each shownRows as r (r.id)}
                <tr class:sel={r.id === selected} onclick={() => select(r.id)}>
                  <td><span class="sw" style:background={fillFor(r.id)}></span>{r.name}{r.filled ? ' †' : ''}</td>
                  {#if scopeAll || national}<td>{countryName(r.cntry_iso3)}</td>{/if}
                  <td class="num">{fmtBy(fmt, r.value)}</td>
                  <td class="num">{r.s ? `${rankText(r.s)} · ${pctDesc(r.s)}` : '—'}</td>
                  {#if !national}<td class="num">{rankText(r.c)}</td>{/if}
                  <td class="num">{r.ch ? fmtChange(r.ch.change) : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if tableRows.some((r) => r.filled)}<p class="muted small">{t('ukfill.note')}</p>{/if}
        </div>
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
        <table class="data ranks">
          <tbody>
            {#if sRank.get(selected)}<tr><td>{t('map.col.srank')}, {year}</td><td class="num">{rankText(sRank.get(selected))} · {pctDesc(sRank.get(selected)!)}</td></tr>{/if}
            {#if !national && cRank.get(selected)}<tr><td>{t('map.col.crank')}, {year}</td><td class="num">{rankText(cRank.get(selected))}</td></tr>{/if}
            {#if chg.get(selected)}<tr><td>{changeTitle}</td><td class="num">{fmtChange(chg.get(selected)?.change)}</td></tr>{/if}
          </tbody>
        </table>
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
    {#if mode === 'change'}<div class="muted small fixed">{t('map.change.window', { first: CH0, last: CH1 })}</div>
    {:else if years.length}<TimeSlider {years} value={year} {sparse} onchange={setYear} />{/if}
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
  .tbl { position: absolute; inset: 0; overflow: auto; background: var(--panel); padding: 12px 20px; z-index: 3; }
  .tbl table { width: 100%; }
  .tbl tr { cursor: pointer; }
  .tbl thead th { position: sticky; top: -12px; background: var(--panel); z-index: 1; }
  .sort { border: 0; background: none; padding: 0; min-height: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; text-align: inherit; }
  .sort:hover { color: var(--accent); background: none; }
  .tbl tr.sel td { background: var(--panel-2); font-weight: 600; }
  .tbl .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: -1px; border: 1px solid var(--line); }
  .ranks { margin: 8px 0; }
  .fixed { padding: 10px 4px; text-align: center; }
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
