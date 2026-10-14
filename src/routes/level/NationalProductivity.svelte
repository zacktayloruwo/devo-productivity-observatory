<script lang="ts">
  // Productivity at the national level: national labour productivity per
  // person employed or per hour, every country, from 2000 (growth is in the
  // Growth view, regional dispersion in Dispersion).
  // Route: #/productivity/<ISO3>?geo=national
  import * as Plot from '@observablehq/plot';
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName } from '../../lib/db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../../lib/db/queries';
  import { fmtUsd, fmtNum, fmtShort, poss } from '../../lib/util/format';
  import { mean } from '../../lib/util/stats';
  import { countryColours } from '../../lib/countries';
  import { plotStyle, MARGIN, covidRect, yearAxis, yearTicks, FIRST_YEAR } from '../../lib/charts/plot';
  import { countryLines } from '../../lib/charts/countryLines';
  import ChartCard from '../../lib/components/ChartCard.svelte';
  import PlotChart from '../../lib/components/PlotChart.svelte';
  import CountryLegend from '../../lib/components/CountryLegend.svelte';
  import Spinner from '../../lib/components/Spinner.svelte';
  import Text from '../../lib/components/Text.svelte';
  import { t } from '../../lib/text/t';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));

  let nat = $state<NationalRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  $effect(() => {
    if (!countries.length) return;
    nationalAll().then((n) => { nat = n; loading = false; }).catch((e) => { error = e?.message ?? String(e); loading = false; });
  });

  // ---- 1. national labour productivity: per person employed or per hour
  let measure = $state<'gdp_pw' | 'gdp_ph'>('gdp_pw');
  const MEASURES = { gdp_pw: { label: 'GDP per person employed (USD PPP)', unit: 'per person employed', f: fmtUsd }, gdp_ph: { label: 'GDP per hour worked (USD PPP)', unit: 'per hour worked', f: (v: number | null) => (v == null ? '—' : '$' + fmtNum(v, 2)) } };
  // the Productivity view starts in 2000
  const lpRows = $derived(nat.filter((r) => r[measure] != null && r.year >= FIRST_YEAR));
  const lpMake = $derived((o: { width: number; tokens: any }) => {
    const m = MEASURES[measure];
    return countryLines<NationalRow>({ rows: lpRows, x: (d) => d.year, y: (d) => d[measure], iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 300, yLabel: m.label, yFormat: (v) => '$' + fmtShort(v), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${m.f(d[measure])} ${m.unit}` });
  });
  const lpCols = [{ key: 'cntry', label: 'Country', value: (r: NationalRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    { key: 'gdp_pw', label: 'GDP per person employed (USD PPP)', num: true, render: (r: NationalRow) => fmtUsd(r.gdp_pw) },
    { key: 'gdp_ph', label: 'GDP per hour worked (USD PPP)', num: true, render: (r: NationalRow) => MEASURES.gdp_ph.f(r.gdp_ph) },
    { key: 'gdp_pc', label: 'GDP per capita (USD PPP)', num: true, render: (r: NationalRow) => fmtUsd(r.gdp_pc) }];
  const lpPresent = $derived(new Set(lpRows.map((r) => r.cntry_iso3)));




</script>

<div class="view">
  <header>
    <h1>{t('productivity.title', { country: name })}</h1>
    <div class="sub">{t('productivity.nat.sub')}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <ChartCard title={t('productivity.nat.lp.title')} columns={lpCols} rows={lpRows} csvName="national_labour_productivity" note={t('productivity.nat.lp.note')}>
    {#snippet extra()}
      <div class="seg" role="group" aria-label={t('productivity.nat.lp.measure')}>
        <button type="button" aria-pressed={measure === 'gdp_pw'} onclick={() => (measure = 'gdp_pw')}>{t('productivity.nat.lp.pw')}</button>
        <button type="button" aria-pressed={measure === 'gdp_ph'} onclick={() => (measure = 'gdp_ph')}>{t('productivity.nat.lp.ph')}</button>
      </div>
    {/snippet}
    {#snippet intro()}<p><Text k="productivity.nat.lp.intro" vars={{ country: name }} /></p>{/snippet}
    <PlotChart make={lpMake} height={300} label={t('productivity.nat.lp.title')} />
    <CountryLegend {countries} {colours} focus={iso3} present={lpPresent} />
  </ChartCard>

</div>

