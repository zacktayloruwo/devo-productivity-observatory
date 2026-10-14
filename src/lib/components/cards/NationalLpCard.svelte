<script lang="ts">
  // National labour productivity (GDP per person employed), every country,
  // the country in view in red. Shared by the Overview at every geography.
  import { manifest, countryName } from '../../db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../../db/queries';
  import { fmtUsd, fmtShort } from '../../util/format';
  import { countryColours } from '../../countries';
  import { countryLines } from '../../charts/countryLines';
  import ChartCard from '../ChartCard.svelte';
  import PlotChart from '../PlotChart.svelte';
  import CountryLegend from '../CountryLegend.svelte';
  import Text from '../Text.svelte';
  import { t } from '../../text/t';

  let { iso3, name }: { iso3: string; name: string } = $props();
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));
  let nat = $state<NationalRow[]>([]);
  $effect(() => { if (countries.length) nationalAll().then((n) => { nat = n; }).catch(() => {}); });
  const rows = $derived(nat.filter((r) => r.gdp_pw != null));
  const make = $derived((o: { width: number; tokens: any }) => countryLines<NationalRow>({ rows, x: (d) => d.year, y: (d) => d.gdp_pw, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 280, yLabel: 'GDP per person employed (USD PPP)', yFormat: (v) => '$' + fmtShort(v), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\n${fmtUsd(d.gdp_pw)} per person employed` }));
  const cols = [{ key: 'cntry', label: 'Country', value: (r: NationalRow) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'gdp_pw', label: 'GDP per person employed (USD PPP)', num: true, render: (r: NationalRow) => fmtUsd(r.gdp_pw) }];
  const present = $derived(new Set(rows.map((r) => r.cntry_iso3)));
</script>

<ChartCard title={t('overview.nat.title')} columns={cols} {rows} csvName="national_gdp_per_worker" note={t('overview.nat.note')}>
  {#snippet intro()}<p><Text k="overview.nat.intro" vars={{ country: name }} /></p>{/snippet}
  <PlotChart {make} height={280} label={t('overview.nat.title')} />
  <CountryLegend {countries} {colours} focus={iso3} {present} />
</ChartCard>
