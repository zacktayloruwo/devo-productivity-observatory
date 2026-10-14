<script lang="ts">
  // The distribution of labour productivity across a country's FUAs or
  // regions, every country, each in its own latest year: box from the 25th to
  // the 75th percentile, median, mean, every unit as a point.
  import * as Plot from '@observablehq/plot';
  import { manifest, countryName } from '../../db/manifest.svelte';
  import { unitsLatestAll, type UnitRow, type UnitLevel } from '../../db/queries';
  import { fmtUsd, fmtShort } from '../../util/format';
  import { mean, median, quantile } from '../../util/stats';
  import { plotStyle } from '../../charts/plot';
  import ChartCard from '../ChartCard.svelte';
  import PlotChart from '../PlotChart.svelte';
  import Text from '../Text.svelte';
  import { t } from '../../text/t';

  let { level, iso3 }: { level: UnitLevel; iso3: string } = $props();
  const FOCAL = '#c0392b';
  const fua = $derived(level === 'fua');
  const levelName = $derived(t('geo.' + level));
  const countries = $derived(manifest.countries);
  let latest = $state<UnitRow[]>([]);
  let token = 0;
  $effect(() => { const lv = level; const my = ++token; if (countries.length) unitsLatestAll(lv).then((l) => { if (my === token) latest = l; }).catch(() => {}); });

  const dist = $derived.by(() => {
    const stats = countries.map((c) => {
      const v = latest.filter((r) => r.cntry_iso3 === c.iso3).map((r) => r.lp!);
      if (!v.length) return null;
      return { cntry_iso3: c.iso3, display: c.display, n: v.length, year: latest.find((r) => r.cntry_iso3 === c.iso3)!.year, q1: quantile(v, 0.25), med: median(v), q3: quantile(v, 0.75), mean: mean(v), min: Math.min(...v), max: Math.max(...v) };
    }).filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => a.med - b.med);
    const idx = new Map(stats.map((s, i) => [s.cntry_iso3, i]));
    // a fixed pseudo-random jitter per unit so the figure is stable
    const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
    const pts = latest.filter((r) => idx.has(r.cntry_iso3)).map((r) => ({ ...r, yj: idx.get(r.cntry_iso3)! + (hash(r.id) - 0.5) * 0.4 }));
    return { stats: stats.map((s, i) => ({ ...s, i })), pts };
  });
  const make = $derived((o: { width: number; tokens: any }) => {
    const { stats, pts } = dist;
    if (!stats.length) return null;
    return Plot.plot({ width: o.width, height: 50 * stats.length + 60, marginLeft: 120, marginRight: 30, style: plotStyle(o.tokens),
      x: { label: 'Labour productivity (USD PPP per worker)', tickFormat: (d: number) => '$' + fmtShort(d), grid: true },
      y: { domain: [-0.6, stats.length - 0.4], ticks: stats.map((s) => s.i), tickFormat: (i: number) => stats[i] ? `${stats[i].display} (N = ${stats[i].n})` : '', label: null },
      marks: [
        Plot.dot(pts, { x: 'lp', y: 'yj', r: 2.5, fill: (d: any) => (d.cntry_iso3 === iso3 ? FOCAL : o.tokens['fg-3']), fillOpacity: 0.45 }),
        Plot.rect(stats, { x1: 'q1', x2: 'q3', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens['fg-2'], fill: 'none', strokeWidth: 1.2 }),
        Plot.ruleX(stats, { x: 'med', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens['fg-2'], strokeWidth: 2 }),
        Plot.ruleX(stats, { x: 'mean', y1: (d: any) => d.i - 0.25, y2: (d: any) => d.i + 0.25, stroke: o.tokens.fg, strokeDasharray: '4 3', strokeWidth: 1.2 }),
        Plot.tip(pts, Plot.pointer({ x: 'lp', y: 'yj', title: (d: any) => `${d.name} (${countryName(d.cntry_iso3)}, ${d.year})\n${fmtUsd(d.lp)}` }))
      ] });
  });
  const cols = [{ key: 'display', label: 'Country' }, { key: 'year', label: 'Year', num: true }, { key: 'n', label: 'N', num: true }, { key: 'min', label: 'Min', num: true, render: (r: any) => fmtUsd(r.min) }, { key: 'q1', label: '25th', num: true, render: (r: any) => fmtUsd(r.q1) }, { key: 'med', label: 'Median', num: true, render: (r: any) => fmtUsd(r.med) }, { key: 'mean', label: 'Mean', num: true, render: (r: any) => fmtUsd(r.mean) }, { key: 'q3', label: '75th', num: true, render: (r: any) => fmtUsd(r.q3) }, { key: 'max', label: 'Max', num: true, render: (r: any) => fmtUsd(r.max) }];
  const title = $derived(t(fua ? 'productivity.dist.title' : 'productivity.reg.dist.title', { level: levelName }));
</script>

<ChartCard {title} columns={cols} rows={dist.stats} csvName={`productivity_distribution${fua ? '' : '_' + level}`} note={t('productivity.dist.note')}>
  {#snippet intro()}<p><Text k={fua ? 'productivity.dist.intro' : 'productivity.reg.dist.intro'} vars={{ level: levelName }} /></p>{/snippet}
  <PlotChart {make} height={50 * Math.max(1, dist.stats.length) + 60} label={title} />
</ChartCard>
