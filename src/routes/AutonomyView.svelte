<script lang="ts">
  // The Autonomy view: the Local Autonomy Index and the Regional Authority
  // Index, total and fiscal, every country. Route: #/autonomy/<ISO3>
  import { routeCountry } from '../lib/routeState';
  import { manifest, countryName } from '../lib/db/manifest.svelte';
  import { laiAll, raiAll, type LaiRow, type RaiRow } from '../lib/db/queries';
  import { fmtNum } from '../lib/util/format';
  import { countryColours } from '../lib/countries';
  import { countryLines } from '../lib/charts/countryLines';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));

  let lai = $state<LaiRow[]>([]);
  let rai = $state<RaiRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  $effect(() => {
    if (!countries.length) return;
    Promise.all([laiAll(), raiAll()]).then(([l, r]) => { lai = l; rai = r; loading = false; }).catch((e) => { error = e?.message ?? String(e); loading = false; });
  });

  const score = (v: number | null) => fmtNum(v, 2);
  const mk = (rows: any[], key: string, label: string) => (o: { width: number; tokens: any }) =>
    countryLines<any>({ rows, x: (d) => d.year, y: (d) => d[key], iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 320, yLabel: label, yFormat: (v) => fmtNum(v, 2), yDomain: [0, 1], step: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${label} ${fmtNum(d[key], 3)}` });
  const laiTotal = $derived(mk(lai, 'lai_total', 'LAI total score'));
  const laiFiscal = $derived(mk(lai, 'lai_fiscal_score', 'LAI fiscal score'));
  const raiTotal = $derived(mk(rai, 'rai_total', 'RAI total score'));
  const raiFiscal = $derived(mk(rai, 'rai_fiscal_score', 'RAI fiscal score'));

  const laiCols = [{ key: 'cntry', label: 'Country', value: (r: LaiRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    { key: 'lai_total', label: 'LAI total', num: true, render: (r: LaiRow) => score(r.lai_total) }, { key: 'lai_fiscal_score', label: 'LAI fiscal', num: true, render: (r: LaiRow) => score(r.lai_fiscal_score) },
    { key: 'lai_fiscalautonomy', label: 'Fiscal autonomy', num: true, render: (r: LaiRow) => score(r.lai_fiscalautonomy) }, { key: 'lai_transfer', label: 'Transfer system', num: true, render: (r: LaiRow) => score(r.lai_transfer) },
    { key: 'lai_financialselfreliance', label: 'Financial self-reliance', num: true, render: (r: LaiRow) => score(r.lai_financialselfreliance) }, { key: 'lai_borrowingautonomy', label: 'Borrowing autonomy', num: true, render: (r: LaiRow) => score(r.lai_borrowingautonomy) }];
  const raiCols = [{ key: 'cntry', label: 'Country', value: (r: RaiRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    { key: 'rai_total', label: 'RAI total', num: true, render: (r: RaiRow) => score(r.rai_total) }, { key: 'rai_selfrule', label: 'Self-rule', num: true, render: (r: RaiRow) => score(r.rai_selfrule) }, { key: 'rai_sharedrule', label: 'Shared rule', num: true, render: (r: RaiRow) => score(r.rai_sharedrule) },
    { key: 'rai_fiscal_score', label: 'RAI fiscal', num: true, render: (r: RaiRow) => score(r.rai_fiscal_score) }, { key: 'rai_fiscalautonomy', label: 'Fiscal autonomy', num: true, render: (r: RaiRow) => score(r.rai_fiscalautonomy) }, { key: 'rai_borrowingautonomy', label: 'Borrowing autonomy', num: true, render: (r: RaiRow) => score(r.rai_borrowingautonomy) }];
  const laiPresent = $derived(new Set(lai.filter((r) => r.lai_total != null).map((r) => r.cntry_iso3)));
  const raiPresent = $derived(new Set(rai.filter((r) => r.rai_total != null).map((r) => r.cntry_iso3)));

  // the selected country's latest scores
  const latestOf = (rows: any[], key: string) => { const r = rows.filter((x) => x.cntry_iso3 === iso3 && x[key] != null); return r.length ? r[r.length - 1] : null; };
  const laiLast = $derived(latestOf(lai, 'lai_total'));
  const raiLast = $derived(latestOf(rai, 'rai_total'));
</script>

<div class="view">
  <header>
    <h1>Local and regional autonomy · {name}</h1>
    <div class="sub">Local Autonomy Index (1990–2020) and Regional Authority Index (1950–2018), scaled 0–1{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="strip">
    <div class="card kpi"><div class="lab">LAI total, {laiLast?.year ?? '—'}</div><div class="big num">{score(laiLast?.lai_total)}</div><div class="sub">local government autonomy</div></div>
    <div class="card kpi"><div class="lab">LAI fiscal, {laiLast?.year ?? '—'}</div><div class="big num">{score(laiLast?.lai_fiscal_score)}</div><div class="sub">fiscal dimension</div></div>
    <div class="card kpi"><div class="lab">RAI total, {raiLast?.year ?? '—'}</div><div class="big num">{score(raiLast?.rai_total)}</div><div class="sub">regional authority</div></div>
    <div class="card kpi"><div class="lab">RAI fiscal, {raiLast?.year ?? '—'}</div><div class="big num">{score(raiLast?.rai_fiscal_score)}</div><div class="sub">fiscal dimension</div></div>
  </div>

  <ChartCard title="Local Autonomy Index, total score" columns={laiCols} rows={lai} csvName="lai_national">
    {#snippet intro()}<p>The Local Autonomy Index project calculates an indicator of the political, policy and fiscal autonomy of local government in a range of Global North countries. The composite indicator is shown for 1990–2020.</p>{/snippet}
    <PlotChart make={laiTotal} height={320} label="LAI total score by country" />
    <CountryLegend {countries} {colours} focus={iso3} present={laiPresent} />
  </ChartCard>

  <ChartCard title="Local Autonomy Index, fiscal score" columns={laiCols} rows={lai} csvName="lai_national" note="Sub-indicators are summed with the index's own point weights (4, 3, 3, 3) and rescaled to 0–1.">
    {#snippet intro()}<p>The fiscal dimension of the LAI combines four sub-indicators: fiscal autonomy (independent power to tax), the financial transfer system (unconditionality of transfers received), financial self-reliance (reliance on own-source revenue) and borrowing autonomy (independent power to borrow).</p>{/snippet}
    <PlotChart make={laiFiscal} height={320} label="LAI fiscal score by country" />
    <CountryLegend {countries} {colours} focus={iso3} present={laiPresent} />
  </ChartCard>

  <ChartCard title="Regional Authority Index, total score" columns={raiCols} rows={rai} csvName="rai_national" note="National values are population-weighted means of regional scores, rescaled here to 0–1 from the published 0–30 scale.">
    {#snippet intro()}<p>The Regional Authority Index measures the self-rule and shared rule of regional governments from 1950 to 2018. Where the LAI assesses the autonomy of local governments, the RAI evaluates the autonomy of regional governments such as cantons, provinces, states or Länder: a federal country with strong provinces but weak local government may score high on the RAI and low on the LAI.</p>{/snippet}
    <PlotChart make={raiTotal} height={320} label="RAI total score by country" />
    <CountryLegend {countries} {colours} focus={iso3} present={raiPresent} />
  </ChartCard>

  <ChartCard title="Regional Authority Index, fiscal score" columns={raiCols} rows={rai} csvName="rai_national" note="Sub-indicators are summed with the index's own point weights (4 and 3) and rescaled to 0–1; national values are population-weighted means of regional scores.">
    {#snippet intro()}<p>The fiscal dimension of the RAI combines two sub-indicators: fiscal autonomy (independent power to tax) and borrowing autonomy (independent power to borrow).</p>{/snippet}
    <PlotChart make={raiFiscal} height={320} label="RAI fiscal score by country" />
    <CountryLegend {countries} {colours} focus={iso3} present={raiPresent} />
  </ChartCard>
</div>
