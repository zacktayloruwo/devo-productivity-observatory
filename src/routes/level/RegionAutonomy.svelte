<script lang="ts">
  // Autonomy at TL2 or TL3: the region-specific Local Autonomy Index and
  // Regional Authority Index over time. Every region of the country is drawn
  // faint, the median dashed, and one selected region (?reg=) in red.
  // Route: #/autonomy/<ISO3>?geo=tl2|tl3&reg=<region id>
  import * as Plot from '@observablehq/plot';
  import { route, href, setQuery } from '../../lib/router.svelte';
  import { routeCountry } from '../../lib/routeState';
  import { manifest, countryName, levelHasCountry } from '../../lib/db/manifest.svelte';
  import { regionsCountry, type RegionRow } from '../../lib/db/queries';
  import { fmtNum } from '../../lib/util/format';
  import { median } from '../../lib/util/stats';
  import { downloadCsv } from '../../lib/util/csv';
  import { plotStyle, MARGIN, yearAxis, yearTicks, fromFirstYear } from '../../lib/charts/plot';
  import ChartCard from '../../lib/components/ChartCard.svelte';
  import PlotChart from '../../lib/components/PlotChart.svelte';
  import Spinner from '../../lib/components/Spinner.svelte';
  import Text from '../../lib/components/Text.svelte';
  import { t } from '../../lib/text/t';

  let { level }: { level: 'tl2' | 'tl3' } = $props();
  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const levelName = $derived(t('geo.' + level));
  const missing = $derived(!levelHasCountry(level, iso3));
  const FOCAL = '#c0392b';

  let regs = $state<RegionRow[]>([]);
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const c = iso3, lv = level; const my = ++token;
    if (!manifest.countries.length || missing) { regs = []; loading = false; return; }
    loading = true; error = '';
    regionsCountry(lv, c).then((r) => { if (my === token) { regs = r; loading = false; } })
      .catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  // the index rows: years with LAI or RAI
  const rows = $derived(fromFirstYear(regs.filter((r) => r.lai_total_reg != null || r.rai_total_reg != null)));
  // regions by name; the selected region is ?reg=, else the most populous
  const regions = $derived.by(() => {
    const m = new Map<string, { id: string; name: string; pop: number }>();
    for (const r of regs) { const p = r.pop_total ?? 0; const cur = m.get(r.reg_id); if (!cur) m.set(r.reg_id, { id: r.reg_id, name: r.reg_name ?? r.reg_id, pop: p }); else if (p > cur.pop) cur.pop = p; }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  const selected = $derived.by(() => {
    const q = route.query.reg;
    if (q && regions.some((r) => r.id === q)) return q;
    // the default prefers a region LAI codes (not Berlin, Bremen or Hamburg)
    const coded = new Set(rows.filter((r) => r.lai_total_reg != null).map((r) => r.reg_id));
    const pool = regions.some((r) => coded.has(r.id)) ? regions.filter((r) => coded.has(r.id)) : regions;
    return pool.length ? pool.reduce((a, b) => (a.pop >= b.pop ? a : b)).id : '';
  });
  const selName = $derived(regions.find((r) => r.id === selected)?.name ?? '');
  const pick = (e: Event) => setQuery({ reg: (e.target as HTMLSelectElement).value });

  type Key = 'lai_total_reg' | 'lai_fiscal_reg' | 'rai_total_reg' | 'rai_fiscalautonomy_reg';
  // titles and passages are filled here so text_compile.mjs sees every key
  const INDICES = $derived<{ key: Key; title: string; intro: string; note: string; label: string; digits: number }[]>([
    { key: 'lai_total_reg', title: t('autonomy.reg.lai.title', { level: levelName }), intro: t('autonomy.reg.lai.intro', { level: levelName }), note: t('autonomy.reg.lai.note'), label: 'LAI, region-specific (0–1)', digits: 2 },
    { key: 'rai_total_reg', title: t('autonomy.reg.rai.title', { level: levelName }), intro: t('autonomy.reg.rai.intro', { level: levelName }), note: t('autonomy.reg.rai.note'), label: 'RAI, region-specific (points)', digits: 1 },
    { key: 'lai_fiscal_reg', title: t('autonomy.reg.lai_fiscal.title', { level: levelName }), intro: t('autonomy.reg.lai_fiscal.intro', { level: levelName }), note: t('autonomy.reg.lai.note'), label: 'LAI fiscal, region-specific (0–1)', digits: 2 },
    { key: 'rai_fiscalautonomy_reg', title: t('autonomy.reg.rai_fiscal.title', { level: levelName }), intro: t('autonomy.reg.rai_fiscal.intro', { level: levelName }), note: t('autonomy.reg.rai.note'), label: 'RAI fiscal autonomy, region-specific (points)', digits: 1 }
  ]);

  // per index and year: the selected region's value and the median, minimum
  // and maximum across the country's regions (the table twin)
  function summary(key: Key) {
    const years = [...new Set(rows.filter((r) => r[key] != null).map((r) => r.year))].sort((a, b) => a - b);
    return years.map((y) => {
      const v = rows.filter((r) => r.year === y && r[key] != null).map((r) => r[key]!);
      const s = rows.find((r) => r.year === y && r.reg_id === selected);
      return { year: y, region: selName, value: s?.[key] ?? null, median: median(v), min: Math.min(...v), max: Math.max(...v), n: v.length };
    });
  }
  const summaries = $derived(Object.fromEntries(INDICES.map((ix) => [ix.key, summary(ix.key)])) as Record<Key, ReturnType<typeof summary>>);
  type Index = (typeof INDICES)[number];
  const colsFor = (ix: Index) => [{ key: 'year', label: 'Year', num: true }, { key: 'region', label: 'Region' },
    { key: 'value', label: ix.label, num: true, render: (r: any) => fmtNum(r.value, ix.digits) },
    { key: 'median', label: 'Median across regions', num: true, render: (r: any) => fmtNum(r.median, ix.digits) },
    { key: 'min', label: 'Lowest', num: true, render: (r: any) => fmtNum(r.min, ix.digits) }, { key: 'max', label: 'Highest', num: true, render: (r: any) => fmtNum(r.max, ix.digits) },
    { key: 'n', label: 'Regions', num: true }];

  function make(ix: Index) {
    return (o: { width: number; tokens: any }) => {
      const data = rows.filter((r) => r[ix.key] != null);
      if (!data.length) return null;
      const ys = data.map((r) => r.year);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const sel = data.filter((r) => r.reg_id === selected);
      const med = summaries[ix.key];
      return Plot.plot({ width: o.width, height: 280, marginLeft: MARGIN.left, marginRight: MARGIN.right, style: plotStyle(o.tokens),
        x: yearAxis([lo, hi], yearTicks(lo, hi, 5)), y: { label: ix.label, grid: true, tickFormat: (v: number) => fmtNum(v, ix.digits === 2 ? 1 : 0), domain: ix.key.startsWith('lai') ? [0, 1] : undefined },
        marks: [
          Plot.line(data, { x: 'year', y: ix.key, z: 'reg_id', stroke: o.tokens['fg-3'], strokeWidth: 0.8, strokeOpacity: 0.45, curve: 'step-after' }),
          Plot.line(med, { x: 'year', y: 'median', stroke: o.tokens.fg, strokeDasharray: '5 4', strokeWidth: 1.4, curve: 'step-after' }),
          Plot.line(sel, { x: 'year', y: ix.key, stroke: FOCAL, strokeWidth: 2.8, curve: 'step-after' }),
          Plot.tip(data, Plot.pointer({ x: 'year', y: ix.key, title: (d: RegionRow) => `${d.reg_name ?? d.reg_id} ${d.year}\n${ix.label}: ${fmtNum(d[ix.key], ix.digits + 1)}` }))
        ] });
    };
  }
  const makers = $derived(Object.fromEntries(INDICES.map((ix) => [ix.key, make(ix)])) as Record<Key, ReturnType<typeof make>>);

  // the latest year of each index for the tiles and the map link
  const lastYear = (key: Key) => { const s = summaries[key]; return s.length ? s[s.length - 1] : null; };
  const mapHref = (key: Key) => { const l = lastYear(key); return href(['map', iso3, String(l?.year ?? '')], { geo: level, var: key, sel: selected || undefined }); };
  const uniformLai = $derived.by(() => { const l = lastYear('lai_total_reg'); return !!l && l.n > 1 && l.min === l.max; });

  const allCols = [{ key: 'reg_id', label: 'Region code' }, { key: 'reg_name', label: 'Region' }, { key: 'year', label: 'Year' },
    ...(['lai_total_reg', 'lai_fiscal_reg', 'lai_policy_reg', 'rai_total_reg', 'rai_selfrule_reg', 'rai_sharedrule_reg', 'rai_fiscalautonomy_reg'] as const).map((k) => ({ key: k, label: k }))];
</script>

<div class="view">
  <header class="hd">
    <div>
      <h1>{t('autonomy.title', { country: name })}</h1>
      <div class="sub">{t('autonomy.reg.sub', { level: levelName })}{#if loading} · <Spinner size={12} />{/if}</div>
      {#if error}<div class="err">{error}</div>{/if}
    </div>
  </header>

  {#if missing}
    <div class="card prose"><p>{t('level.missing', { level: levelName, country: name })}</p></div>
  {:else}
    <div class="strip">
      {#each INDICES as ix (ix.key)}
        {@const l = lastYear(ix.key)}
        <div class="card kpi"><div class="lab">{t('autonomy.reg.kpi', { index: ix.label.split(',')[0], year: l?.year ?? '—' })}</div><div class="big num">{fmtNum(l?.value, ix.digits)}</div><div class="sub">{t('autonomy.reg.kpi.sub', { region: selName, median: fmtNum(l?.median, ix.digits) })}</div></div>
      {/each}
    </div>

    <div class="card prose">
      <p><Text k="autonomy.reg.reading" vars={{ level: levelName, country: name }} />{#if uniformLai}{' '}{t('autonomy.reg.uniform', { country: name })}{/if}</p>
      <p><button type="button" class="lnk" onclick={() => downloadCsv(`${iso3}_${level}_autonomy`, allCols, rows)}>{t('autonomy.reg.csv_all', { level: levelName })}</button></p>
    </div>

    <div class="two">
      {#each INDICES as ix (ix.key)}
        <ChartCard title={ix.title} columns={colsFor(ix)} rows={summaries[ix.key]} csvName={`${iso3}_${level}_${ix.key}_${selected}`} note={ix.note}>
          {#snippet extra()}
            {#if regions.length}
              <label class="pick">
                <span class="muted">{t('autonomy.reg.pick')}</span>
                <select value={selected} onchange={pick} aria-label={t('autonomy.reg.pick')}>
                  {#each regions as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
                </select>
              </label>
            {/if}
            <a class="maplink" href={mapHref(ix.key)}>{t('autonomy.reg.on_map')}</a>
          {/snippet}
          {#snippet intro()}<p>{ix.intro}</p>{/snippet}
          {#if summaries[ix.key].length}
            <PlotChart make={makers[ix.key]} height={280} label={ix.title} />
            <div class="pleg">
              <span class="it"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" stroke={FOCAL} stroke-width="2.8" /></svg>{selName}</span>
              <span class="it"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" /></svg>{t('autonomy.reg.median')}</span>
              <span class="it faint"><svg width="28" height="10"><line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" stroke-width="0.8" /></svg>{t('autonomy.reg.others', { level: levelName })}</span>
            </div>
          {:else if !loading}
            <p class="muted">{t('autonomy.reg.none', { country: name })}</p>
          {/if}
        </ChartCard>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hd { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .hd > div { flex: 1; }
  .pick { display: flex; align-items: center; gap: 8px; }
  .pick { font-size: 12px; }
  .pick select { max-width: 220px; min-height: 28px; padding: 2px 6px; font-size: 12px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 1100px) { .two { grid-template-columns: 1fr; } }
  .pleg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--fg-2); }
  .it { display: inline-flex; align-items: center; gap: 6px; }
  .maplink { font-size: 12px; }
  .lnk { border: 0; background: transparent; padding: 0; min-height: 0; font-size: 13px; color: var(--accent); }
  .lnk:hover { text-decoration: underline; background: transparent; }
</style>
