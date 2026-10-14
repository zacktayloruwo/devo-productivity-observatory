<script lang="ts">
  // The Growth view: growth of GDP per capita split into the growth of GDP
  // per person employed and of persons employed per head, for the country in
  // view year by year and for every country over 2000 to the reference year.
  // National series, whatever the geography. Route: #/growth/<ISO3>
  import * as Plot from '@observablehq/plot';
  import { routeCountry } from '../lib/routeState';
  import { manifest, countryName } from '../lib/db/manifest.svelte';
  import { nationalAll, type NationalRow } from '../lib/db/queries';
  import { fmtUsd, fmtNum, fmtPct, fmtShort, poss } from '../lib/util/format';
  import { mean } from '../lib/util/stats';
  import { countryColours } from '../lib/countries';
  import { plotStyle, MARGIN, covidRect, yearAxis, yearTicks } from '../lib/charts/plot';
  import { countryLines } from '../lib/charts/countryLines';
  import ChartCard from '../lib/components/ChartCard.svelte';
  import PlotChart from '../lib/components/PlotChart.svelte';
  import CountryLegend from '../lib/components/CountryLegend.svelte';
  import Spinner from '../lib/components/Spinner.svelte';
  import Text from '../lib/components/Text.svelte';
  import { t } from '../lib/text/t';

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

  // ---- 2. growth decomposition: growth of GDP per capita (log points) =
  // growth of GDP per person employed + growth of persons employed per head
  const PARTS = [{ k: 'g_pw', label: 'GDP per person employed' }, { k: 'g_emp', label: 'Persons employed per head' }] as const;
  const PART_FILL = ['#4e79a7', '#f28e2b'];
  const decomp = $derived(nat.filter((r) => r.growth_gdp_pc != null && r.growth_gdp_pw != null)
    .map((r) => ({ cntry_iso3: r.cntry_iso3, year: r.year, g_pc: r.growth_gdp_pc!, g_pw: r.growth_gdp_pw!, g_emp: r.growth_gdp_pc! - r.growth_gdp_pw! })));
  const focusDecomp = $derived(decomp.filter((r) => r.cntry_iso3 === iso3));
  const decompLong = $derived(focusDecomp.flatMap((r) => PARTS.map((p) => ({ year: r.year, part: p.label, v: (r as any)[p.k] as number }))));
  const pctPts = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + fmtNum(v, 2));
  const decompMake = $derived((o: { width: number; tokens: any }) => {
    if (!focusDecomp.length) return null;
    const ys = focusDecomp.map((r) => r.year);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    return Plot.plot({ width: o.width, height: 300, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
      x: { ...yearAxis([lo - 0.5, hi + 0.5], yearTicks(lo, hi, hi - lo > 40 ? 10 : 5)), type: 'linear' }, y: { label: 'Annual growth (log points × 100)', grid: true },
      color: { domain: PARTS.map((p) => p.label), range: PART_FILL },
      marks: [
        ...covidRect(ys, o.tokens),
        Plot.rectY(decompLong, Plot.stackY({ x1: (d: any) => d.year - 0.4, x2: (d: any) => d.year + 0.4, y: 'v', fill: 'part', order: PARTS.map((p) => p.label) })),
        Plot.ruleY([0], { stroke: o.tokens['fg-2'] }),
        Plot.line(focusDecomp, { x: 'year', y: 'g_pc', stroke: o.tokens.fg, strokeWidth: 1.6 }),
        Plot.dot(focusDecomp, { x: 'year', y: 'g_pc', fill: o.tokens.fg, r: 2 }),
        Plot.tip(focusDecomp, Plot.pointerX({ x: 'year', y: 'g_pc', title: (d: any) => `${d.year}\nGDP per capita ${pctPts(d.g_pc)}\n  per person employed ${pctPts(d.g_pw)}\n  employed per head ${pctPts(d.g_emp)}` }))
      ] });
  });
  const decompCols = [{ key: 'cntry', label: 'Country', value: (r: any) => countryName(r.cntry_iso3) }, { key: 'year', label: 'Year', num: true },
    { key: 'g_pc', label: 'GDP per capita growth', num: true, render: (r: any) => pctPts(r.g_pc) }, { key: 'g_pw', label: 'from GDP per person employed', num: true, render: (r: any) => pctPts(r.g_pw) }, { key: 'g_emp', label: 'from persons employed per head', num: true, render: (r: any) => pctPts(r.g_emp) }];

  // the same decomposition as each country's mean over 2000 to the reference year
  const PERIOD = $derived([2000, refYear] as const);
  const decompAvg = $derived(countries.map((c) => {
    const rs = decomp.filter((r) => r.cntry_iso3 === c.iso3 && r.year > PERIOD[0] && r.year <= PERIOD[1]);
    if (!rs.length) return null;
    return { cntry_iso3: c.iso3, display: c.display, n: rs.length, g_pc: mean(rs.map((r) => r.g_pc)), g_pw: mean(rs.map((r) => r.g_pw)), g_emp: mean(rs.map((r) => r.g_emp)) };
  }).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => a.g_pc - b.g_pc));
  const avgLong = $derived(decompAvg.flatMap((r) => PARTS.map((p) => ({ display: r.display, cntry_iso3: r.cntry_iso3, part: p.label, v: (r as any)[p.k] as number }))));
  const avgMake = $derived((o: { width: number; tokens: any }) => {
    if (!decompAvg.length) return null;
    return Plot.plot({ width: o.width, height: 34 * decompAvg.length + 60, marginLeft: 120, marginRight: 30, style: plotStyle(o.tokens),
      x: { label: 'Mean annual growth (log points × 100)', grid: true }, y: { label: null, domain: decompAvg.map((r) => r.display) },
      color: { domain: PARTS.map((p) => p.label), range: PART_FILL },
      marks: [
        Plot.barX(avgLong, Plot.stackX({ x: 'v', y: 'display', fill: 'part', order: PARTS.map((p) => p.label), insetTop: 5, insetBottom: 5, fillOpacity: (d: any) => (d.cntry_iso3 === iso3 ? 1 : 0.55) })),
        Plot.ruleX([0], { stroke: o.tokens['fg-2'] }),
        Plot.dot(decompAvg, { x: 'g_pc', y: 'display', fill: o.tokens.fg, r: 3.5 }),
        Plot.tip(decompAvg, Plot.pointer({ x: 'g_pc', y: 'display', title: (d: any) => `${d.display}, ${PERIOD[0]}–${PERIOD[1]}\nGDP per capita ${pctPts(d.g_pc)} a year\n  per person employed ${pctPts(d.g_pw)}\n  employed per head ${pctPts(d.g_emp)}` }))
      ] });
  });
  const avgCols = [{ key: 'display', label: 'Country' }, { key: 'n', label: 'Years', num: true }, ...decompCols.slice(2)];
