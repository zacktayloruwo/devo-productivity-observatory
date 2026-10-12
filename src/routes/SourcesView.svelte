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
      e.labels.push(s.label.replace(/^FUA (.)/, (_, c) => c.toUpperCase())); e.cols.push(s.value_col);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => a.flow_name.localeCompare(b.flow_name)).map((f) => {
      const cs = f.cols.map(cov).filter((c): c is Coverage => !!c && c.first_year != null);
      return { ...f, first: cs.length ? Math.min(...cs.map((c) => c.first_year!)) : null, last: cs.length ? Math.max(...cs.map((c) => c.last_year!)) : null };
    });
  });
  const retrieved = $derived(sources[0]?.retrieved_on ?? '');
  const fmtDate = (d: string) => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : d; };
  const popTotal = $derived([...popSrc.values()].reduce((a, b) => a + b, 0));
</script>

<div class="view">
  <header>
    <h1>Data sources · {name}</h1>
    <div class="sub">Every source behind the Observatory, with the years for which each is available for {name}{#if loading} · <Spinner size={12} />{/if}</div>
    {#if error}<div class="err">{error}</div>{/if}
  </header>

  <div class="card">
    <h3>Sources and years available</h3>
    <div class="wrap">
      <table class="data">
        <thead><tr><th>Source</th><th>Provides</th><th>Years, {name}</th></tr></thead>
        <tbody>
          {#each flows as f (f.flow)}
            <tr><td>{f.flow_name}</td><td>{f.labels.join('; ')}</td><td class="num">{span(f.first, f.last)}</td></tr>
          {/each}
          <tr><td>Local Autonomy Index (LAI 2.0)</td><td>Local autonomy composite score</td><td class="num">{cov('lai_total')?.first_year == null ? 'not available' : span(cov('lai_total')?.first_year, cov('lai_total')?.last_year)}</td></tr>
          <tr><td>Regional Authority Index (RAI)</td><td>Regional authority composite score</td><td class="num">{cov('rai_total')?.first_year == null ? 'not available' : span(cov('rai_total')?.first_year, cov('rai_total')?.last_year)}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card prose">
    <h3>How the sources are combined</h3>
    <p>The OECD publishes each indicator on its own schedule, so the sources above are joined on functional urban area and year without privileging any one of them: an observation is kept whether or not the other series cover the same year.</p>
    <p>Population is the exception that needs handling, because it is what the other indicators are weighted and scaled by. It is disseminated annually for most countries but only at five-year census intervals for others, Japan most notably, where the published productivity year (2021) falls outside the census series entirely. Population is therefore linearly interpolated between observations within each functional urban area, and the nearest observation is carried forward or backward by at most three years beyond the observed range.</p>
    {#if popTotal}<p>Of the {fmtInt(popTotal)} functional urban area population values used for {name}, {fmtInt(popSrc.get('observed') ?? 0)} are as published by the OECD, {fmtInt(popSrc.get('interpolated') ?? 0)} interpolated and {fmtInt(popSrc.get('carried') ?? 0)} carried from the nearest observed year.</p>{/if}
  </div>

  <div class="card prose cites">
    <h3>Citations</h3>
    {#each flows as f (f.flow)}
      <p><b>{f.flow_name}.</b> {f.description} OECD ({retrieved.slice(0, 4)}), <i>{f.flow_name}</i>, {f.collection}, OECD Data Explorer, dataflow <span class="mono">{f.agency},{f.flow},{f.version}</span>, retrieved via the OECD SDMX API on {fmtDate(f.retrieved_on)}. <a href={f.url} target="_blank" rel="noopener">{f.url}</a></p>
    {/each}
    <p><b>Local Autonomy Index (LAI).</b> Expert-coded index of the political, policy, fiscal and organisational autonomy of local government, scaled 0–1. Ladner, A., Keuffer, N., &amp; Bastianen, A. (2021), <i>Local Autonomy Index in the EU, Council of Europe and OECD countries (1990–2020), Release 2.0</i>, Brussels: European Commission; extending Ladner, A., Keuffer, N., &amp; Baldersheim, H. (2016), 'Measuring Local Autonomy in 39 Countries (1990–2014)', <i>Regional &amp; Federal Studies</i>, 26(3), 321–357. <a href="http://local-autonomy.andreasladner.ch/" target="_blank" rel="noopener">http://local-autonomy.andreasladner.ch/</a></p>
    <p><b>Regional Authority Index (RAI).</b> Expert-coded index of the self-rule and shared rule of regional government, scaled 0–1 here from the published 0–30 scale; national figures are population-weighted means of regional scores. Hooghe, L., Marks, G., Schakel, A. H., Niedzwiecki, S., Chapman-Osterkatz, S., &amp; Shair-Rosenfield, S. (2021), <i>Regional Authority Index (RAI) v.3</i>, EUI Research Data, Robert Schuman Centre for Advanced Studies (RAI-MLG release, April 2021); see also Hooghe, L., Marks, G., Schakel, A. H., et al. (2016), <i>Measuring Regional Authority: A Postfunctionalist Theory of Governance, Vol. I</i>, Oxford University Press. <a href="https://hdl.handle.net/1814/70298" target="_blank" rel="noopener">https://hdl.handle.net/1814/70298</a></p>
    <p><b>Country and region classification.</b> United Nations Statistics Division, <i>Standard Country or Area Codes for Statistical Use (M49)</i>, used to attach country names and world regions to the OECD reference areas. <a href="https://unstats.un.org/unsd/methodology/m49/" target="_blank" rel="noopener">https://unstats.un.org/unsd/methodology/m49/</a></p>
    <p><b>FUA boundaries.</b> OECD, <i>Functional Urban Areas</i> boundary files (GeoPackage), simplified for display. <a href="https://www.oecd.org/en/data/datasets/oecd-definition-of-cities-and-functional-urban-areas.html" target="_blank" rel="noopener">OECD definition of cities and functional urban areas</a></p>
    {#if retrieved}<p class="muted small">OECD series were retrieved from the OECD Data Explorer SDMX API (<a href="https://sdmx.oecd.org/public/rest" target="_blank" rel="noopener">https://sdmx.oecd.org/public/rest</a>) on {fmtDate(retrieved)}. Coverage shown is the span of years with non-missing data for {name}; other countries in the comparison sets may span different years.</p>{/if}
  </div>
</div>

<style>
  .wrap { overflow: auto; margin-top: 8px; }
  .cites p { font-size: 13px; }
  .card h3 { margin-bottom: 6px; }
</style>
