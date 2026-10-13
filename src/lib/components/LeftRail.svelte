<script lang="ts">
  import { href } from '../router.svelte';
  import { manifest } from '../db/manifest.svelte';
  import { routeCountry, type View } from '../routeState';

  let { current }: { current: View } = $props();
  const country = $derived(routeCountry());
  import { route } from '../router.svelte';
  // the map link returns to the geography last shown on the map
  let lastGeo = $state('');
  $effect(() => { if (current === 'map') lastGeo = route.query.geo ?? ''; });
  const to = (v: View) => href(v === 'about' ? ['about'] : [v, country], v === 'map' && lastGeo ? { geo: lastGeo } : {});
</script>

<nav aria-label="Views">
  <a href={to('overview')} class:on={current === 'overview'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6"></path></svg>Overview</a>
  <a href={to('productivity')} class:on={current === 'productivity'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 17l5-6 4 4 5-8 4 5"></path><path d="M3 21h18"></path></svg>Productivity</a>
  <a href={to('autonomy')} class:on={current === 'autonomy'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 21h18M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8M12 3l9 6H3z"></path></svg>Autonomy</a>
  <a href={to('map')} class:on={current === 'map'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"></path><path d="M9 3v15M15 6v15"></path></svg>Map</a>
  <div class="spacer"></div>
  <a href={to('sources')} class="about" class:on={current === 'sources'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h12l4 4v12H4z"></path><path d="M8 12h8M8 16h8M16 4v4h4"></path></svg>Sources</a>
  <a href={to('about')} class="about" class:on={current === 'about'}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6M12 7h.01"></path></svg>About</a>
  {#if manifest.value}
    <div class="build num">Data built {manifest.value.built}</div>
  {/if}
</nav>

<style>
  nav { width: var(--rail-w); flex: none; display: flex; flex-direction: column; gap: 4px; padding: 16px 12px; background: var(--panel); border-right: 1px solid var(--line); }
  a { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius); color: var(--fg); }
  a:hover { background: var(--panel-2); text-decoration: none; }
  a.on { background: var(--accent-bg); color: var(--accent-deep); font-weight: 600; }
  a.about { color: var(--fg-2); }
  .spacer { flex: 1; }
  .build { padding: 10px 12px 0; font-size: 11px; line-height: 1.5; color: var(--fg-3); }
  @media (max-width: 760px) {
    nav { width: 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px 12px; }
    .spacer, .build { display: none; }
    a { padding: 8px 10px; }
  }
</style>
