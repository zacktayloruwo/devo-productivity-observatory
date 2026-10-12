<script lang="ts">
  // The report's legend for cross-country line charts: countries grouped by
  // region with the region's line style, the selected country in bold red.
  import { byRegion, REGION_DASH } from '../countries';
  import type { Country } from '../db/manifest.svelte';
  interface Props { countries: Country[]; colours: Map<string, string>; focus: string; present?: Set<string> }
  let { countries, colours, focus, present }: Props = $props();
  const groups = $derived(byRegion(countries.filter((c) => !present || present.has(c.iso3))));
</script>

<div class="leg">
  {#each groups as g (g.region)}
    <div class="grp">
      <div class="hdr">{g.region}</div>
      {#each g.items as c (c.iso3)}
        <div class="row" class:focus={c.iso3 === focus}>
          <svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" stroke={colours.get(c.iso3)} stroke-width={c.iso3 === focus ? 3 : 2} stroke-dasharray={REGION_DASH[c.region]} /></svg>
          <span>{c.display}</span>
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .leg { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 12px; }
  .grp { display: flex; flex-direction: column; gap: 2px; }
  .hdr { font-weight: 600; color: var(--fg-2); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 2px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .row.focus { font-weight: 600; }
</style>
