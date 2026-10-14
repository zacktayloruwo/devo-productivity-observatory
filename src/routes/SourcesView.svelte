<script lang="ts">
  // The Sources view: every source behind the figures, with the years each
  // is available for the selected country, and full citations.
  // Route: #/sources/<ISO3>
  import { routeCountry } from '../lib/routeState';
  import { manifest, countryName } from '../lib/db/manifest.svelte';
  import { sourcesAll, coverageFor, fuaCountry, type SourceRow, type Coverage } from '../lib/db/queries';
  import { fmtInt } from '../lib/util/format';
  import Spinner from '../lib/components/Spinner.svelte';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));

  let sources = $state<SourceRow[]>([]);
  let coverage = $state<Coverage[]>([]);
  let popSrc = $state<Map<string, number>>(new Map());
  let loading = $state(true);
  let error = $state('');
  let token = 0;
  $effect(() => {
    const c = iso3; const my = ++token;
    if (!manifest.countries.length) return;
    loading = true;
    Promise.all([sourcesAll(), coverageFor(c), fuaCountry(c)]).then(([s, cv, f]) => {
      if (my !== token) return;
      sources = s; coverage = cv; loading = false;
      const m = new Map<string, number>();
      for (const r of f) if (r.pop != null) { const k = r.pop_source || 'observed'; m.set(k, (m.get(k) ?? 0) + 1); }
      popSrc = m;
    }).catch((e) => { if (my === token) { error = e?.message ?? String(e); loading = false; } });
  });

  const span = (lo: number | null | undefined, hi: number | null | undefined) => lo == null ? 'n/a' : lo === hi ? String(lo) : `${lo}–${hi}`;
  const cov = (col: string) => coverage.find((c) => c.col === col);

  // one row per dataflow; several indicators can share one
  const flows = $derived.by(() => {
    const m = new Map<string, { flow_name: string; collection: string; description: string; agency: string; flow: string; version: string; retrieved_on: string; url: string; labels: string[]; cols: string[] }>();
    for (const s of sources) {
      const key = `${s.agency},${s.flow},${s.version}`;
      const e = m.get(key) ?? { flow_name: s.flow_name, collection: s.collection, description: s.description, agency: s.agency, flow: s.flow, version: s.version, retrieved_on: s.retrieved_on, url: s.url, labels: [], cols: [] };
      e.labels.push((s.label ?? s.series).replace(/^FUA (.)/, (_, c) => c.toUpperCase())); e.cols.push(s.value_col);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => a.flow_name.localeCompare(b.flow_name)).map((f) => {
      const cs = f.cols.map(cov).filter((c): c is Coverage => !!c && c.first_year != null);
      return { ...f, first: cs.length ? Math.min(...cs.map((c) => c.first_year!)) : null, last: cs.length ? Math.max(...cs.map((c) => c.last_year!)) : null };
    });
  });
  const retrieved = $derived(sources[0]?.retrieved_on ?? '');
  const fmtDate = (d: string) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : d; };
  // the boundary sources: this country's in the table, all of them cited
  const geo = $derived(manifest.value?.geo_sources);
  const geoSrc = $derived(geo?.source_by_country[iso3] ?? '');
  const geoUnits = $derived(geo?.units[iso3]);
  const geoCites = $derived.by(() => {
    if (!geo) return [] as { id: string; countries: string; retrieved: string; url: string }[];
    const by: Record<string, string[]> = {};
    for (const [c, src] of Object.entries(geo.source_by_country)) (by[src] ??= []).push(countryName(c));
    return ['ons', 'gisco', 'oecd2020'].filter((id) => by[id]).map((id) => ({
      id, countries: by[id].join(', '), url: geo.sources[id]?.url ?? '',
      retrieved: fmtDate(geo.sources[id]?.retrieved ?? '')
    }));
  });
  const popTotal = $derived([...popSrc.values()].reduce((a, b) => a + b, 0));
  import { t } from '../lib/text/t';
  import Text from '../lib/components/Text.svelte';
