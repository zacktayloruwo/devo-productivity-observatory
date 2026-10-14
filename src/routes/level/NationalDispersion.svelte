<script lang="ts">
  // Dispersion at the national level: how unequal labour productivity is
  // across each country's TL2 and TL3 regions, latest values and over time.
  // Route: #/dispersion/<ISO3>?geo=national
  import * as Plot from '@observablehq/plot';
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName } from '../../lib/db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../../lib/db/queries';
  import { fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../../lib/util/format';
  import { mean } from '../../lib/util/stats';
  import { countryColours } from '../../lib/countries';
  import { plotStyle, MARGIN, covidRect, yearAxis, yearTicks } from '../../lib/charts/plot';
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
  const latestOf = (rows: NationalRow[], key: string) => { const r = rows.filter((x) => x[key] != null); return r.length ? r[r.length - 1] : null; };

  // the dispersion summary: every country, its latest value of each measure
  const disp = $derived(countries.map((c) => {
    const rs = nat.filter((r) => r.cntry_iso3 === c.iso3);
    const a = latestOf(rs, 'rd_tl2_cv'), b = latestOf(rs, 'rd_tl3_cv'), f = latestOf(rs, 'rd_tl2_frontier_empsh');
    return { cntry_iso3: c.iso3, display: c.display, cv2: a ? 100 * a.rd_tl2_cv! : null, cv2_year: a?.year ?? null, cv3: b ? 100 * b.rd_tl3_cv! : null, cv3_year: b?.year ?? null, front: f?.rd_tl2_frontier_empsh ?? null, front_year: f?.year ?? null };
  }).sort((a, b) => (b.cv2 ?? -1) - (a.cv2 ?? -1)));
  const yr = (y: number | null) => (y == null ? '' : ` (${y})`);
  const dispCols = [{ key: 'display', label: 'Country' },
    { key: 'cv2', label: 'TL2 coefficient of variation (%)', num: true, render: (r: any) => fmtNum(r.cv2, 1) }, { key: 'cv2_year', label: 'TL2 year', num: true },
    { key: 'cv3', label: 'TL3 coefficient of variation (%)', num: true, render: (r: any) => fmtNum(r.cv3, 1) }, { key: 'cv3_year', label: 'TL3 year', num: true },
    { key: 'front', label: 'Frontier region share of employment (%)', num: true, render: (r: any) => fmtNum(r.front, 1) }, { key: 'front_year', label: 'Frontier year', num: true }];

  // ---- 3. regional dispersion: coefficient of variation across TL2 and TL3 regions
  const rdRows = $derived(nat.filter((r) => r.rd_tl2_cv != null || r.rd_tl3_cv != null).map((r) => ({ ...r, cv2: r.rd_tl2_cv == null ? null : 100 * r.rd_tl2_cv, cv3: r.rd_tl3_cv == null ? null : 100 * r.rd_tl3_cv })));
  const rdMake = (key: 'cv2' | 'cv3', lv: string) => (o: { width: number; tokens: any }) =>
    countryLines<any>({ rows: rdRows, x: (d) => d.year, y: (d) => d[key], iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 280, yLabel: `Coefficient of variation across ${lv} regions (%)`, yFormat: (v) => fmtNum(v, 0) + '%', covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${lv} coefficient of variation ${fmtNum(d[key], 1)}%` });
  const rd2Make = $derived(rdMake('cv2', 'TL2'));
  const rd3Make = $derived(rdMake('cv3', 'TL3'));
  const rdCols = [{ key: 'cntry', label: 'Country', value: (r: any) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    { key: 'cv2', label: 'TL2 coefficient of variation (%)', num: true, render: (r: any) => fmtNum(r.cv2, 1) }, { key: 'cv3', label: 'TL3 coefficient of variation (%)', num: true, render: (r: any) => fmtNum(r.cv3, 1) }];
  const rd2Present = $derived(new Set(rdRows.filter((r) => r.cv2 != null).map((r) => r.cntry_iso3)));
  const rd3Present = $derived(new Set(rdRows.filter((r) => r.cv3 != null).map((r) => r.cntry_iso3)));
</script>

<div class="view">
  <header>
    <h1>{t('dispersion.title', { country: name })}</h1>
    <div class="sub">{t('dispersion.nat.sub')}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <ChartCard title={t('overview.nat2.disp.title')} columns={dispCols} rows={disp} csvName="regional_dispersion_latest" note={t('overview.nat2.disp.note')}>
    {#snippet intro()}<p><Text k="overview.nat2.disp.intro" /></p>{/snippet}
    <div class="wrap">
      <table class="data">
        <thead><tr><th>Country</th><th class="num">{t('overview.nat2.disp.cv2')}</th><th class="num">{t('overview.nat2.disp.cv3')}</th><th class="num">{t('overview.nat2.disp.front')}</th></tr></thead>
        <tbody>
          {#each disp as d (d.cntry_iso3)}
            <tr class:focus={d.cntry_iso3 === iso3}><td>{d.display}</td><td class="num">{fmtPct(d.cv2, 1)}<span class="faint">{yr(d.cv2_year)}</span></td><td class="num">{fmtPct(d.cv3, 1)}<span class="faint">{yr(d.cv3_year)}</span></td><td class="num">{fmtPct(d.front, 1)}<span class="faint">{yr(d.front_year)}</span></td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </ChartCard>

  <div class="two">
    <ChartCard title={t('productivity.nat.rd.title', { level: 'TL2' })} columns={rdCols} rows={rdRows} csvName="regional_dispersion_cv" note={t('productivity.nat.rd.note')}>
      {#snippet intro()}<p><Text k="productivity.nat.rd.intro" vars={{ level: 'TL2' }} /></p>{/snippet}
      <PlotChart make={rd2Make} height={280} label={t('productivity.nat.rd.title', { level: 'TL2' })} />
      <CountryLegend {countries} {colours} focus={iso3} present={rd2Present} />
    </ChartCard>
    <ChartCard title={t('productivity.nat.rd.title', { level: 'TL3' })} columns={rdCols} rows={rdRows} csvName="regional_dispersion_cv" note={t('productivity.nat.rd.note')}>
      {#snippet intro()}<p><Text k="productivity.nat.rd.intro" vars={{ level: 'TL3' }} />{#if !rd3Present.has(iso3)}{' '}{t('productivity.nat.rd.no_tl3', { country: name })}{/if}</p>{/snippet}
      <PlotChart make={rd3Make} height={280} label={t('productivity.nat.rd.title', { level: 'TL3' })} />
      <CountryLegend {countries} {colours} focus={iso3} present={rd3Present} />
    </ChartCard>
  </div>
</div>

<style>
  .wrap { overflow: auto; }
  tr.focus td { font-weight: 600; color: #c0392b; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .two { grid-template-columns: 1fr; } }
</style>
