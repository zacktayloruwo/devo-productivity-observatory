<script lang="ts">
  // The Overview: the report's "Functional Urban Areas in <country>" table
  // and the national context; TL2/TL3 and national have their own
  // components. Route: #/overview/<ISO3>?geo=<level>
  import * as Plot from '@observablehq/plot';
  import { href } from '../lib/router.svelte';
  import { routeCountry, routeGeo } from '../lib/routeState';
  import { manifest, countryName, countryOf } from '../lib/db/manifest.svelte';
  import { fuaCountry, natAll, type FuaRow, type NatRow } from '../lib/db/queries';
  import { fmtInt, fmtPct, fmtUsd, fmtShort, poss } from '../lib/util/format';
  import { median, mean } from '../lib/util/stats';
  import { countryColours, REGION_DASH, byRegion } from '../lib/countries';
  import { plotStyle, yearAxis, yearTicks, MARGIN, covidRect, fromFirstYear } from '../lib/charts/plot';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';
  import RegionOverview from './level/RegionOverview.svelte';
  import NationalOverview from './level/NationalOverview.svelte';
  import NationalLpCard from '../lib/components/cards/NationalLpCard.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);
  const geo = $derived(routeGeo());

  let fua = $state<FuaRow[]>([]);
  let nat = $state<NatRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const c = iso3; const my = ++token;
    if (!manifest.countries.length || geo !== 'fua') return;
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
  const table = $derived(years.map((y) => ({ year: y, label: y === latestYear ? t('overview.table.latest', { year: y }) : String(y), ...stats(y) })));
  const measures = [
    { key: 'n', label: t('overview.measure.n'), f: fmtInt },
    { key: 'med', label: t('overview.measure.median'), f: fmtInt },
    { key: 'avg', label: t('overview.measure.avg'), f: fmtInt },
    { key: 'min', label: t('overview.measure.min'), f: fmtInt },
    { key: 'popShare', label: t('overview.measure.pop_share'), f: (v: number | null) => fmtPct(v, 1) },
    { key: 'gdpShare', label: t('overview.measure.gdp_share'), f: (v: number | null) => fmtPct(v, 1) }
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
  const natLp = $derived(fromFirstYear(nat.filter((n) => n.gdp_pw != null)));
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
  import { t } from '../lib/text/t';
  import Text from '../lib/components/Text.svelte';
</script>

{#if geo === 'national'}
<NationalOverview />
{:else if geo !== 'fua'}
<RegionOverview level={geo} />
{:else}
<div class="view">
  <header>
    <h1>{name}</h1>
    <div class="sub">{t('overview.sub', { region: countryOf(iso3)?.region ?? '', n_fua: nFuaAll })}{#if lpYears.length}, {t('overview.sub.years', { first: lpYears[0], last: lpYears[lpYears.length - 1] })}{/if}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="card prose">
    <h3>{t('overview.reading.title')}</h3>
    <div>
      <p><Text k="overview.reading.1" vars={{ possessive: poss(name) }} /></p>
      <p><Text k="overview.reading.2" /></p>
    </div>
  </div>

  <div class="strip">
    <div class="card kpi"><div class="lab">{t('overview.kpi.n', { ref_year: refYear })}</div><div class="big num">{fmtInt(ref.n)}</div><div class="sub">{t('overview.kpi.n.sub', { n_fua: nFuaAll, country: name })}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.kpi.median', { ref_year: refYear })}</div><div class="big num">{fmtInt(ref.med)}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.kpi.pop_share', { ref_year: refYear })}</div><div class="big num">{fmtPct(ref.popShare, 1)}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.kpi.gdp_share', { ref_year: refYear })}</div><div class="big num">{fmtPct(ref.gdpShare, 1)}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.kpi.nat', { ref_year: refYear })}</div><div class="big num">{fmtUsd(natRef?.gdp_pw)}</div><div class="sub">{t('overview.kpi.nat.sub')}</div></div>
  </div>

  <ChartCard title={t('overview.table.title', { country: name })} columns={[{ key: 'year', label: 'Year', num: true }, ...measures.map((m) => ({ key: m.key, label: m.label, num: true, render: (r: any) => m.f(r[m.key]) }))]} rows={table} csvName={`${iso3}_fua_overview`}>
    {#snippet intro()}
      <p><Text k="overview.table.intro" vars={{ country: name }} /></p>
    {/snippet}
    {#if !sel.length && !loading}
      <p class="muted">{t('overview.table.none', { country: name })}</p>
    {:else}
      <div class="wrap">
        <table class="data">
          <thead><tr><th>{t('overview.table.measure')}</th>{#each table as tr (tr.year)}<th class="num">{tr.label}</th>{/each}</tr></thead>
          <tbody>
            {#each measures as m (m.key)}
              <tr><td>{m.label}</td>{#each table as tr (tr.year)}<td class="num">{m.f((tr as any)[m.key])}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted">{t('overview.table.note.threshold')}
        {#if nSmall > 0 && smallest}{' '}{t('overview.table.note.small', { n_small: nSmall, n_shown: shown.length, fua: smallest.fua_name, pop: fmtInt(smallest.pop), year: smallest.year })}{/if}
        {#if nInterp > 0}{' '}{t('overview.table.note.interp', { which: nInterp === shown.length ? t('overview.table.note.interp.all', { n: nInterp }) : t('overview.table.note.interp.some', { n: nInterp, total: shown.length }) })}{/if}
{' '}<Text k="overview.table.note.sources" /></p>
    {/if}
  </ChartCard>

  <NationalLpCard {iso3} {name} />
</div>
{/if}

<style>
  .wrap { overflow: auto; }

</style>
