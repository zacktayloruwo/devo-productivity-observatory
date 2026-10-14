<script lang="ts">
  // The Autonomy view: the Local Autonomy Index and the Regional Authority
  // Index, total and fiscal, every country; at the national level also the
  // dimension indices and fiscal ratios, and region-specific indices at TL2
  // and TL3. Route: #/autonomy/<ISO3>?geo=<level>
  import { routeCountry, routeGeo } from '../lib/routeState';
  import { manifest, countryName } from '../lib/db/manifest.svelte';
  import { laiAll, raiAll, type LaiRow, type RaiRow } from '../lib/db/queries';
  import { fmtNum } from '../lib/util/format';
  import { countryColours } from '../lib/countries';
  import { countryLines } from '../lib/charts/countryLines';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';
  import RegionAutonomy from './level/RegionAutonomy.svelte';
  import NationalAutonomyExtra from './level/NationalAutonomyExtra.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const geo = $derived(routeGeo());
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));

  let lai = $state<LaiRow[]>([]);
  let rai = $state<RaiRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  $effect(() => {
    if (!countries.length || geo === 'tl2' || geo === 'tl3') return;
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
  import { t } from '../lib/text/t';
  import Text from '../lib/components/Text.svelte';
</script>

{#if geo === 'tl2' || geo === 'tl3'}
<RegionAutonomy level={geo} />
{:else}
<div class="view">
  <header>
    <h1>{t('autonomy.title', { country: name })}</h1>
    <div class="sub">{t('autonomy.sub')}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="strip">
    <div class="card kpi"><div class="lab">{t('autonomy.kpi.lai', { year: laiLast?.year ?? '—' })}</div><div class="big num">{score(laiLast?.lai_total)}</div><div class="sub">{t('autonomy.kpi.lai.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('autonomy.kpi.rai', { year: raiLast?.year ?? '—' })}</div><div class="big num">{score(raiLast?.rai_total)}</div><div class="sub">{t('autonomy.kpi.rai.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('autonomy.kpi.lai_fiscal', { year: laiLast?.year ?? '—' })}</div><div class="big num">{score(laiLast?.lai_fiscal_score)}</div><div class="sub">{t('autonomy.kpi.lai_fiscal.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('autonomy.kpi.rai_fiscal', { year: raiLast?.year ?? '—' })}</div><div class="big num">{score(raiLast?.rai_fiscal_score)}</div><div class="sub">{t('autonomy.kpi.rai_fiscal.sub')}</div></div>
  </div>

  <!-- LAI (local) on the left, RAI (regional) on the right -->
  <div class="pair">
    <ChartCard title={t('autonomy.lai.title')} columns={laiCols} rows={lai} csvName="lai_national">
      {#snippet intro()}<p><Text k="autonomy.lai.intro" /></p>{/snippet}
      <PlotChart make={laiTotal} height={320} label={t('autonomy.lai.title')} />
      <CountryLegend {countries} {colours} focus={iso3} present={laiPresent} />
    </ChartCard>
    <ChartCard title={t('autonomy.rai.title')} columns={raiCols} rows={rai} csvName="rai_national" note={t('autonomy.rai.note')}>
      {#snippet intro()}<p><Text k="autonomy.rai.intro" /></p>{/snippet}
      <PlotChart make={raiTotal} height={320} label={t('autonomy.rai.title')} />
      <CountryLegend {countries} {colours} focus={iso3} present={raiPresent} />
    </ChartCard>
    <ChartCard title={t('autonomy.lai_fiscal.title')} columns={laiCols} rows={lai} csvName="lai_national" note={t('autonomy.lai_fiscal.note')}>
      {#snippet intro()}<p><Text k="autonomy.lai_fiscal.intro" /></p>{/snippet}
      <PlotChart make={laiFiscal} height={320} label={t('autonomy.lai_fiscal.title')} />
      <CountryLegend {countries} {colours} focus={iso3} present={laiPresent} />
    </ChartCard>
    <ChartCard title={t('autonomy.rai_fiscal.title')} columns={raiCols} rows={rai} csvName="rai_national" note={t('autonomy.rai_fiscal.note')}>
      {#snippet intro()}<p><Text k="autonomy.rai_fiscal.intro" /></p>{/snippet}
      <PlotChart make={raiFiscal} height={320} label={t('autonomy.rai_fiscal.title')} />
      <CountryLegend {countries} {colours} focus={iso3} present={raiPresent} />
    </ChartCard>
  </div>
  {#if geo === 'national'}<NationalAutonomyExtra />{/if}
</div>
{/if}

<style>
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .pair { grid-template-columns: 1fr; } }
</style>
