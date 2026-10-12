<script lang="ts">
  import { manifest } from '../lib/db/manifest.svelte';
  import { href } from '../lib/router.svelte';
  import { DEFAULT_COUNTRY } from '../lib/routeState';
  const m = $derived(manifest.value);
</script>

<section class="view about">
  <div>
    <h1>About the Observatory</h1>
    <p class="muted">Labour productivity of functional urban areas and the autonomy of local and regional government in nine countries.</p>
  </div>

  <div class="card prose">
    <h3>What it shows</h3>
    <p>The Devolution-Productivity Observatory presents, for Canada, France, Germany, Italy, Japan, South Korea, Spain, the United Kingdom and the United States, the labour productivity of OECD functional urban areas (a city and its commuting zone) alongside two expert-coded measures of subnational autonomy: the Local Autonomy Index and the Regional Authority Index. It is the interactive counterpart of the country profile documents produced for the Devolution project, and draws every figure from the same data pack.</p>
    <p>Each view follows the profile: an <a href={href(['overview', DEFAULT_COUNTRY])}>Overview</a> of a country's FUAs; <a href={href(['productivity', DEFAULT_COUNTRY])}>Productivity</a> rankings, the relationship with population size, the distribution and spread of productivity across FUAs and its change over time; the <a href={href(['autonomy', DEFAULT_COUNTRY])}>Autonomy</a> indices; and a <a href={href(['map', DEFAULT_COUNTRY])}>Map</a> of any FUA indicator in any year. The country is chosen in the top bar; the URL carries every selection, so any view can be linked.</p>
  </div>

  <div class="card prose">
    <h3>Method</h3>
    <p>OECD series are retrieved from the OECD Data Explorer SDMX API and joined on functional urban area and year. Population is interpolated between census observations and carried by at most three years beyond them, as described under <a href={href(['sources', DEFAULT_COUNTRY])}>Sources</a>. Dollar figures are nominal USD at purchasing power parity: comparable across countries within a year, not across years. The reference year for the snapshot views is {m?.ref_year ?? 2019}, the last full year before the Covid-19 pandemic, and the pandemic emergency as defined by the World Health Organization (March 2020 to May 2023) is shaded on every time series.</p>
    <p>Means across FUAs are unweighted: each FUA counts once, regardless of population. The fiscal dimensions of the LAI and RAI are sums of their sub-indicators using the indices' own point weights, rescaled to 0–1. The map classes each indicator into quantiles pooled over every year shown for the scope chosen, so a colour keeps its meaning as the year changes.</p>
  </div>

  <div class="card prose">
    <h3>How it works</h3>
    <p>The site is static. The data are Parquet files segmented by country (one file per country for the FUA series, plus small national, LAI, RAI and source tables) and simplified GeoJSON boundaries, read in the browser by DuckDB-WASM. A country view fetches only that country's file; the cross-country comparisons read all nine. Everything the site shows can be downloaded as CSV from each chart, or read directly from the <span class="mono">data/</span> folder of the repository with any Parquet tool.</p>
  </div>

  <div class="card">
    <h3>Build</h3>
    {#if m}
      <dl class="num">
        <dt>Data built</dt><dd class="mono">{m.built}</dd>
        <dt>Reference year</dt><dd>{m.ref_year}</dd>
        <dt>FUA years</dt><dd>{m.years.fua[0]}–{m.years.fua[1]}</dd>
        <dt>LAI years</dt><dd>{m.years.lai[0]}–{m.years.lai[1]}</dd>
        <dt>RAI years</dt><dd>{m.years.rai[0]}–{m.years.rai[1]}</dd>
      </dl>
      <h3 class="cite-h">Citing</h3>
      <p class="cite">Taylor, Zack. <i>The Devolution-Productivity Observatory.</i> Data built {m.built}. Western University.</p>
    {:else}
      <p class="muted">{manifest.status === 'loading' ? 'Loading…' : 'No data build.'}</p>
    {/if}
  </div>
</section>

<style>

  .card h3 { margin-bottom: 6px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
  dt { color: var(--fg-2); }
  dd { margin: 0; }
  .cite-h { margin-top: 14px; }
  .cite { font-size: 13px; margin-top: 4px; }
</style>
