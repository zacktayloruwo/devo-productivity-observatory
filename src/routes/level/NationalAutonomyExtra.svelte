<script lang="ts">
  // Autonomy at the national level, below the LAI and RAI charts: the three
  // decentralization dimension indices and the IMF and OECD fiscal ratios,
  // every country, from national.parquet.
  import { fromFirstYear } from '../../lib/charts/plot';
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName } from '../../lib/db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../../lib/db/queries';
  import { fmtNum } from '../../lib/util/format';
  import { countryColours } from '../../lib/countries';
  import { countryLines } from '../../lib/charts/countryLines';
  import ChartCard from '../../lib/components/ChartCard.svelte';
  import PlotChart from '../../lib/components/PlotChart.svelte';
  import CountryLegend from '../../lib/components/CountryLegend.svelte';
  import Text from '../../lib/components/Text.svelte';
  import { t } from '../../lib/text/t';

  const iso3 = $derived(routeCountry());
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));

  let nat = $state<NationalRow[]>([]);
  let error = $state('');
  $effect(() => {
    if (!countries.length) return;
    nationalAll().then((n) => { nat = fromFirstYear(n); }).catch((e) => { error = e?.message ?? String(e); });
  });

  type Series = { key: string; short: string; label: string; pct: boolean };
  const DIMS: Series[] = [
    { key: 'fiscal_dec_dj_z', short: 'Fiscal', label: 'Fiscal decentralization (z-score)', pct: false },
    { key: 'administrative_dec_z', short: 'Administrative', label: 'Administrative decentralization (z-score)', pct: false },
    { key: 'political_dec_z', short: 'Political', label: 'Political decentralization (z-score)', pct: false }
  ];
  const RATIOS: Series[] = [
    { key: 'imf_sd_sng', short: 'Expenditure', label: 'Subnational share of general government expenditure (%)', pct: true },
    { key: 'imf_rd_sng', short: 'Revenue', label: 'Subnational share of general government revenue (%)', pct: true },
    { key: 'imf_taxd_sng', short: 'Tax revenue', label: 'Subnational share of general government tax revenue (%)', pct: true },
    { key: 'ta_ab_share_scg', short: 'Tax autonomy', label: 'Subnational tax revenue over which subnational governments have discretion (%)', pct: true }
  ];
  let dim = $state(DIMS[0].key);
  let ratio = $state(RATIOS[0].key);
  const fmt = (s: Series, v: number | null) => (v == null ? '—' : s.pct ? fmtNum(v, 1) + '%' : fmtNum(v, 2));

  const make = (s: Series) => (o: { width: number; tokens: any }) =>
    countryLines<NationalRow>({ rows: nat, x: (d) => d.year, y: (d) => d[s.key], iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 300, yLabel: s.label, yFormat: (v) => (s.pct ? fmtNum(v, 0) + '%' : fmtNum(v, 1)), title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${s.short} ${fmt(s, d[s.key])}` });
  const dimSeries = $derived(DIMS.find((d) => d.key === dim)!);
  const ratioSeries = $derived(RATIOS.find((d) => d.key === ratio)!);
  const dimMake = $derived(make(dimSeries));
  const ratioMake = $derived(make(ratioSeries));

  const cols = (list: Series[]) => [{ key: 'cntry', label: 'Country', value: (r: NationalRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    ...list.map((s) => ({ key: s.key, label: s.label, num: true, render: (r: NationalRow) => fmt(s, r[s.key]) }))];
  const dimRows = $derived(nat.filter((r) => DIMS.some((s) => r[s.key] != null)));
  const ratioRows = $derived(nat.filter((r) => RATIOS.some((s) => r[s.key] != null)));
  const presentOf = (key: string) => new Set(nat.filter((r) => r[key] != null).map((r) => r.cntry_iso3));
  const dimPresent = $derived(presentOf(dim));
  const ratioPresent = $derived(presentOf(ratio));
</script>

{#if error}<div class="err">{error}</div>{/if}

<ChartCard title={t('autonomy.nat.dims.title')} columns={cols(DIMS)} rows={dimRows} csvName="decentralization_dimensions" note={t('autonomy.nat.dims.note')}>
  {#snippet extra()}
    <div class="seg" role="group" aria-label={t('autonomy.nat.dims.title')}>
      {#each DIMS as s (s.key)}<button type="button" aria-pressed={dim === s.key} onclick={() => (dim = s.key)}>{s.short}</button>{/each}
    </div>
  {/snippet}
  {#snippet intro()}<p><Text k="autonomy.nat.dims.intro" /></p>{/snippet}
  <PlotChart make={dimMake} height={300} label={dimSeries.label} />
  <CountryLegend {countries} {colours} focus={iso3} present={dimPresent} />
</ChartCard>

<ChartCard title={t('autonomy.nat.fiscal.title')} columns={cols(RATIOS)} rows={ratioRows} csvName="fiscal_decentralization_ratios" note={t('autonomy.nat.fiscal.note')}>
  {#snippet extra()}
    <div class="seg" role="group" aria-label={t('autonomy.nat.fiscal.title')}>
      {#each RATIOS as s (s.key)}<button type="button" aria-pressed={ratio === s.key} onclick={() => (ratio = s.key)}>{s.short}</button>{/each}
    </div>
  {/snippet}
  {#snippet intro()}<p><Text k="autonomy.nat.fiscal.intro" /></p>{/snippet}
  <PlotChart make={ratioMake} height={300} label={ratioSeries.label} />
  <CountryLegend {countries} {colours} focus={iso3} present={ratioPresent} />
</ChartCard>
