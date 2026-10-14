<script lang="ts">
  // The Productivity view: the report's sections on labour productivity, over
  // FUAs, TL2 or TL3 regions as the top bar's geography says; the national
  // level has its own component. Route: #/productivity/<ISO3>?geo=<level>&year=<snapshot year>
  import * as Plot from '@observablehq/plot';
  import { route, setQuery } from '../lib/router.svelte';
  import { routeCountry, routeGeo } from '../lib/routeState';
  import { manifest, countryName, levelHasCountry } from '../lib/db/manifest.svelte';
  import { unitsCountry, unitsYearAll, unitsLatestAll, productivityByCountryYear, productivityYears, natAll, type UnitRow, type UnitLevel, type CountryYear, type NatRow } from '../lib/db/queries';
  import { fmtInt, fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../lib/util/format';
  import { mean, median, quantile, ols } from '../lib/util/stats';
  import { countryColours } from '../lib/countries';
  import { plotStyle, MARGIN, covidRect, yearAxis, yearTicks, FIRST_YEAR } from '../lib/charts/plot';
  import { countryLines } from '../lib/charts/countryLines';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import RankTable from '../lib/components/RankTable.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';
  import NationalProductivity from './level/NationalProductivity.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));
  const FOCAL = '#c0392b';
  const geo = $derived(routeGeo());
  const level = $derived<UnitLevel | null>(geo === 'national' ? null : geo);
  const fua = $derived(geo === 'fua');
  const levelName = $derived(t('geo.' + geo));
  const unit = $derived(fua ? 'FUA' : 'Region');
  const missing = $derived(level != null && !levelHasCountry(level, iso3));
  const unitsWord = $derived(fua ? 'FUAs' : 'regions');
  const csvLv = $derived(fua ? '' : '_' + geo);

  // ---- data
  let years = $state<{ year: number; n: number; n_countries: number }[]>([]);
  let focusAll = $state<UnitRow[]>([]);     // the country, every unit and year
  let snapshot = $state<UnitRow[]>([]);     // every country, the snapshot year
  let latest = $state<UnitRow[]>([]);       // every country, its own latest year
  let byCY = $state<CountryYear[]>([]);
  let nat = $state<NatRow[]>([]);
  let loading = $state(true);
  let error = $state('');

  // the snapshot year: ?year= when it has productivity data, else the reference year
  const yearList = $derived(years.map((y) => y.year));
  const year = $derived.by(() => { const y = Number(route.query.year); return yearList.includes(y) ? y : refYear; });

  let token = 0;
  $effect(() => {
    const c = iso3, lv = level; const my = ++token;
    if (!countries.length || !lv) return;
    loading = true; error = '';
    Promise.all([productivityYears(lv), unitsCountry(lv, c), unitsLatestAll(lv), productivityByCountryYear(lv), natAll()]).then(([ys, f, l, b, n]) => {
      if (my !== token) return;
      // the Productivity view starts in 2000: the year selector and every series over time
      years = ys.filter((y) => y.year >= FIRST_YEAR); focusAll = f.filter((r) => r.year >= FIRST_YEAR); latest = l; byCY = b.filter((r) => r.year >= FIRST_YEAR); nat = n; loading = false;
    }).catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });
  let snapToken = 0;
  $effect(() => {
    const y = year, lv = level; const my = ++snapToken;
    if (!countries.length || !lv) return;
    unitsYearAll(lv, y).then((s) => { if (my === snapToken) snapshot = s; }).catch((e) => { if (my === snapToken) error = e?.message ?? String(e); });
  });

  // ---- 1. ranks in the snapshot year
  // the country's own rows (for the UK, with the regions filled from ONS and BRES, marked †)
  const ranked = $derived(focusAll.filter((r) => r.year === year && r.lp != null).slice().sort((a, b) => (b.lp ?? 0) - (a.lp ?? 0)));
  const anyFilled = $derived(focusAll.some((r) => r.filled && r.lp != null));
  const dag = (r: { filled?: boolean }) => (r.filled ? ' †' : '');
  const rankCols = $derived([
    { key: 'name', label: unit, render: (r: UnitRow) => r.name + dag(r) },
    { key: 'pop', label: 'Population', num: true, render: (r: UnitRow) => fmtInt(r.pop) },
    { key: 'lp', label: 'Labour productivity (USD PPP/worker)', num: true, render: (r: UnitRow) => fmtUsd(r.lp) }
  ]);

  // ---- 2. scatter: productivity vs population, every country, the snapshot year
  const scatter = $derived(snapshot.filter((r) => r.pop != null && r.lp != null));
  const focusPts = $derived(scatter.filter((r) => r.cntry_iso3 === iso3));
  const nScatterCountries = $derived(new Set(scatter.map((r) => r.cntry_iso3)).size);
  const countryMean = $derived(focusPts.length ? mean(focusPts.map((r) => r.lp!)) : null);
  const globalMean = $derived(scatter.length ? mean(scatter.map((r) => r.lp!)) : null);
  const natRef = $derived(nat.find((n) => n.cntry_iso3 === iso3 && n.year === year)?.gdp_pw ?? null);
  const iso2 = (c: string) => countries.find((x) => x.iso3 === c)?.iso2 ?? c;
  function extremes(rows: UnitRow[]): UnitRow[] {
    if (!rows.length) return [];
    const s = rows.slice().sort((a, b) => a.lp! - b.lp!);
    const n = s.length;
    const picks = [s[0], s[Math.ceil(n / 2) - 1], s[n - 1]];
    return picks.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);
  }
  const labelRows = $derived.by(() => {
    const c = extremes(focusPts).map((r) => ({ ...r, colour: FOCAL }));
    const g = extremes(scatter).map((r) => ({ ...r, colour: 'grey' }));
    const out = [...c];
    for (const r of g) if (!out.some((x) => x.id === r.id)) out.push(r);
    return out;
  });
  const scatterMake = $derived((o: { width: number; tokens: any }) => {
    if (!scatter.length) return null;
    const others = scatter.filter((r) => r.cntry_iso3 !== iso3);
    const grey = o.tokens['fg-3'];
    const refs = [
      ...(globalMean != null ? [{ v: globalMean, label: `All-${fua ? 'FUA' : 'region'} mean ${fmtUsd(globalMean)}`, colour: o.tokens.fg }] : []),
      ...(countryMean != null ? [{ v: countryMean, label: `${name} ${fua ? 'FUA' : 'region'} mean ${fmtUsd(countryMean)}`, colour: FOCAL }] : [])
    ];
    const marks: any[] = [
      Plot.dot(others, { x: 'pop', y: 'lp', r: 'pop', fill: grey, fillOpacity: 0.4 }),
      Plot.dot(focusPts, { x: 'pop', y: 'lp', r: 'pop', fill: FOCAL, fillOpacity: 0.55 }),
      Plot.linearRegressionY(scatter, { x: 'pop', y: 'lp', stroke: o.tokens['fg-2'], strokeDasharray: '5 4', ci: 0 }),
      ...(focusPts.length >= 3 ? [Plot.linearRegressionY(focusPts, { x: 'pop', y: 'lp', stroke: FOCAL, ci: 0 })] : []),
      Plot.ruleY(refs, { y: 'v', stroke: 'colour', strokeWidth: 1, strokeOpacity: 0.7 }),
      Plot.text(refs, { x: () => Math.max(...scatter.map((r) => r.pop!)), y: 'v', text: 'label', fill: 'colour', textAnchor: 'end', dy: -6, fontSize: 11, fontWeight: 'bold' }),
      Plot.text(labelRows, { x: 'pop', y: 'lp', text: (d: any) => `${d.name} (${iso2(d.cntry_iso3)})`, fill: (d: any) => (d.colour === 'grey' ? o.tokens['fg-2'] : FOCAL), dy: -10, fontSize: 11, fontWeight: 'bold', stroke: o.tokens.panel, strokeWidth: 3, paintOrder: 'stroke' }),
      Plot.tip(scatter, Plot.pointer({ x: 'pop', y: 'lp', title: (d: UnitRow) => `${d.name} (${countryName(d.cntry_iso3)})\nPopulation ${fmtInt(d.pop)}\nLabour productivity ${fmtUsd(d.lp)}` }))
    ];
    return Plot.plot({ width: o.width, height: 520, marginLeft: MARGIN.left, marginRight: 30, style: plotStyle(o.tokens),
      x: { type: 'log', label: `${fua ? 'FUA' : levelName + ' region'} population (log scale)`, tickFormat: (d: number) => fmtShort(d), grid: true },
      y: { label: 'Labour productivity (USD PPP per worker)', tickFormat: (d: number) => '$' + fmtShort(d), grid: true },
      r: { range: [1.5, 16] }, marks });
  });
  const scatterCols = $derived([{ key: 'cntry', label: 'Country', value: (r: UnitRow) => countryName(r.cntry_iso3) }, { key: 'name', label: unit }, { key: 'pop', label: 'Population', num: true, render: (r: UnitRow) => fmtInt(r.pop) }, { key: 'lp', label: 'Labour productivity', num: true, render: (r: UnitRow) => fmtUsd(r.lp) }]);

  // ---- 3. R² of log10(pop) ~ productivity, each country's latest year
  const r2Rows = $derived.by(() => {
    const out: { cntry_iso3: string; label: string; n: number; r2: number; year: number }[] = [];
    for (const c of countries) {
      const rows = latest.filter((r) => r.cntry_iso3 === c.iso3 && r.pop != null);
      if (rows.length < 3) continue;
      const fit = ols(rows.map((r) => [Math.log10(r.pop!), r.lp!]));
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
        Plot.tip(r2Rows, Plot.pointer({ x: 'r2', y: 'label', title: (d: any) => `${countryName(d.cntry_iso3)} (${d.year})\nR² = ${fmtNum(d.r2, 3)} over ${d.n} ${unitsWord}` }))
      ] });
  });
  const r2Cols = [{ key: 'cntry', label: 'Country', value: (r: any) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'r2', label: 'R²', num: true, render: (r: any) => fmtNum(r.r2, 3) }];

  // ---- 5. change in productivity: 2004 (or the first year after it) to the snapshot year
  const focusLp = $derived(focusAll.filter((r) => r.lp != null));
  const growthStart = $derived.by(() => {
    const ys = [...new Set(focusLp.map((r) => r.year))].filter((y) => y >= 2004 && y < year);
    return ys.length ? Math.min(...ys) : null;
  });
  const growth = $derived.by(() => {
    if (growthStart == null) return [];
    const start = new Map(focusLp.filter((r) => r.year === growthStart).map((r) => [r.id, r.lp!]));
    const n = year - growthStart;
    const filledStart = new Set(focusLp.filter((r) => r.year === growthStart && r.filled).map((r) => r.id));
    return focusLp.filter((r) => r.year === year && start.has(r.id)).map((r) => ({ id: r.id, name: r.name + (r.filled || filledStart.has(r.id) ? ' †' : ''), lp_start: start.get(r.id)!, lp_end: r.lp!, cagr: (Math.pow(r.lp! / start.get(r.id)!, 1 / n) - 1) * 100 }))
      .sort((a, b) => b.cagr - a.cagr);
  });
  const growthCols = $derived([
    { key: 'name', label: unit, render: (r: any) => r.name },
    { key: 'lp_start', label: `Productivity (${growthStart ?? ''})`, num: true, render: (r: any) => fmtUsd(r.lp_start) },
    { key: 'lp_end', label: `Productivity (${year})`, num: true, render: (r: any) => fmtUsd(r.lp_end) },
    { key: 'cagr', label: 'CAGR (%)', num: true, render: (r: any) => fmtPct(r.cagr, 2) }
  ]);

  // ---- 6. spread: percentiles within the country, coefficient of variation across countries
  const pctRows = $derived.by(() => {
    const ys = [...new Set(focusLp.map((r) => r.year))].sort((a, b) => a - b);
    return ys.map((y) => { const v = focusLp.filter((r) => r.year === y).map((r) => r.lp!); return { year: y, n: v.length, p10: quantile(v, 0.1), p25: quantile(v, 0.25), p50: median(v), p75: quantile(v, 0.75), p90: quantile(v, 0.9) }; });
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
    marks.push(Plot.tip(pctRows, Plot.pointerX({ x: 'year', y: 'p50', title: (d: any) => `${d.year} · ${d.n} ${unitsWord}\n90th ${fmtUsd(d.p90)}\n75th ${fmtUsd(d.p75)}\nMedian ${fmtUsd(d.p50)}\n25th ${fmtUsd(d.p25)}\n10th ${fmtUsd(d.p10)}` })));
    return Plot.plot({ width: o.width, height: 300, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
      x: yearAxis(xCommon, yearTicks(xCommon[0], xCommon[1], 5)), y: { label: 'Labour productivity (USD PPP per worker)', grid: true, tickFormat: (d: number) => '$' + fmtShort(d) }, marks });
  });
  const pctCols = [{ key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, ...PCT.map((p) => ({ key: p.k, label: p.label, num: true, render: (r: any) => fmtUsd(r[p.k]) }))];

  const covRows = $derived(byCY.filter((r) => r.cov != null));
  const covMake = $derived((o: { width: number; tokens: any }) => countryLines<CountryYear>({ rows: covRows, x: (d) => d.year, y: (d) => d.cov, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 260, yLabel: 'Coefficient of variation (%)', yFormat: (v) => fmtNum(v, 0) + '%', covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nCoefficient of variation ${fmtNum(d.cov, 1)}%` }));
  const meanMake = $derived((o: { width: number; tokens: any }) => countryLines<CountryYear>({ rows: byCY, x: (d) => d.year, y: (d) => d.mean_lp, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 320, yLabel: 'Mean labour productivity (USD PPP per worker)', yFormat: (v) => '$' + fmtShort(v), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nMean ${fmtUsd(d.mean_lp)} over ${d.n} ${unitsWord}` }));
  const cyCols = [{ key: 'cntry', label: 'Country', value: (r: CountryYear) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'mean_lp', label: 'Mean productivity', num: true, render: (r: CountryYear) => fmtUsd(r.mean_lp) }, { key: 'cov', label: 'Coefficient of variation (%)', num: true, render: (r: CountryYear) => fmtNum(r.cov, 1) }];
  const present = $derived(new Set(byCY.map((r) => r.cntry_iso3)));
  import { t } from '../lib/text/t';
  import Text from '../lib/components/Text.svelte';
</script>

{#if geo === 'national'}
<NationalProductivity />
{:else}
<div class="view">
  <header class="hd">
    <div>
      <h1>{t('productivity.title', { country: name })}</h1>
      <div class="sub">{t(fua ? 'productivity.sub' : 'productivity.reg.sub', { level: levelName })}{#if loading} · <Spinner size={12} />{/if}</div>
      {#if error}<div class="err">{error}</div>{/if}
    </div>
    <label class="yr">
      <span class="muted">{t('productivity.year.label')}</span>
      <select value={year} onchange={(e) => setQuery({ year: Number((e.target as HTMLSelectElement).value) === refYear ? undefined : (e.target as HTMLSelectElement).value })}>
        {#each years as y (y.year)}<option value={y.year}>{y.year}{y.year === refYear ? ' ' + t('productivity.year.ref') : ''} · {t('productivity.year.countries', { n: y.n_countries })}</option>{/each}
      </select>
    </label>
  </header>

  {#if missing}
    <div class="card prose"><p>{t('level.missing', { level: levelName, country: name })}</p></div>
  {:else}
  <ChartCard title={t(fua ? 'productivity.ranks.title' : 'productivity.reg.ranks.title', { level: levelName, year })} note={ranked.some((r) => r.filled) ? t('ukfill.note') : ''}>
    {#snippet intro()}
      <p><Text k={fua ? 'productivity.ranks.intro' : 'productivity.reg.ranks.intro'} vars={{ level: levelName, country: name, year, ref_clause: year === refYear ? t('productivity.ref_clause') : '' }} /></p>
    {/snippet}
    {#if ranked.length}
      <RankTable rows={ranked} columns={rankCols} csvName={`${iso3}_productivity_ranks${csvLv}_${year}`} />
    {:else if !loading}
      <p class="muted">{t('productivity.ranks.none', { country: name, year })}</p>
    {/if}
  </ChartCard>

  {/if}

  <ChartCard title={t(fua ? 'productivity.scatter.title' : 'productivity.reg.scatter.title', { level: levelName, year })} columns={scatterCols} rows={scatter} csvName={`${geo}_productivity_population_${year}`}>
    {#snippet intro()}
      <p><Text k={fua ? 'productivity.scatter.intro' : 'productivity.reg.scatter.intro'} vars={{ level: levelName, year, country: name, n_fua: scatter.length, n_countries: nScatterCountries }} /></p>
      {#if focusPts.length}<p><Text k={fua ? 'productivity.scatter.trend' : 'productivity.reg.scatter.trend'} vars={{ level: levelName, possessive: poss(name) }} />{#if natRef != null}{' '}<Text k="productivity.scatter.nat" vars={{ possessive: poss(name), year, value: fmtUsd(natRef) }} />{/if}</p>
      {:else if natRef != null}<p><Text k={fua ? 'productivity.scatter.nat_only' : 'productivity.reg.scatter.nat_only'} vars={{ level: levelName, possessive: poss(name), country: name, year, value: fmtUsd(natRef) }} /></p>{/if}
    {/snippet}
    <PlotChart make={scatterMake} height={520} label={t(fua ? 'productivity.scatter.title' : 'productivity.reg.scatter.title', { level: levelName, year })} />
  </ChartCard>

  <ChartCard title={t('productivity.r2.title')} columns={r2Cols} rows={r2Rows} csvName={`r2_population_productivity${csvLv}`} note={t(fua ? 'productivity.r2.note' : 'productivity.reg.r2.note', { level: levelName })}>
    {#snippet intro()}<p><Text k={fua ? 'productivity.r2.intro' : 'productivity.reg.r2.intro'} vars={{ level: levelName }} /></p>{/snippet}
    <PlotChart make={r2Make} height={36 * Math.max(1, r2Rows.length) + 50} label={t('productivity.r2.title')} />
  </ChartCard>

  {#if !missing}
  <ChartCard title={t(fua ? 'productivity.growth.title' : 'productivity.reg.growth.title', { level: levelName, start: growthStart ?? 2004, year })} note={growth.some((r) => r.name.endsWith(' †')) ? t('ukfill.note') : ''}>
    {#snippet intro()}
      <p><Text k={fua ? 'productivity.growth.intro' : 'productivity.reg.growth.intro'} vars={{ level: levelName, start: growthStart ?? 2004, year }} />{#if year === refYear}{' '}<Text k="productivity.growth.ends" vars={{ ref_year: refYear }} />{/if}{#if growthStart != null && growthStart > 2004}{' '}<Text k="productivity.growth.begins" vars={{ start: growthStart, country: name }} />{/if}</p>
    {/snippet}
    {#if growth.length}
      <RankTable rows={growth} columns={growthCols} csvName={`${iso3}_productivity_growth${csvLv}_${growthStart}_${year}`} />
    {:else if !loading}
      <p class="muted">{t('productivity.growth.none', { country: name, year })}</p>
    {/if}
  </ChartCard>

  <ChartCard title={t(fua ? 'productivity.spread.title' : 'productivity.reg.spread.title', { level: levelName, country: name })} columns={pctCols} rows={pctRows} csvName={`${iso3}_productivity_percentiles${csvLv}`} note={t('productivity.spread.note') + (anyFilled ? ' ' + t('ukfill.note') : '')}>
    {#snippet intro()}
      <p><Text k={fua ? 'productivity.spread.intro' : 'productivity.reg.spread.intro'} vars={{ level: levelName, possessive: poss(name) }} />{#if pctRows.length >= 2}{' '}<Text k="productivity.spread.covers" vars={{ n: pctRows.length, country: name, first: pctRows[0].year, last: pctRows[pctRows.length - 1].year }} />
        {:else}{' '}<Text k="productivity.spread.few" vars={{ how_many: t(pctRows.length ? 'productivity.spread.single' : 'productivity.spread.none'), country: name }} />{/if}</p>
    {/snippet}
    {#if pctRows.length >= 2}
      <PlotChart make={pctMake} height={300} label={t(fua ? 'productivity.spread.title' : 'productivity.reg.spread.title', { level: levelName, country: name })} />
      <div class="pleg">{#each PCT as p, i (p.k)}<span class="it"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" stroke-width={p.w} stroke-dasharray={p.dash} /></svg>{p.label}</span>{/each}</div>
    {/if}
  </ChartCard>

  {/if}

  <ChartCard title={t(fua ? 'productivity.cov.title' : 'productivity.reg.cov.title', { level: levelName })} columns={cyCols} rows={covRows} csvName={`productivity_cov${csvLv}`} note={t(fua ? 'productivity.cov.note' : 'productivity.reg.cov.note', { level: levelName })}>
    <PlotChart make={covMake} height={260} label={t(fua ? 'productivity.cov.title' : 'productivity.reg.cov.title', { level: levelName })} />
    <CountryLegend {countries} {colours} focus={iso3} {present} />
  </ChartCard>

  <ChartCard title={t(fua ? 'productivity.mean.title' : 'productivity.reg.mean.title', { level: levelName })} columns={cyCols} rows={byCY} csvName={`productivity_mean${csvLv}`} note={t(fua ? 'productivity.mean.note' : 'productivity.reg.mean.note', { level: levelName })}>
    <PlotChart make={meanMake} height={320} label={t(fua ? 'productivity.mean.title' : 'productivity.reg.mean.title', { level: levelName })} />
    <CountryLegend {countries} {colours} focus={iso3} {present} />
  </ChartCard>
</div>
{/if}

<style>
  .hd { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .hd > div { flex: 1; }
  .yr { display: flex; align-items: center; gap: 8px; }
  .pleg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--fg-2); }
  .it { display: inline-flex; align-items: center; gap: 6px; }
</style>
