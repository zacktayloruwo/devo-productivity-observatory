<script lang="ts">
  import { route, replace } from './lib/router.svelte';
  import { manifest, levelHasCountry } from './lib/db/manifest.svelte';
  import { routeView, routeCountry, routeGeo, viewLevels, DEFAULT_COUNTRY, HOME } from './lib/routeState';
  import { t } from './lib/text/t';
  import TopBar from './lib/components/TopBar.svelte';
  import LeftRail from './lib/components/LeftRail.svelte';
  import OverviewView from './routes/OverviewView.svelte';
  import ProductivityView from './routes/ProductivityView.svelte';
  import AutonomyView from './routes/AutonomyView.svelte';
  import GrowthView from './routes/GrowthView.svelte';
  import DispersionView from './routes/DispersionView.svelte';
  import MapView from './routes/MapView.svelte';
  import SourcesView from './routes/SourcesView.svelte';
  import AboutView from './routes/AboutView.svelte';

  const view = $derived(routeView());
  const country = $derived(routeCountry());

  // A bare visit opens the map of the United Kingdom in 2019 (labour
  // productivity, the first indicator); a view without a country opens the default country
  $effect(() => {
    if (!route.path.length) replace(HOME, route.query);
    else if (view !== 'about' && !/^[A-Z]{3}$/.test(route.path[1] ?? '')) replace([view, DEFAULT_COUNTRY], route.query);
  });
  $effect(() => { document.title = t('app.title'); });
  // a geography the view does not offer: Autonomy at FUA level opens national
  const geo = $derived(routeGeo());
  $effect(() => {
    if (view === 'autonomy' && !viewLevels(view).includes(geo)) replace(route.path, { ...route.query, geo: 'national' });
    // TL2b in a country without it (TL2 is already NUTS 2 there) opens TL2,
    // except on the all-countries map
    else if (geo === 'tl2b' && manifest.value && !levelHasCountry('tl2b', country) && !(view === 'map' && route.query.scope === 'all'))
      replace(route.path, { ...route.query, geo: 'tl2', sel: undefined, reg: undefined });
  });
  // a new view or country starts at the top; the map's year and selection do not scroll
  let main: HTMLElement | undefined = $state();
  $effect(() => { void view; void country; main?.scrollTo({ top: 0 }); });
</script>

<div class="shell">
  <TopBar />
  <div class="body">
    <LeftRail current={view} />
    <main bind:this={main}>
      {#if manifest.status === 'missing' || manifest.status === 'error'}
        <div class="notice caution">The data build is missing (data/manifest.json). Run <code>npm run data</code> and reload.</div>
      {/if}
      {#key country}
        {#if view === 'overview'}<OverviewView />
        {:else if view === 'productivity'}<ProductivityView />
        {:else if view === 'growth'}<GrowthView />
        {:else if view === 'dispersion'}<DispersionView />
        {:else if view === 'autonomy'}<AutonomyView />
        {:else if view === 'map'}<MapView />
        {:else if view === 'sources'}<SourcesView />
        {:else}<AboutView />{/if}
      {/key}
    </main>
  </div>
</div>

<style>
  .shell { display: flex; flex-direction: column; height: 100vh; }
  .body { flex: 1; display: flex; min-height: 0; }
  main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: auto; }
  .notice { margin: 20px 24px; }
  @media (max-width: 760px) { .body { flex-direction: column; } }
</style>
