<script lang="ts">
  // The Overview at TL2 or TL3: how many regions, the median and spread of
  // their labour productivity, and the gap to the country's frontier region.
  // Route: #/overview/<ISO3>?geo=tl2|tl3
  import { fromFirstYear } from '../../lib/charts/plot';
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName, countryOf, levelHasCountry } from '../../lib/db/manifest.svelte';
  import { regionsCountry, regionsByCountryYear, type RegionRow, type RegionCountryYear } from '../../lib/db/queries';
  import { fmtInt, fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../../lib/util/format';
  import { median, quantile, mean } from '../../lib/util/stats';
  import { countryColours } from '../../lib/countries';
  import { countryLines } from '../../lib/charts/countryLines';
  import ChartCard from '../../lib/components/ChartCard.svelte';
  import PlotChart from '../../lib/components/PlotChart.svelte';
  import CountryLegend from '../../lib/components/CountryLegend.svelte';
  import Spinner from '../../lib/components/Spinner.svelte';
  import Text from '../../lib/components/Text.svelte';
  import NationalLpCard from '../../lib/components/cards/NationalLpCard.svelte';
  import { t } from '../../lib/text/t';

  let { level }: { level: 'tl2' | 'tl3' } = $props();
  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const refYear = $derived(manifest.refYear);
  const countries = $derived(manifest.countries);
  const colours = $derived(countryColours(countries, iso3, '#c0392b'));
  const levelName = $derived(t('geo.' + level));
  const missing = $derived(!levelHasCountry(level, iso3));

  let regs = $state<RegionRow[]>([]);
  let byCY = $state<RegionCountryYear[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const c = iso3, lv = level; const my = ++token;
    if (!countries.length) return;
    loading = true; error = '';
    Promise.all([missing ? Promise.resolve([]) : regionsCountry(lv, c), regionsByCountryYear(lv)]).then(([r, b]) => { if (my !== token) return; regs = r; byCY = b; loading = false; })
      .catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  // regions with labour productivity, and the years they cover
  const lp = $derived(regs.filter((r) => r.lp_lpr != null));
  const nRegions = $derived(new Set(regs.map((r) => r.reg_id)).size);
  const lpYears = $derived([...new Set(lp.map((r) => r.year))].sort((a, b) => a - b));
  const latestYear = $derived(lpYears.length ? lpYears[lpYears.length - 1] : null);

  function stats(y: number) {
    const rs = lp.filter((r) => r.year === y);
    const v = rs.map((r) => r.lp_lpr!);
    if (!v.length) return { year: y, n: null, med: null, p10: null, p90: null, ratio: null, cov: null, gap: null, frontier: null as RegionRow | null };
    const m = mean(v);
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)) : null;
    const gaps = rs.map((r) => r.lp_gap_frontier_pct).filter((g): g is number => g != null);
    const p10 = quantile(v, 0.1), p90 = quantile(v, 0.9);
    return { year: y, n: v.length, med: median(v), p10, p90, ratio: p10 > 0 ? p90 / p10 : null, cov: sd != null ? (100 * sd) / m : null, gap: gaps.length ? median(gaps) : null,
      frontier: rs.reduce((a, b) => (a.lp_lpr! >= b.lp_lpr! ? a : b)) };
  }
  // the year shown in the tiles: the reference year, else the latest
  const kpiYear = $derived(lpYears.includes(refYear) ? refYear : latestYear);
  const ref = $derived(kpiYear != null ? stats(kpiYear) : null);
  const years = $derived.by(() => {
    if (!lpYears.length) return [];
    const ys = new Set<number>([lpYears[0], refYear]);
    for (const y of [2009, 2014]) if (y > lpYears[0]) ys.add(y);
    if (latestYear) ys.add(latestYear);
    return [...ys].filter((y) => lpYears.includes(y)).sort((a, b) => a - b);
  });
  const table = $derived(years.map((y) => ({ label: y === latestYear ? t('overview.table.latest', { year: y }) : String(y), ...stats(y) })));
  const measures = [
    { key: 'n', label: t('overview.reg.measure.n'), f: fmtInt },
    { key: 'med', label: t('overview.reg.measure.median'), f: fmtUsd },
    { key: 'p10', label: t('overview.reg.measure.p10'), f: fmtUsd },
    { key: 'p90', label: t('overview.reg.measure.p90'), f: fmtUsd },
    { key: 'ratio', label: t('overview.reg.measure.ratio'), f: (v: number | null) => fmtNum(v, 2) },
    { key: 'cov', label: t('overview.reg.measure.cov'), f: (v: number | null) => fmtPct(v, 1) },
    { key: 'gap', label: t('overview.reg.measure.gap'), f: (v: number | null) => fmtPct(v, 1) }
  ] as const;
  const tableCols = [{ key: 'year', label: 'Year', num: true }, ...measures.map((m) => ({ key: m.key, label: m.label, num: true, render: (r: any) => m.f(r[m.key]) })),
    { key: 'frontier', label: t('overview.reg.measure.frontier'), value: (r: any) => r.frontier?.reg_name ?? r.frontier?.reg_id ?? '' }];

  // across countries: the median gap to the frontier region, and P90/P10
  const gapRows = $derived(fromFirstYear(byCY).filter((r) => r.gap_med != null));
  const ratioRows = $derived(fromFirstYear(byCY).filter((r) => r.p10 != null && r.p10 > 0 && r.n >= 3).map((r) => ({ ...r, ratio: r.p90! / r.p10! })));
  const gapMake = $derived((o: { width: number; tokens: any }) => countryLines<RegionCountryYear>({ rows: gapRows, x: (d) => d.year, y: (d) => d.gap_med, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 280, yLabel: 'Median gap to the frontier region (%)', yFormat: (v) => fmtNum(v, 0) + '%', covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nMedian gap ${fmtPct(d.gap_med, 1)} over ${d.n} regions` }));
  const ratioMake = $derived((o: { width: number; tokens: any }) => countryLines<any>({ rows: ratioRows, x: (d) => d.year, y: (d) => d.ratio, iso: (d) => d.cntry_iso3, countries, colours, focus: iso3, tokens: o.tokens, width: o.width, height: 280, yLabel: 'P90/P10 ratio of regional productivity', yFormat: (v) => fmtNum(v, 1), covid: true, title: (d) => `${countryName(d.cntry_iso3)} ${d.year}\nP90 ${fmtUsd(d.p90)} / P10 ${fmtUsd(d.p10)} = ${fmtNum(d.ratio, 2)}` }));
  const cyCols = [{ key: 'cntry', label: 'Country', value: (r: any) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'Regions', num: true },
    { key: 'p10', label: '10th percentile', num: true, render: (r: any) => fmtUsd(r.p10) }, { key: 'p50', label: 'Median', num: true, render: (r: any) => fmtUsd(r.p50) }, { key: 'p90', label: '90th percentile', num: true, render: (r: any) => fmtUsd(r.p90) },
    { key: 'gap_med', label: 'Median gap to frontier (%)', num: true, render: (r: any) => fmtNum(r.gap_med, 1) }];
  const present = $derived(new Set(byCY.map((r) => r.cntry_iso3)));
</script>

<div class="view">
  <header>
    <h1>{name}</h1>
    <div class="sub">{t('overview.reg.sub', { region: countryOf(iso3)?.region ?? '', n: nRegions, level: levelName })}{#if lpYears.length}, {t('overview.sub.years', { first: lpYears[0], last: lpYears[lpYears.length - 1] })}{/if}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="card prose">
    <h3>{t('overview.reading.title')}</h3>
    <div>
      <p><Text k="overview.reading.1" vars={{ possessive: poss(name) }} /></p>
      <p><Text k="overview.reading.2" /></p>
    </div>
  </div>

  {#if missing}
    <div class="card prose"><p>{t('level.missing', { level: levelName, country: name })}</p></div>
  {:else}
    <div class="strip">
      <div class="card kpi"><div class="lab">{t('overview.reg.kpi.n', { year: kpiYear ?? '—', level: levelName })}</div><div class="big num">{fmtInt(ref?.n)}</div><div class="sub">{t('overview.reg.kpi.n.sub', { n: nRegions, country: name })}</div></div>
      <div class="card kpi"><div class="lab">{t('overview.reg.kpi.median', { year: kpiYear ?? '—' })}</div><div class="big num">{fmtUsd(ref?.med)}</div><div class="sub">{t('overview.reg.kpi.median.sub')}</div></div>
      <div class="card kpi"><div class="lab">{t('overview.reg.kpi.spread', { year: kpiYear ?? '—' })}</div><div class="big num">{fmtNum(ref?.ratio, 2)}</div><div class="sub">{t('overview.reg.kpi.spread.sub', { cov: fmtPct(ref?.cov, 1) })}</div></div>
      <div class="card kpi"><div class="lab">{t('overview.reg.kpi.gap', { year: kpiYear ?? '—' })}</div><div class="big num">{fmtPct(ref?.gap, 1)}</div><div class="sub">{t('overview.reg.kpi.gap.sub', { frontier: ref?.frontier?.reg_name ?? '—', value: '$' + fmtShort(ref?.frontier?.lp_lpr) })}</div></div>
    </div>
  {/if}

  <NationalLpCard {iso3} {name} />
</div>