</script>

<div class="view">
  <header>
    <h1>{t('growth.title', { country: name })}</h1>
    <div class="sub">{t('growth.sub')}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <ChartCard title={t('productivity.nat.decomp.title', { country: name })} columns={decompCols} rows={focusDecomp} csvName={`${iso3}_growth_decomposition`} note={t('productivity.nat.decomp.note')}>
    {#snippet intro()}<p><Text k="productivity.nat.decomp.intro" vars={{ possessive: poss(name) }} /></p>{/snippet}
    {#if focusDecomp.length}
      <PlotChart make={decompMake} height={300} label={t('productivity.nat.decomp.title', { country: name })} />
      <div class="pleg">{#each PARTS as p, i (p.k)}<span class="it"><span class="sw" style:background={PART_FILL[i]}></span>{p.label}</span>{/each}<span class="it"><svg width="22" height="10"><line x1="1" y1="5" x2="21" y2="5" stroke="currentColor" stroke-width="1.6" /></svg>{t('productivity.nat.decomp.total')}</span></div>
    {:else if !loading}
      <p class="muted">{t('productivity.nat.decomp.none', { country: name })}</p>
    {/if}
  </ChartCard>

  <ChartCard title={t('productivity.nat.avg.title', { first: PERIOD[0], last: PERIOD[1] })} columns={avgCols} rows={decompAvg} csvName={`growth_decomposition_${PERIOD[0]}_${PERIOD[1]}`}>
    {#snippet intro()}<p><Text k="productivity.nat.avg.intro" vars={{ first: PERIOD[0], last: PERIOD[1], country: name }} /></p>{/snippet}
    <PlotChart make={avgMake} height={34 * Math.max(1, decompAvg.length) + 60} label={t('productivity.nat.avg.title', { first: PERIOD[0], last: PERIOD[1] })} />
  </ChartCard>

</div>

<style>
  .pleg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--fg-2); }
  .it { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
</style>
