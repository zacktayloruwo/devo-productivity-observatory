<script lang="ts">
  // A titled card holding a chart and its table twin ("show as table"), with
  // a CSV download of the twin's rows, and a toggle that maximizes the card
  // to fill the screen (Esc or the toggle again restores it).
  import type { Snippet } from 'svelte';
  import { t } from '../text/t';
  import { downloadCsv, type CsvColumn } from '../util/csv';

  interface Col extends CsvColumn { num?: boolean; render?: (row: any) => string }
  interface Props { title: string; note?: string; columns?: Col[]; rows?: any[]; csvName?: string; children: Snippet; extra?: Snippet; intro?: Snippet }
  let { title, note = '', columns = [], rows = [], csvName = '', children, extra, intro }: Props = $props();
  let asTable = $state(false);
  let max = $state(false);
  // while maximized: Esc restores, and the page behind does not scroll
  $effect(() => {
    if (!max) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') max = false; };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  });
  const show = (c: Col, r: any) => c.render ? c.render(r) : c.value ? String(c.value(r) ?? '') : String(r[c.key] ?? '');
</script>

{#if max}<div class="scrim" role="presentation" onclick={() => (max = false)}></div>{/if}
<section class="cc" class:max aria-modal={max ? 'true' : undefined} role={max ? 'dialog' : undefined} aria-label={max ? title : undefined}>
  <header>
    <span class="ttl">{title}</span>
    {#if extra}{@render extra()}{/if}
    <span class="sp"></span>
    {#if csvName && rows.length}<button type="button" class="lnk" onclick={() => downloadCsv(csvName, columns, rows)}>Download CSV</button>{/if}
    {#if columns.length}<button type="button" class="lnk" onclick={() => (asTable = !asTable)} aria-pressed={asTable}>{asTable ? 'Show as chart' : 'Show as table'}</button>{/if}
    <button type="button" class="mx" onclick={() => (max = !max)} aria-pressed={max} title={max ? t('card.restore') : t('card.maximize')} aria-label={max ? t('card.restore') : t('card.maximize')}>
      {#if max}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
      {:else}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>{/if}
    </button>
  </header>
  {#if intro}<div class="intro prose">{@render intro()}</div>{/if}
  {#if asTable}
    <div class="twin">
      <table class="data">
        <thead><tr>{#each columns as c (c.key)}<th class:num={c.num}>{c.label}</th>{/each}</tr></thead>
        <tbody>
          {#each rows as r, i (i)}
            <tr>{#each columns as c (c.key)}<td class:num={c.num}>{show(c, r)}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    {@render children()}
  {/if}
  {#if note}<div class="note">{note}</div>{/if}
</section>

<style>
  .cc { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .ttl { font-weight: 600; font-size: 15px; }
  .sp { flex: 1; }
  .lnk { border: 0; background: transparent; padding: 0; min-height: 0; font-size: 12px; color: var(--accent); }
  .lnk:hover { text-decoration: underline; background: transparent; }
  .intro { font-size: 13px; color: var(--fg-2); }
  .twin { overflow: auto; max-height: 420px; }
  .note { font-size: 11px; color: var(--fg-2); line-height: 1.4; }
  .mx { border: 0; background: transparent; padding: 2px; min-height: 0; color: var(--fg-2); display: inline-flex; align-items: center; }
  .mx:hover { color: var(--accent); background: transparent; }
  .cc.max { position: fixed; inset: 16px; z-index: 60; overflow: auto; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
  .cc.max .twin { max-height: none; }
  .scrim { position: fixed; inset: 0; z-index: 59; background: rgba(0,0,0,.45); }
</style>
