<script lang="ts">
  // The Overview at the national level: the country's national productivity,
  // its growth and regional dispersion in the tiles, and every country's
  // national productivity.
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
  import NationalLpCard from '../../lib/components/cards/NationalLpCard.svelte';
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


  <NationalLpCard {iso3} {name} />
</div>