</script>

<div class="view">
  <header>
    <h1>{t('sources.title', { country: name })}</h1>
    <div class="sub">{t('sources.sub', { country: name })}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="card">
    <h3>{t('sources.table.title')}</h3>
    <div class="wrap">
      <table class="data">
        <thead><tr><th>{t('sources.table.source')}</th><th>{t('sources.table.provides')}</th><th>{t('sources.table.years', { country: name })}</th></tr></thead>
        <tbody>
          {#each flows as f (f.flow)}
            <tr><td>{f.flow_name}</td><td>{f.labels.join('; ')}</td><td class="num">{span(f.first, f.last)}</td></tr>
          {/each}
          <tr><td>{t('sources.lai.name')}</td><td>{t('sources.lai.provides')}</td><td class="num">{cov('lai_total')?.first_year == null ? t('sources.table.na') : span(cov('lai_total')?.first_year, cov('lai_total')?.last_year)}</td></tr>
          <tr><td>{t('sources.rai.name')}</td><td>{t('sources.rai.provides')}</td><td class="num">{cov('rai_total')?.first_year == null ? t('sources.table.na') : span(cov('rai_total')?.first_year, cov('rai_total')?.last_year)}</td></tr>
          {#if geoSrc && geoUnits}
            <tr><td>{t('sources.geo.name.' + geoSrc)}</td>
              <td>{geoUnits.tl3 ? t('sources.geo.provides', { n3: geoUnits.tl3, n2: geoUnits.tl2 }) : t('sources.geo.provides_tl2', { n2: geoUnits.tl2 })}</td>
              <td class="num">{t('sources.geo.years', { grid: geo?.sources[geoSrc]?.grid ?? '' })}</td></tr>
          {/if}
          <tr><td>{t('sources.fua.name')}</td><td>{t('sources.fua.provides')}</td><td class="num">{t('sources.fua.years')}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card prose">
    <h3>{t('sources.combine.title')}</h3>
    <p><Text k="sources.combine.1" /></p>
    <p><Text k="sources.combine.2" /></p>
    {#if popTotal}<p><Text k="sources.combine.pop" vars={{ total: fmtInt(popTotal), country: name, observed: fmtInt(popSrc.get('observed') ?? 0), interpolated: fmtInt(popSrc.get('interpolated') ?? 0), carried: fmtInt(popSrc.get('carried') ?? 0) }} /></p>{/if}
  </div>

  <div class="card prose cites">
    <h3>{t('sources.cites.title')}</h3>
    {#each flows as f (f.flow)}
      <p><Text k="sources.cite.oecd" vars={{ flow: f.flow_name, description: f.description, year: retrieved.slice(0, 4), collection: f.collection, dataflow: `${f.agency},${f.flow},${f.version}`, date: fmtDate(f.retrieved_on), url: f.url }} /></p>
    {/each}
    <p><Text k="sources.cite.lai" /></p>
    <p><Text k="sources.cite.rai" /></p>
    <p><Text k="sources.cite.m49" /></p>
    <p><Text k="sources.cite.boundaries" /></p>
    {#if geoCites.length}
      <p><Text k="sources.cite.geo.intro" /></p>
      {#each geoCites as g (g.id)}<p class="sub-cite"><Text k={'sources.cite.geo.' + g.id} vars={{ countries: g.countries, retrieved: g.retrieved, url: g.url }} /></p>{/each}
    {/if}
    {#if retrieved}<p class="muted small"><Text k="sources.retrieved" vars={{ date: fmtDate(retrieved), country: name }} /></p>{/if}
  </div>
</div>

<style>
  .wrap { overflow: auto; margin-top: 8px; }
  .cites p { font-size: 13px; }
  .cites .sub-cite { padding-left: 14px; }
  .card h3 { margin-bottom: 6px; }
</style>
