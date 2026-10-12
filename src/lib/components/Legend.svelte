<script lang="ts">
  import { t } from '../text/t';
  // The map legend: quantile classes with their ranges, and the no-data fill.
  interface Props { title: string; labels: string[]; colours: string[]; note?: string; neutral: string }
  let { title, labels, colours, note = '', neutral }: Props = $props();
  const KEY = 'devo-obs.legend.collapsed';
  let collapsed = $state((() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })());
  function toggle() { collapsed = !collapsed; try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* not remembered */ } }
</script>

<div class="legend" class:collapsed>
  <button type="button" class="ttl" aria-expanded={!collapsed} onclick={toggle}>
    <span>{title}</span>
    <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
  </button>
  {#if !collapsed}
    {#each labels as l, i (i)}
      <div class="row"><span class="sw" style:background={colours[i]}></span><span class="num">{l}</span></div>
    {/each}
    <div class="row"><span class="sw neutral" style:background={neutral}></span><span>{t('map.legend.nodata')}</span></div>
    {#if note}<div class="note">{note}</div>{/if}
  {/if}
</div>

<style>
  .legend { position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-width: 180px; max-width: 280px; max-height: 60%; overflow: auto; font-size: 13px; z-index: 2; }
  .legend.collapsed { min-width: 0; }
  .ttl { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 0; padding: 0; border: 0; background: none; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--fg-2); text-align: left; cursor: pointer; }
  .ttl:hover { color: var(--fg); }
  .chev { flex: none; transition: transform .15s; }
  .collapsed .chev { transform: rotate(-90deg); }
  .row { display: flex; align-items: center; gap: 8px; }
  .sw { width: 14px; height: 14px; border-radius: 3px; flex: none; }
  .sw.neutral { border: 1.5px dashed var(--neutral-line); }
  .note { font-size: 11px; color: var(--fg-3); line-height: 1.4; }
</style>
