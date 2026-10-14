<script lang="ts">
  // The Dispersion view: how unequal labour productivity is across a
  // country's FUAs or regions, and how that compares across countries.
  // Route: #/dispersion/<ISO3>?geo=<level>
  import { routeCountry, routeGeo } from '../lib/routeState';
  import { countryName } from '../lib/db/manifest.svelte';
  import DistributionCard from '../lib/components/cards/DistributionCard.svelte';
  import RegionDispersion from './level/RegionDispersion.svelte';
  import NationalDispersion from './level/NationalDispersion.svelte';
  import { t } from '../lib/text/t';

  const iso3 = $derived(routeCountry());
  const name = $derived(countryName(iso3));
  const geo = $derived(routeGeo());
</script>

{#if geo === 'national'}
  <NationalDispersion />
{:else if geo === 'tl2' || geo === 'tl2b' || geo === 'tl3'}
  <RegionDispersion level={geo} />
{:else}
  <div class="view">
    <header>
      <h1>{t('dispersion.title', { country: name })}</h1>
      <div class="sub">{t('dispersion.fua.sub')}</div>
    </header>
    <DistributionCard level="fua" {iso3} />
  </div>
{/if}
