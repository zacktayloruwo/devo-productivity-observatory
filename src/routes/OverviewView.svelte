<script lang="ts">
  // The Overview: the report's "Functional Urban Areas in <country>" table
  // and the national context. Route: #/overview/<ISO3>
  import * as Plot from '@observablehq/plot';
  import { href } from '../lib/router.svelte';
  import { routeCountry } from '../lib/routeState';
  import { manifest, countryName, countryOf } from '../lib/db/manifest.svelte';
  import { fuaCountry, natAll, type FuaRow, type NatRow } from '../lib/db/queries';
  import { fmtInt, fmtPct, fmtUsd, fmtShort, poss } from '../lib/util/format';
  import { median, mean } from '../lib/util/stats';
  import { countryColours, REGION_DASH, byRegion } from '../lib/countries';
  import { plotStyle, yearAxis, yearTicks, MARGIN, covidRect } from '../lib/charts/plot';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);

  let fua = $state<FuaRow[]>([]);
  let nat = $state<NatRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const c = iso3; const my = ++token;
    if (!manifest.countries.length) return;
    loading = true; error = '';
    Promise.all([fuaCountry(c), natAll()]).then(([f, n]) => { if (my !== token) return; fua = f; nat = n; loading = false; })
      .catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  // Restricted to FUAs carrying both GDP and productivity, so every column
  // describes the same set of areas (as in the report)
  const sel = $derived(fua.filter((r) => r.gdp_pct_nat != null && r.labprod_usdppp != null));
  const latestYear = $derived(sel.length ? Math.max(...sel.map((r) => r.year)) : null);
  const years = $derived.by(() => {
    const ys = new Set<number>([2009, 2014, refYear]);
    if (latestYear) ys.add(latestYear);
    return [...ys].sort((a, b) => a - b);
  });
  const natPop = (y: number) => nat.find((n) => n.cntry_iso3 === iso3 && n.year === y)?.pop_nat ?? null;
  function stats(y: number) {
    const f = sel.filter((r) => r.year === y);
    const pp = f.map((r) => r.pop).filter((p): p is number => p != null);
    const np = natPop(y);
    return {
      n: f.length || null,
      med: pp.length ? median(pp) : null,
      avg: pp.length ? mean(pp) : null,
      min: pp.length ? Math.min(...pp) : null,
      popShare: pp.length && np ? (100 * pp.reduce((a, b) => a + b, 0)) / np : null,
      gdpShare: f.length ? f.reduce((a, r) => a + (r.gdp_pct_nat ?? 0), 0) : null
    };
  }
  const table = $derived(years.map((y) => ({ year: y, label: y === latestYear ? `${y} (latest)` : String(y), ...stats(y) })));
  const measures = [
    { key: 'n', label: 'Functional urban areas', f: fmtInt },
    { key: 'med', label: 'Median FUA population', f: fmtInt },
    { key: 'avg', label: 'Average FUA population', f: fmtInt },
    { key: 'min', label: 'Smallest FUA population', f: fmtInt },
    { key: 'popShare', label: 'Combined FUA population, share of national population', f: (v: number | null) => fmtPct(v, 1) },
    { key: 'gdpShare', label: 'Combined FUA GDP, share of national GDP', f: (v: number | null) => fmtPct(v, 1) }
  ] as const;

  // notes under the table: the 250,000 threshold and population provenance
  const shown = $derived(sel.filter((r) => years.includes(r.year) && r.pop != null));
  const nSmall = $derived(shown.filter((r) => (r.pop ?? Infinity) < 250000).length);
  const smallest = $derived(shown.length ? shown.reduce((a, b) => ((a.pop ?? Infinity) <= (b.pop ?? Infinity) ? a : b)) : null);
  const nInterp = $derived(shown.filter((r) => r.pop_source === 'interpolated' || r.pop_source === 'carried').length);

  // KPIs for the reference year
  const ref = $derived(stats(refYear));
  const natRef = $derived(nat.find((n) => n.cntry_iso3 === iso3 && n.year === refYear));
  const nFuaAll = $derived(new Set(fua.map((r) => r.fua_id)).size);
  const lpYears = $derived([...new Set(fua.filter((r) => r.labprod_usdppp != null).map((r) => r.year))].sort((a, b) => a - b));

  // national GDP per person employed, every country
  const natLp = $derived(nat.filter((n) => n.gdp_pw != null));
  const colours = $derived(countryColours(manifest.countries, iso3, '#c0392b'));
  const present = $derived(new Set(natLp.map((n) => n.cntry_iso3)));
  const natMake = $derived((o: { width: number; tokens: any }) => {
    if (!natLp.length) return null;
    const ys = natLp.map((n) => n.year);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const marks: any[] = [...covidRect(ys, o.tokens)];
    for (const g of byRegion(manifest.countries)) {
      const rows = natLp.filter((n) => g.items.some((c) => c.iso3 === n.cntry_iso3));
      marks.push(Plot.line(rows, { x: 'year', y: 'gdp_pw', z: 'cntry_iso3', stroke: (d: NatRow) => colours.get(d.cntry_iso3)!, strokeDasharray: REGION_DASH[g.region] || undefined,
        strokeWidth: (d: NatRow) => (d.cntry_iso3 === iso3 ? 2.6 : 1.2), strokeOpacity: (d: NatRow) => (d.cntry_iso3 === iso3 ? 1 : 0.6) }));
    }
    marks.push(Plot.tip(natLp, Plot.pointer({ x: 'year', y: 'gdp_pw', title: (d: NatRow) => `${countryName(d.cntry_iso3)} ${d.year}\n${fmtUsd(d.gdp_pw)} per person employed` })));
    return Plot.plot({ width: o.width, height: 280, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
      x: yearAxis([lo, hi], yearTicks(lo, hi, 5)), y: { label: 'GDP per person employed (USD PPP)', grid: true, tickFormat: (d: number) => '$' + fmtShort(d) }, marks });
  });
  const natCols = [{ key: 'cntry', label: 'Country', value: (r: NatRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'gdp_pw', label: 'GDP per person employed (USD PPP)', num: true, render: (r: NatRow) => fmtUsd(r.gdp_pw) }];
</script>

<div class="view">
  <header>
    <h1>{name}</h1>
    <div class="sub">{countryOf(iso3)?.region ?? ''} · {nFuaAll} functional urban areas in the OECD data{#if lpYears.length}, labour productivity {lpYears[0]}–{lpYears[lpYears.length - 1]}{/if}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="card prose">
    <h3>Reading the Observatory</h3>
    <div>
      <p><a href={href(['productivity', iso3])}>Productivity</a> ranks {poss(name)} FUAs by labour productivity, compares them with every other country's, and follows the spread of productivity over time. <a href={href(['autonomy', iso3])}>Autonomy</a> traces the Local Autonomy Index and the Regional Authority Index. <a href={href(['map', iso3])}>Map</a> draws any FUA indicator on the OECD boundaries for any year.</p>
      <p>Every chart can be shown as a table and downloaded as CSV. Dollar figures are nominal USD at purchasing power parity, comparable across countries within a year. Dollar values are not adjusted for inflation across time.</p>
    </div>
  </div>

  <div class="strip">
    <div class="card kpi"><div class="lab">FUAs with productivity, {refYear}</div><div class="big num">{fmtInt(ref.n)}</div><div class="sub">of {nFuaAll} FUAs in {name}</div></div>
    <div class="card kpi"><div class="lab">Median FUA population, {refYear}</div><div class="big num">{fmtInt(ref.med)}</div></div>
    <div class="card kpi"><div class="lab">FUA share of population, {refYear}</div><div class="big num">{fmtPct(ref.popShare, 1)}</div></div>
    <div class="card kpi"><div class="lab">FUA share of GDP, {refYear}</div><div class="big num">{fmtPct(ref.gdpShare, 1)}</div></div>
    <div class="card kpi"><div class="lab">National GDP per worker, {refYear}</div><div class="big num">{fmtUsd(natRef?.gdp_pw)}</div><div class="sub">USD PPP per person employed</div></div>
  </div>

  <ChartCard title={`Functional urban areas in ${name}`} columns={[{ key: 'year', label: 'Year', num: true }, ...measures.map((m) => ({ key: m.key, label: m.label, num: true, render: (r: any) => m.f(r[m.key]) }))]} rows={table} csvName={`${iso3}_fua_overview`}>
    {#snippet intro()}
      <p>Functional urban areas (FUAs) are the OECD's definition of a city and its commuting zone. The table summarises those in {name} at the years shown. Only FUAs for which the OECD publishes both GDP and labour productivity are counted; population and GDP are each taken from the year shown. Dollar figures are nominal USD at purchasing power parity: comparable across countries within a year, not across years.</p>
    {/snippet}
    {#if !sel.length && !loading}
      <p class="muted">The OECD publishes no functional urban area GDP or labour productivity for {name}.</p>
    {:else}
      <div class="wrap">
        <table class="data">
          <thead><tr><th>Measure</th>{#each table as t (t.year)}<th class="num">{t.label}</th>{/each}</tr></thead>
          <tbody>
            {#each measures as m (m.key)}
              <tr><td>{m.label}</td>{#each table as t (t.year)}<td class="num">{m.f((t as any)[m.key])}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted">The OECD disseminates FUA labour productivity for areas of 250,000 inhabitants or more; the threshold is applied when FUAs are classified, not to each year's population.
        {#if nSmall > 0 && smallest} Measured population dips below it in {nSmall} of the {shown.length} area-years shown, the smallest being {smallest.fua_name} at {fmtInt(smallest.pop)} in {smallest.year}.{/if}
        {#if nInterp > 0} Population is interpolated or carried from a neighbouring year for {nInterp === shown.length ? `all ${nInterp}` : `${nInterp} of the ${shown.length}`} area-years shown.{/if}
        See <a href={href(['sources', iso3])}>Sources</a> for how the series are combined.</p>
    {/if}
  </ChartCard>

  <ChartCard title="National labour productivity, by country" columns={natCols} rows={natLp} csvName="national_gdp_per_worker" note="OECD Productivity Database: GDP per person employed at chain-linked volumes, PPP-converted. The shaded band is the WHO pandemic emergency (March 2020 to May 2023).">
    {#snippet intro()}<p>The nation-wide series behind the comparisons that follow: {name} is drawn in red, the other countries in the colours used throughout the Observatory.</p>{/snippet}
    <PlotChart make={natMake} height={280} label="National GDP per person employed by country" />
    <CountryLegend countries={manifest.countries} {colours} focus={iso3} {present} />
  </ChartCard>

</div>

<style>
  .wrap { overflow: auto; }

</style>
