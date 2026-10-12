<script lang="ts">
  // A titled card holding a chart and its table twin ("show as table"), with
  // a CSV download of the twin's rows.
  import type { Snippet } from 'svelte';
  import { downloadCsv, type CsvColumn } from '../util/csv';

  interface Col extends CsvColumn { num?: boolean; render?: (row: any) => string }
  interface Props { title: string; note?: string; columns?: Col[]; rows?: any[]; csvName?: string; children: Snippet; extra?: Snippet; intro?: Snippet }
  let { title, note = '', columns = [], rows = [], csvName = '', children, extra, intro }: Props = $props();
  let asTable = $state(false);
  const show = (c: Col, r: any) => c.render ? c.render(r) : c.value ? String(c.value(r) ?? '') : String(r[c.key] ?? '');
</script>

<section class="cc">
  <header>
    <span class="ttl">{title}</span>
    {#if extra}{@render extra()}{/if}
    <span class="sp"></span>
    {#if csvName && rows.length}<button type="button" class="lnk" onclick={() => downloadCsv(csvName, columns, rows)}>Download CSV</button>{/if}
    {#if columns.length}<button type="button" class="lnk" onclick={() => (asTable = !asTable)} aria-pressed={asTable}>{asTable ? 'Show as chart' : 'Show as table'}</button>{/if}
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
</style>
