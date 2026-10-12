<script lang="ts">
  import { href, go, route } from '../router.svelte';
  import { manifest } from '../db/manifest.svelte';
  import { dbStatus } from '../db/status.svelte';
  import { routeView, routeCountry } from '../routeState';
  import ThemeToggle from './ThemeToggle.svelte';
  import Spinner from './Spinner.svelte';

  const view = $derived(routeView());
  const country = $derived(routeCountry());

  // Changing the country keeps the view (and the map's year and variable)
  function pick(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    const rest = route.path.slice(2);
    go([view, v, ...rest], route.query);
  }
</script>

<header>
  <a class="brand" href={href(['overview', country])}>
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18M5 20V9l4-3 4 3v11M13 20V5l6 4v11"/></svg>
    <span>The Devolution-Productivity Observatory</span>
  </a>
  {#if view !== 'about'}
    <label class="cty">
      <span class="muted">Country</span>
      <select aria-label="Country" value={country} onchange={pick}>
        {#each manifest.countries as c (c.iso3)}
          <option value={c.iso3}>{c.display}</option>
        {/each}
      </select>
    </label>
  {/if}
  <div class="spacer"></div>
  <span class="spslot" aria-hidden={!(dbStatus.pending > 0 || dbStatus.booting)}>{#if dbStatus.pending > 0 || dbStatus.booting}<Spinner size={18} label={dbStatus.booting ? 'Starting the query engine' : 'Loading'} />{/if}</span>
  <ThemeToggle />
</header>

<style>
  header { min-height: var(--topbar-h); flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; padding: 8px 20px; background: var(--panel); border-bottom: 1px solid var(--line); }
  .brand { display: inline-flex; align-items: center; gap: 0.4em; font-family: var(--serif); font-size: 21px; font-weight: 600; color: var(--brand); letter-spacing: -0.01em; white-space: nowrap; }
  .brand:hover { text-decoration: none; }
  .mark { width: 1.1em; height: 1.1em; flex: none; }
  .cty { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
  .cty select { border: 0; background: transparent; padding: 0; min-height: 0; font-weight: 500; }
  .spacer { flex: 1; }
  .spslot { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
  @media (max-width: 900px) { .brand { font-size: 17px; } .cty span { display: none; } }
</style>
