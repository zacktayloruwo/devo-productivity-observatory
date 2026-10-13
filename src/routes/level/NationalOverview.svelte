<script lang="ts">
  // The Overview at the national level: the country's national productivity
  // and growth, and the regional dispersion of productivity in every country.
  // Route: #/overview/<ISO3>?geo=national
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName, countryOf } from '../../lib/db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../../lib/db/queries';
  import { fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../../lib/util/format';
  import { mean } from '../../lib/util/stats';
  import { countryColours } from '../../lib/countries';
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

  const mine = $derived(nat.filter((r) => r.cntry_iso3 === iso3));
  const at = (y: number) => mine.find((r) => r.year === y);
  const ref = $derived(at(refYear));
  // the latest year with a value of `key`, for a country
  const latestOf = (rows: NationalRow[], key: string) => { const r = rows.filter((x) => x[key] != null); return r.length ? r[r.length - 1] : null; };
  const growthAvg = $derived.by(() => { const g = mine.filter((r) => r.year > 2000 && r.year <= refYear && r.growth_gdp_pw != null).map((r) => r.growth_gdp_pw!); return g.length ? mean(g) : null; });
  const cv2 = $derived(latestOf(mine, 'rd_tl2_cv'));
  const cv3 = $derived(latestOf(mine, 'rd_tl3_cv'));
  const lpYears = $derived(mine.filter((r) => r.gdp_pw != null).map((r) => r.year));

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

  // national GDP per person employed, every country
  const lpRows = $derived(nat.filter((r) => r.gdp_pw != null));
  const lpMake = $derived((o: { width: number; tokens: any }) => countryLines<NationalRow>({ rows: lpRows, x: (d) => d.year, y: (d) => d.gdp_pw, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 280, yLabel: 'GDP per person employed (USD PPP)', yFormat: (v) => '$' + fmtShort(v), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${fmtUsd(d.gdp_pw)} per person employed` }));
  const lpCols = [{ key: 'cntry', label: 'Country', value: (r: NationalRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'gdp_pw', label: 'GDP per person employed (USD PPP)', num: true, render: (r: NationalRow) => fmtUsd(r.gdp_pw) }];
  const present = $derived(new Set(lpRows.map((r) => r.cntry_iso3)));
</script>

<div class="view">
  <header>
    <h1>{name}</h1>
    <div class="sub">{t('overview.nat2.sub', { region: countryOf(iso3)?.region ?? '' })}{#if lpYears.length}, {t('overview.sub.years', { first: lpYears[0], last: lpYears[lpYears.length - 1] })}{/if}{#if loading} · <Spinner size={12} />{/if}</div>
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
    <div class="card kpi"><div class="lab">{t('overview.kpi.nat', { ref_year: refYear })}</div><div class="big num">{fmtUsd(ref?.gdp_pw)}</div><div class="sub">{t('overview.kpi.nat.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.nat2.kpi.ph', { ref_year: refYear })}</div><div class="big num">{ref?.gdp_ph == null ? '—' : '$' + fmtNum(ref.gdp_ph, 2)}</div><div class="sub">{t('overview.nat2.kpi.ph.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.nat2.kpi.growth', { ref_year: refYear })}</div><div class="big num">{growthAvg == null ? '—' : fmtNum(growthAvg, 2)}</div><div class="sub">{t('overview.nat2.kpi.growth.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.nat2.kpi.cv', { level: 'TL2', year: cv2?.year ?? '—' })}</div><div class="big num">{fmtPct(cv2 ? 100 * cv2.rd_tl2_cv! : null, 1)}</div><div class="sub">{t('overview.nat2.kpi.cv.sub')}</div></div>
    <div class="card kpi"><div class="lab">{t('overview.nat2.kpi.cv', { level: 'TL3', year: cv3?.year ?? '—' })}</div><div class="big num">{fmtPct(cv3 ? 100 * cv3.rd_tl3_cv! : null, 1)}</div><div class="sub">{cv3 ? t('overview.nat2.kpi.cv.sub') : t('overview.nat2.kpi.cv.none')}</div></div>
  </div>

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

  <ChartCard title={t('overview.nat.title')} columns={lpCols} rows={lpRows} csvName="national_gdp_per_worker" note={t('overview.nat.note')}>
    {#snippet intro()}<p><Text k="overview.nat.intro" vars={{ country: name }} /></p>{/snippet}
    <PlotChart make={lpMake} height={280} label={t('overview.nat.title')} />
    <CountryLegend {countries} {colours} focus={iso3} {present} />
  </ChartCard>
</div>

<style>
  .wrap { overflow: auto; }
  tr.focus td { font-weight: 600; color: #c0392b; }
</style>
