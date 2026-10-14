<script lang="ts">
  import { href, go, route } from '../router.svelte';
  import { manifest } from '../db/manifest.svelte';
  import { dbStatus } from '../db/status.svelte';
  import { routeView, routeCountry, routeGeo, viewLevels } from '../routeState';
  import { LEVELS, levelHasCountry, countryName, type Level } from '../db/manifest.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import Spinner from './Spinner.svelte';
  import { t, has } from '../text/t';

  const view = $derived(routeView());
  const country = $derived(routeCountry());

  const geo = $derived(routeGeo());
  // The map, Overview, Productivity and Autonomy follow the geography, so
  // choosing one keeps the view; Sources and About open the map at that
  // level. The map's indicator resets when the level has no such indicator.
  const GEO_VIEWS = ['map', 'overview', 'productivity', 'growth', 'dispersion', 'autonomy'];
  const offered = $derived(viewLevels(view));
  // the geography shown as selected: Growth is always national
  const shownGeo = $derived(view === 'growth' ? 'national' : geo);
  const followsGeo = $derived(GEO_VIEWS.includes(view));
  function pickGeo(lv: Level) {
    const q = { ...route.query, geo: lv === 'fua' ? undefined : lv, sel: undefined, reg: undefined };
    if (followsGeo) go(route.path, q); else go(['map', country], q);
  }

  // A country without the level: TL2b outside the four countries that have it
  // (every view), TL3 in Canada (the map; the other views say so in place)
  const scopeAll = $derived(view === 'map' && route.query.scope === 'all');
  const lacks = (lv: Level) => !scopeAll && ((lv === 'tl2b' && !levelHasCountry('tl2b', country)) || (lv === 'tl3' && view === 'map' && !levelHasCountry('tl3', country)));
  // The hover box names the level in the selected country (geo.tip.<level>.<iso3>),
  // else describes it in general (every country at once, or no country text)
  function tip(lv: Level): string {
    if (!offered.includes(lv)) return t('geo.unavailable.' + view);
    const c = scopeAll || (view === 'map' && geo === 'national') ? '' : country;
    const k = 'geo.tip.' + lv + '.' + c.toLowerCase();
    if (c && has(k)) return t('geo.tip.' + lv + '.' + c.toLowerCase());
    if (c && lv === 'tl2b' && lacks(lv)) return t('geo.tip.tl2b.none', { country: countryName(c) });
    return t('geo.tip.' + lv);
  }

  // One selector for where the map looks: a country, or every country at
  // once (the map's former Scope toggle). The country stays in the path, so
  // returning from "All" comes back to it. National maps always show every
  // country; the other views are about one country and offer no "All".
  const ALL = 'ALL';
  const allOffered = $derived(view === 'map');
  const nationalMap = $derived(view === 'map' && geo === 'national');
  const shown = $derived(nationalMap || (allOffered && route.query.scope === 'all') ? ALL : country);
  // Changing the country keeps the view (and the map's year and variable)
  function pick(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (v === ALL) { go(route.path, { ...route.query, scope: 'all', sel: undefined }); return; }
    const rest = route.path.slice(2);
    go([view, v, ...rest], { ...route.query, scope: undefined, sel: undefined });
  }
</script>

<header>
  <a class="brand" href={href(['overview', country], { geo: route.query.geo })}>
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20h18M5 20V9l4-3 4 3v11M13 20V5l6 4v11"/></svg>
    <span>{t('app.title')}</span>
  </a>
  {#if view !== 'about'}
    <label class="cty" title={nationalMap ? t('country.all.national') : undefined}>
      <span class="muted">{t('country.label')}</span>
      <select aria-label={t('country.label')} value={shown} onchange={pick} disabled={nationalMap}>
        {#if allOffered}<option value={ALL}>{t('country.all')}</option>{/if}
        {#each manifest.countries as c (c.iso3)}
          <option value={c.iso3}>{c.display}</option>
        {/each}
      </select>
    </label>
  {/if}
  <div class="geo" role="radiogroup" aria-label={t('geo.label')}>
    <span class="muted">{t('geo.label')}</span>
    <div class="seg">
      {#each LEVELS as lv (lv)}
        <button type="button" aria-pressed={followsGeo && shownGeo === lv} title={tip(lv)}
          disabled={!offered.includes(lv) || lacks(lv)}
          onclick={() => pickGeo(lv)}>{t('geo.' + lv)}</button>
      {/each}
    </div>
  </div>
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
  .geo { display: flex; align-items: center; gap: 8px; }
  .geo .seg > button { min-height: 28px; }
  @media (max-width: 900px) { .geo > .muted { display: none; } }
  .spslot { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; }
  @media (max-width: 900px) { .brand { font-size: 17px; } .cty span { display: none; } }
</style>
