<script lang="ts">
  // The Productivity view: the report's sections on FUA labour productivity.
  // Route: #/productivity/<ISO3>?year=<snapshot year>
  import * as Plot from '@observablehq/plot';
  import { route, setQuery } from '../lib/router.svelte';
  import { routeCountry } from '../lib/routeState';
  import { manifest, countryName } from '../lib/db/manifest.svelte';
  import { fuaCountry, fuaYearAll, fuaLatestAll, productivityByCountryYear, productivityYears, natAll, type FuaRow, type CountryYear, type NatRow } from '../lib/db/queries';
  import { fmtInt, fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../lib/util/format';
  import { mean, median, quantile, ols } from '../lib/util/stats';
  import { countryColours } from '../lib/countries';
  import { plotStyle, MARGIN, covidRect, yearAxis, yearTicks } from '../lib/charts/plot';
  import { countryLines } from '../lib/charts/countryLines';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import RankTable from '../lib/components/RankTable.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));
  const FOCAL = '#c0392b';

  // ---- data
  let years = $state<{ year: number; n: number; n_countries: number }[]>([]);
  let focusAll = $state<FuaRow[]>([]);      // the country, every FUA and year
  let snapshot = $state<FuaRow[]>([]);      // every country, the snapshot year
  let latest = $state<FuaRow[]>([]);        // every country, its own latest year
  let byCY = $state<CountryYear[]>([]);
  let nat = $state<NatRow[]>([]);
  let loading = $state(true);
  let error = $state('');

  // the snapshot year: ?year= when it has productivity data, else the reference year
  const yearList = $derived(years.map((y) => y.year));
  const year = $derived.by(() => { const y = Number(route.query.year); return yearList.includes(y) ? y : refYear; });

  let token = 0;
  $effect(() => {
    const c = iso3; const my = ++token;
    if (!countries.length) return;
    loading = true; error = '';
    Promise.all([productivityYears(), fuaCountry(c), fuaLatestAll(), productivityByCountryYear(), natAll()]).then(([ys, f, l, b, n]) => {
      if (my !== token) return;
      years = ys; focusAll = f; latest = l; byCY = b; nat = n; loading = false;
    }).catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });
  let snapToken = 0;
  $effect(() => {
    const y = year; const my = ++snapToken;
    if (!countries.length) return;
    fuaYearAll(y).then((s) => { if (my === snapToken) snapshot = s; }).catch((e) => { if (my === snapToken) error = e?.message ?? String(e); });
  });

  // ---- 1. ranks in the snapshot year
  const ranked = $derived(snapshot.filter((r) => r.cntry_iso3 === iso3).slice().sort((a, b) => (b.labprod_usdppp ?? 0) - (a.labprod_usdppp ?? 0)));
  const rankCols = [
    { key: 'fua_name', label: 'FUA', render: (r: FuaRow) => r.fua_name },
    { key: 'pop', label: 'Population', num: true, render: (r: FuaRow) => fmtInt(r.pop) },
    { key: 'labprod_usdppp', label: 'Labour productivity (USD PPP/worker)', num: true, render: (r: FuaRow) => fmtUsd(r.labprod_usdppp) }
  ];

  // ---- 2. scatter: productivity vs population, every country, the snapshot year
  const scatter = $derived(snapshot.filter((r) => r.pop != null && r.labprod_usdppp != null));
  const focusPts = $derived(scatter.filter((r) => r.cntry_iso3 === iso3));
  const nScatterCountries = $derived(new Set(scatter.map((r) => r.cntry_iso3)).size);
  const countryMean = $derived(focusPts.length ? mean(focusPts.map((r) => r.labprod_usdppp!)) : null);
  const globalMean = $derived(scatter.length ? mean(scatter.map((r) => r.labprod_usdppp!)) : null);
  const natRef = $derived(nat.find((n) => n.cntry_iso3 === iso3 && n.year === year)?.gdp_pw ?? null);
  const iso2 = (c: string) => countries.find((x) => x.iso3 === c)?.iso2 ?? c;
  function extremes(rows: FuaRow[]): FuaRow[] {
    if (!rows.length) return [];
    const s = rows.slice().sort((a, b) => a.labprod_usdppp! - b.labprod_usdppp!);
    const n = s.length;
    const picks = [s[0], s[Math.ceil(n / 2) - 1], s[n - 1]];
    return picks.filter((r, i, a) => a.findIndex((x) => x.fua_id === r.fua_id) === i);
  }
  const labelRows = $derived.by(() => {
    const c = extremes(focusPts).map((r) => ({ ...r, colour: FOCAL }));
    const g = extremes(scatter).map((r) => ({ ...r, colour: 'grey' }));
    const out = [...c];
    for (const r of g) if (!out.some((x) => x.fua_id === r.fua_id)) out.push(r);
    return out;
  });
  const scatterMake = $derived((o: { width: number; tokens: any }) => {
    if (!scatter.length) return null;
    const others = scatter.filter((r) => r.cntry_iso3 !== iso3);
    const grey = o.tokens['fg-3'];
    const refs = [
      ...(globalMean != null ? [{ v: globalMean, label: `All-FUA mean ${fmtUsd(globalMean)}`, colour: o.tokens.fg }] : []),
      ...(countryMean != null ? [{ v: countryMean, label: `${name} FUA mean ${fmtUsd(countryMean)}`, colour: FOCAL }] : [])
    ];
    const marks: any[] = [
      Plot.dot(others, { x: 'pop', y: 'labprod_usdppp', r: 'pop', fill: grey, fillOpacity: 0.4 }),
      Plot.dot(focusPts, { x: 'pop', y: 'labprod_usdppp', r: 'pop', fill: FOCAL, fillOpacity: 0.55 }),
      Plot.linearRegressionY(scatter, { x: 'pop', y: 'labprod_usdppp', stroke: o.tokens['fg-2'], strokeDasharray: '5 4', ci: 0 }),
      ...(focusPts.length >= 3 ? [Plot.linearRegressionY(focusPts, { x: 'pop', y: 'labprod_usdppp', stroke: FOCAL, ci: 0 })] : []),
      Plot.ruleY(refs, { y: 'v', stroke: 'colour', strokeWidth: 1, strokeOpacity: 0.7 }),
      Plot.text(refs, { x: () => Math.max(...scatter.map((r) => r.pop!)), y: 'v', text: 'label', fill: 'colour', textAnchor: 'end', dy: -6, fontSize: 11, fontWeight: 'bold' }),
      Plot.text(labelRows, { x: 'pop', y: 'labprod_usdppp', text: (d: any) => `${d.fua_name} (${iso2(d.cntry_iso3)})`, fill: (d: any) => (d.colour === 'grey' ? o.tokens['fg-2'] : FOCAL), dy: -10, fontSize: 11, fontWeight: 'bold', stroke: o.tokens.panel, strokeWidth: 3, paintOrder: 'stroke' }),
      Plot.tip(scatter, Plot.pointer({ x: 'pop', y: 'labprod_usdppp', title: (d: FuaRow) => `${d.fua_name} (${countryName(d.cntry_iso3)})\nPopulation ${fmtInt(d.pop)}\nLabour productivity ${fmtUsd(d.labprod_usdppp)}` }))
    ];
    return Plot.plot({ width: o.width, height: 520, marginLeft: MARGIN.left, marginRight: 30, style: plotStyle(o.tokens),
      x: { type: 'log', label: 'FUA population (log scale)', tickFormat: (d: number) => fmtShort(d), grid: true },
      y: { label: 'Labour productivity (USD PPP per worker)', tickFormat: (d: number) => '$' + fmtShort(d), grid: true },
      r: { range: [1.5, 16] }, marks });
  });
  const scatterCols = [{ key: 'cntry', label: 'Country', value: (r: FuaRow) => countryName(r.cntry_iso3) }, { key: 'fua_name', label: 'FUA' }, { key: 'pop', label: 'Population', num: true, render: (r: FuaRow) => fmtInt(r.pop) }, { key: 'labprod_usdppp', label: 'Labour productivity', num: true, render: (r: FuaRow) => fmtUsd(r.labprod_usdppp) }];

  // ---- 3. R² of log10(pop) ~ productivity, each country's latest year
  const r2Rows = $derived.by(() => {
    const out: { cntry_iso3: string; label: string; n: number; r2: number; year: number }[] = [];
    for (const c of countries) {
      const rows = latest.filter((r) => r.cntry_iso3 === c.iso3 && r.pop != null);
      if (rows.length < 3) continue;
      const fit = ols(rows.map((r) => [Math.log10(r.pop!), r.labprod_usdppp!]));
      if (!fit) continue;
      out.push({ cntry_iso3: c.iso3, label: `${c.display}\nN = ${rows.length}`, n: rows.length, r2: fit.r2, year: rows[0].year });
    }
    return out.sort((a, b) => a.r2 - b.r2);
  });
  const r2Make = $derived((o: { width: number; tokens: any }) => {
    if (!r2Rows.length) return null;
    return Plot.plot({ width: o.width, height: 36 * r2Rows.length + 50, marginLeft: 120, marginRight: 30, style: plotStyle(o.tokens),
      x: { domain: [0, 1], label: 'R²', grid: true }, y: { label: null, domain: r2Rows.map((r) => r.label) },
      marks: [
        Plot.barX(r2Rows, { x: 'r2', y: 'label', fill: (d: any) => (d.cntry_iso3 === iso3 ? '#f5b7b1' : o.tokens.neutral), stroke: o.tokens['fg-2'], insetTop: 4, insetBottom: 4 }),
        Plot.text(r2Rows, { x: 'r2', y: 'label', text: (d: any) => fmtNum(d.r2, 2), dx: 6, textAnchor: 'start', fill: o.tokens['fg-2'], fontSize: 11 }),
        Plot.tip(r2Rows, Plot.pointer({ x: 'r2', y: 'label', title: (d: any) => `${countryName(d.cntry_iso3)} (${d.year})\nR² = ${fmtNum(d.r2, 3)} over ${d.n} FUAs` }))
      ] });
  });
  const r2Cols = [{ key: 'cntry', label: 'Country', value: (r: any) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'r2', label: 'R²', num: true, render: (r: any) => fmtNum(r.r2, 3) }];

  // ---- 4. distribution by country, each country's latest year
  const dist = $derived.by(() => {
    const stats = countries.map((c) => {
      const v = latest.filter((r) => r.cntry_iso3 === c.iso3).map((r) => r.labprod_usdppp!);
      if (!v.length) return null;
      return { cntry_iso3: c.iso3, display: c.display, n: v.length, year: latest.find((r) => r.cntry_iso3 === c.iso3)!.year, q1: quantile(v, 0.25), med: median(v), q3: quantile(v, 0.75), mean: mean(v), min: Math.min(...v), max: Math.max(...v) };
    }).filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => a.med - b.med);
    const idx = new Map(stats.map((s, i) => [s.cntry_iso3, i]));
    // a fixed pseudo-random jitter per FUA so the figure is stable
    const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
    const pts = latest.filter((r) => idx.has(r.cntry_iso3)).map((r) => ({ ...r, yj: idx.get(r.cntry_iso3)! + (hash(r.fua_id) - 0.5) * 0.4 }));
    return { stats: stats.map((s, i) => ({ ...s, i })), pts };
  });
  const distMake = $derived((o: { width: number; tokens: any }) => {
    const { stats, pts } = dist;
    if (!stats.length) return null;
    return Plot.plot({ width: o.width, height: 50 * stats.length + 60, marginLeft: 120, marginRight: 30, style: plotStyle(o.tokens),
      x: { label: 'Labour productivity (USD PPP per worker)', tickFormat: (d: number) => '$' + fmtShort(d), grid: true },
      y: { domain: [-0.6, stats.length - 0.4], ticks: stats.map((s) => s.i), tickFormat: (i: number) => stats[i] ? `${stats[i].display} (N = ${stats[i].n})` : '', label: null },
      marks: [
        Plot.dot(pts, { x: 'labprod_usdppp', y: 'yj', r: 2.5, fill: (d: any) => (d.cntry_iso3 === iso3 ? FOCAL : o.tokens['fg-3']), fillOpacity: 0.45 }),
        Plot.rect(stats, { x1: 'q1', x2: 'q3', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens['fg-2'], fill: 'none', strokeWidth: 1.2 }),
        Plot.ruleX(stats, { x: 'med', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens['fg-2'], strokeWidth: 2 }),
        Plot.ruleX(stats, { x: 'mean', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens.fg, strokeDasharray: '4 3', strokeWidth: 1.2 }),
        Plot.tip(pts, Plot.pointer({ x: 'labprod_usdppp', y: 'yj', title: (d: any) => `${d.fua_name} (${countryName(d.cntry_iso3)}, ${d.year})\n${fmtUsd(d.labprod_usdppp)}` }))
      ] });
  });
  const distCols = [{ key: 'display', label: 'Country' }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'min', label: 'Min', num: true, render: (r: any) => fmtUsd(r.min) }, { key: 'q1', label: '25th', num: true, render: (r: any) => fmtUsd(r.q1) }, { key: 'med', label: 'Median', num: true, render: (r: any) => fmtUsd(r.med) }, { key: 'mean', label: 'Mean', num: true, render: (r: any) => fmtUsd(r.mean) }, { key: 'q3', label: '75th', num: true, render: (r: any) => fmtUsd(r.q3) }, { key: 'max', label: 'Max', num: true, render: (r: any) => fmtUsd(r.max) }];

  // ---- 5. change in productivity: 2004 (or the first year after it) to the snapshot year
  const focusLp = $derived(focusAll.filter((r) => r.labprod_usdppp != null));
  const growthStart = $derived.by(() => {
    const ys = [...new Set(focusLp.map((r) => r.year))].filter((y) => y >= 2004 && y < year);
    return ys.length ? Math.min(...ys) : null;
  });
  const growth = $derived.by(() => {
    if (growthStart == null) return [];
    const start = new Map(focusLp.filter((r) => r.year === growthStart).map((r) => [r.fua_id, r.labprod_usdppp!]));
    const n = year - growthStart;
    return focusLp.filter((r) => r.year === year && start.has(r.fua_id)).map((r) => ({ fua_id: r.fua_id, fua_name: r.fua_name, lp_start: start.get(r.fua_id)!, lp_end: r.labprod_usdppp!, cagr: (Math.pow(r.labprod_usdppp! / start.get(r.fua_id)!, 1 / n) - 1) * 100 }))
      .sort((a, b) => b.cagr - a.cagr);
  });
  const growthCols = $derived([
    { key: 'fua_name', label: 'FUA', render: (r: any) => r.fua_name },
    { key: 'lp_start', label: `Productivity (${growthStart ?? ''})`, num: true, render: (r: any) => fmtUsd(r.lp_start) },
    { key: 'lp_end', label: `Productivity (${year})`, num: true, render: (r: any) => fmtUsd(r.lp_end) },
    { key: 'cagr', label: 'CAGR (%)', num: true, render: (r: any) => fmtPct(r.cagr, 2) }
  ]);

  // ---- 6. spread: percentiles within the country, coefficient of variation across countries
  const pctRows = $derived.by(() => {
    const ys = [...new Set(focusLp.map((r) => r.year))].sort((a, b) => a - b);
    return ys.map((y) => { const v = focusLp.filter((r) => r.year === y).map((r) => r.labprod_usdppp!); return { year: y, n: v.length, p10: quantile(v, 0.1), p25: quantile(v, 0.25), p50: median(v), p75: quantile(v, 0.75), p90: quantile(v, 0.9) }; });
  });
  const PCT = [
    { k: 'p90', label: '90th', dash: '2 3', w: 1 }, { k: 'p75', label: '75th', dash: '6 3', w: 1.4 }, { k: 'p50', label: '50th (median)', dash: '', w: 2.6 },
    { k: 'p25', label: '25th', dash: '6 3', w: 1.4 }, { k: 'p10', label: '10th', dash: '2 3', w: 1 }
  ];
  const xCommon = $derived.by(() => { const ys = [...byCY.map((r) => r.year), ...pctRows.map((r) => r.year)]; return ys.length ? [Math.min(...ys), Math.max(...ys)] : [2000, 2023]; });
  const pctMake = $derived((o: { width: number; tokens: any }) => {
    if (pctRows.length < 2) return null;
    const shade = (i: number) => [o.tokens['fg-3'], o.tokens['fg-2'], o.tokens.fg, o.tokens['fg-2'], o.tokens['fg-3']][i];
    const marks: any[] = [...covidRect(xCommon, o.tokens)];
    PCT.forEach((p, i) => marks.push(Plot.line(pctRows, { x: 'year', y: p.k, stroke: shade(i), strokeDasharray: p.dash || undefined, strokeWidth: p.w })));
    marks.push(Plot.tip(pctRows, Plot.pointerX({ x: 'year', y: 'p50', title: (d: any) => `${d.year} · ${d.n} FUAs\n90th ${fmtUsd(d.p90)}\n75th ${fmtUsd(d.p75)}\nMedian ${fmtUsd(d.p50)}\n25th ${fmtUsd(d.p25)}\n10th ${fmtUsd(d.p10)}` })));
    return Plot.plot({ width: o.width, height: 300, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
      x: yearAxis(xCommon, yearTicks(xCommon[0], xCommon[1], 5)), y: { label: 'Labour productivity (USD PPP per worker)', grid: true, tickFormat: (d: number) => '$' + fmtShort(d) }, marks });
  });
  const pctCols = [{ key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, ...PCT.map((p) => ({ key: p.k, label: p.label, num: true, render: (r: any) => fmtUsd(r[p.k]) }))];

  const covRows = $derived(byCY.filter((r) => r.cov != null));
  const covMake = $derived((o: { width: number; tokens: any }) => countryLines<CountryYear>({ rows: covRows, x: (d) => d.year, y: (d) => d.cov, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 260, yLabel: 'Coefficient of variation (%)', yFormat: (v) => fmtNum(v, 0) + '%', covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nCoefficient of variation ${fmtNum(d.cov, 1)}%` }));
  const meanMake = $derived((o: { width: number; tokens: any }) => countryLines<CountryYear>({ rows: byCY, x: (d) => d.year, y: (d) => d.mean_lp, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 320, yLabel: 'Mean labour productivity (USD PPP per worker)', yFormat: (v) => '$' + fmtShort(v), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nMean ${fmtUsd(d.mean_lp)} over ${d.n} FUAs` }));
  const cyCols = [{ key: 'cntry', label: 'Country', value: (r: CountryYear) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'mean_lp', label: 'Mean productivity', num: true, render: (r: CountryYear) => fmtUsd(r.mean_lp) }, { key: 'cov', label: 'Coefficient of variation (%)', num: true, render: (r: CountryYear) => fmtNum(r.cov, 1) }];
  const present = $derived(new Set(byCY.map((r) => r.cntry_iso3)));
</script>

<div class="view">
  <header class="hd">
    <div>
      <h1>Labour productivity · {name}</h1>
      <div class="sub">Functional urban areas, USD at purchasing power parity per worker{#if loading} · <Spinner size={12} />{/if}</div>
      {#if error}<div class="err">{error}</div>{/if}
    </div>
    <label class="yr">
      <span class="muted">Snapshot year</span>
      <select value={year} onchange={(e) => setQuery({ year: Number((e.target as HTMLSelectElement).value) === refYear ? undefined : (e.target as HTMLSelectElement).value })}>
        {#each years as y (y.year)}<option value={y.year}>{y.year}{y.year === refYear ? ' (pre-pandemic reference)' : ''} · {y.n_countries} countries</option>{/each}
      </select>
    </label>
  </header>

  <ChartCard title={`Functional urban areas by labour productivity, ${year}`}>
    {#snippet intro()}
      <p>The top ten, middle ten and bottom ten FUAs in {name} by labour productivity in {year}{#if year === refYear}, the last full year before the Covid-19 pandemic{/if}. Separator rows are omitted where the groups are contiguous.</p>
    {/snippet}
    {#if ranked.length}
      <RankTable rows={ranked} columns={rankCols} csvName={`${iso3}_productivity_ranks_${year}`} />
    {:else if !loading}
      <p class="muted">Labour productivity data are not available for {name} in {year}.</p>
    {/if}
  </ChartCard>

  <ChartCard title={`Labour productivity and population of functional urban areas, ${year}`} columns={scatterCols} rows={scatter} csvName={`fua_productivity_population_${year}`}>
    {#snippet intro()}
      <p>Each point is one functional urban area in {year}; point size is proportional to population. Red points are FUAs in {name}, grey the FUAs of the other countries. The labelled FUAs are the highest, median and lowest labour productivity in {name} (red) and across all countries (grey). The dataset holds {scatter.length} FUAs with productivity and population across {nScatterCountries} countries.</p>
      {#if focusPts.length}<p>Trend lines show the relationship between population size and labour productivity for all FUAs (dashed) and for {poss(name)} FUAs alone (red). The mean productivity of all FUAs and of {poss(name)} FUAs are drawn as horizontal reference lines.{#if natRef != null} For comparison, {poss(name)} nation-wide labour productivity in {year} was {fmtUsd(natRef)} per person employed.{/if}</p>
      {:else if natRef != null}<p>{poss(name)} nation-wide labour productivity in {year} was {fmtUsd(natRef)} per person employed; the OECD publishes no FUA productivity for {name} in {year}.</p>{/if}
    {/snippet}
    <PlotChart make={scatterMake} height={520} label="Labour productivity against population, every FUA" />
  </ChartCard>

  <div class="two">
    <ChartCard title="Population size and labour productivity: R² by country" columns={r2Cols} rows={r2Rows} csvName="r2_population_productivity" note="R² of labour productivity on log10(population) across each country's FUAs, in each country's most recent year with productivity data.">
      {#snippet intro()}<p>The length of each bar shows how much of the variation in FUA labour productivity within a country is associated with population size. Population size is strongly associated with productivity in France and, to a lesser degree, the United States, but hardly at all elsewhere: productivity is not directly a function of urban agglomeration.</p>{/snippet}
      <PlotChart make={r2Make} height={36 * Math.max(1, r2Rows.length) + 50} label="R² by country" />
    </ChartCard>
    <ChartCard title="Distribution of FUA labour productivity, by country" columns={distCols} rows={dist.stats} csvName="productivity_distribution" note="Each country's most recent year with productivity data. Box: 25th to 75th percentile; solid line: median; dashed line: mean.">
      {#snippet intro()}<p>The box edges mark the 25th and 75th percentiles of FUA labour productivity in each country, the solid line the median and the dashed line the mean. The United States has the widest spread; the other countries are narrowly clustered with some high-productivity outliers.</p>{/snippet}
      <PlotChart make={distMake} height={50 * Math.max(1, dist.stats.length) + 60} label="Distribution of labour productivity by country" />
    </ChartCard>
  </div>

  <ChartCard title={`Change in FUA labour productivity, ${growthStart ?? 2004} to ${year}`}>
    {#snippet intro()}
      <p>FUAs ranked by the compound annual growth rate of labour productivity between {growthStart ?? 2004} and {year}.{#if year === refYear} The series ends in {refYear}, the last full year before the Covid-19 pandemic.{/if}{#if growthStart != null && growthStart > 2004} It begins in {growthStart}, the first year OECD labour productivity data are available for {name}.{/if}</p>
    {/snippet}
    {#if growth.length}
      <RankTable rows={growth} columns={growthCols} csvName={`${iso3}_productivity_growth_${growthStart}_${year}`} />
    {:else if !loading}
      <p class="muted">Insufficient data to calculate productivity growth for {name} over 2004–{year}.</p>
    {/if}
  </ChartCard>

  <ChartCard title={`Spread of FUA labour productivity in ${name}`} columns={pctCols} rows={pctRows} csvName={`${iso3}_productivity_percentiles`} note="The shaded band is the WHO pandemic emergency (March 2020 to May 2023).">
    {#snippet intro()}
      <p>Percentiles of labour productivity across {poss(name)} FUAs in each year: a narrowing of the spread would indicate convergence across FUAs.{#if pctRows.length >= 2} The figure covers the {pctRows.length} years for which the OECD publishes productivity for {name} ({pctRows[0].year}–{pctRows[pctRows.length - 1].year}).{:else} The OECD publishes {pctRows.length ? 'a single year' : 'no years'} of productivity for {name}, so only the cross-country comparison below is shown.{/if}</p>
    {/snippet}
    {#if pctRows.length >= 2}
      <PlotChart make={pctMake} height={300} label="Percentiles of labour productivity over time" />
      <div class="pleg">{#each PCT as p, i (p.k)}<span class="it"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" stroke-width={p.w} stroke-dasharray={p.dash} /></svg>{p.label}</span>{/each}</div>
    {/if}
  </ChartCard>

  <ChartCard title="Coefficient of variation of FUA labour productivity, by country" columns={cyCols} rows={covRows} csvName="productivity_cov" note="Standard deviation as a share of the mean across each country's FUAs, as published by the OECD. The shaded band is the WHO pandemic emergency.">
    <PlotChart make={covMake} height={260} label="Coefficient of variation by country" />
    <CountryLegend {countries} {colours} focus={iso3} {present} />
  </ChartCard>

  <ChartCard title="Mean FUA labour productivity, by country" columns={cyCols} rows={byCY} csvName="productivity_mean" note="Mean values are unweighted: each FUA counts once, regardless of population. The shaded band is the WHO pandemic emergency.">
    <PlotChart make={meanMake} height={320} label="Mean labour productivity by country" />
    <CountryLegend {countries} {colours} focus={iso3} {present} />
  </ChartCard>
</div>

<style>
  .hd { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .hd > div { flex: 1; }
  .yr { display: flex; align-items: center; gap: 8px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .two { grid-template-columns: 1fr; } }
  .pleg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--fg-2); }
  .it { display: inline-flex; align-items: center; gap: 6px; }
</style>
