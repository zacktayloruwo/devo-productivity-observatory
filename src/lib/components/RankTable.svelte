<script lang="ts">
  // The report's ranked tables: the top ten, middle ten and bottom ten rows,
  // with "…" separators only where rows are hidden, and a switch to show all.
  // A header click sorts by that column (again: the other way); the Rank
  // column keeps each row's rank in the order given. A column sorts on
  // row[key], or on sort(row) when the cell is not a plain value.
  interface Col { key: string; label: string; num?: boolean; render: (row: any) => string; sort?: (row: any) => string | number | null }
  interface Props { rows: any[]; columns: Col[]; k?: number; csvName?: string; swatch?: (row: any) => string | null }
  // swatch: an optional colour square before the first column (the colour mode)
  let { rows, columns, k = 10, csvName = '', swatch }: Props = $props();
  import { downloadCsv } from '../util/csv';
  let all = $state(false);

  // sorting: null keeps the given order; missing values sort last
  let sortKey = $state<string | null>(null);
  let sortAsc = $state(true);
  // a different set of columns (another table) starts unsorted
  const colSig = $derived(columns.map((c) => c.key).join('|'));
  $effect(() => { void colSig; sortKey = null; });
  const rankOf = $derived(new Map(rows.map((r, i) => [r, i + 1])));
  function sortBy(c: Col) {
    if (sortKey === c.key) { sortAsc = !sortAsc; return; }
    sortKey = c.key;
    // text and ranks read top-down ascending; other numbers highest first
    sortAsc = !c.num || /rank/i.test(c.key);
  }
  const shown = $derived.by(() => {
    const c = columns.find((x) => x.key === sortKey);
    if (!c) return rows;
    const val = (r: any) => { const v = c.sort ? c.sort(r) : r[c.key]; return v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v)) ? null : v; };
    const dir = sortAsc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return (typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number)) * dir;
    });
  });
  const ariaSort = (k: string) => (sortKey === k ? (sortAsc ? 'ascending' : 'descending') : 'none');
  const arrow = (k: string) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');

  type Part = { kind: 'row'; row: any; rank: number } | { kind: 'sep' };
  const parts = $derived.by<Part[]>(() => {
    const n = shown.length;
    if (all || n <= 3 * k) return shown.map((row) => ({ kind: 'row', row, rank: rankOf.get(row) ?? 0 }));
    const med = Math.ceil(n / 2);
    const top = [...Array(Math.min(k, n)).keys()];
    const half = Math.floor(k / 2);
    const mid = [...Array(k).keys()].map((i) => med - half - 1 + i).filter((i) => i >= 0 && i < n && !top.includes(i));
    const bottom = [...Array(k).keys()].map((i) => n - k + i).filter((i) => i >= 0 && !top.includes(i) && !mid.includes(i));
    const out: Part[] = [];
    let last = -1;
    for (const grp of [top, mid, bottom]) {
      if (!grp.length) continue;
      if (last >= 0 && grp[0] > last + 1) out.push({ kind: 'sep' });
      for (const i of grp) out.push({ kind: 'row', row: shown[i], rank: rankOf.get(shown[i]) ?? 0 });
      last = grp[grp.length - 1];
    }
    return out;
  });
</script>

<div class="rt">
  <div class="bar">
    <span class="muted small num">{rows.length} ranked</span>
    <span class="sp"></span>
    {#if csvName}<button type="button" class="lnk" onclick={() => downloadCsv(csvName, [{ key: 'rank', label: 'Rank', value: (r: any) => rankOf.get(r) ?? '' }, ...columns.map((c) => ({ key: c.key, label: c.label, value: (r: any) => r[c.key] }))], shown)}>Download CSV</button>{/if}
    {#if rows.length > 3 * k}<button type="button" class="lnk" onclick={() => (all = !all)}>{all ? `Show top, middle and bottom ${k}` : 'Show all'}</button>{/if}
  </div>
  <div class="wrap" class:tall={all}>
    <table class="data">
      <thead><tr>
        <th class="num" aria-sort={sortKey == null ? 'ascending' : 'none'}><button type="button" class="sort" onclick={() => (sortKey = null)}>Rank{sortKey == null ? ' ▲' : ''}</button></th>
        {#each columns as c (c.key)}<th class:num={c.num} aria-sort={ariaSort(c.key)}><button type="button" class="sort" onclick={() => sortBy(c)}>{c.label}{arrow(c.key)}</button></th>{/each}
      </tr></thead>
      <tbody>
        {#each parts as p, i (i)}
          {#if p.kind === 'sep'}
            <tr class="sep"><td colspan={columns.length + 1}>…</td></tr>
          {:else}
            <tr><td class="num">{p.rank}</td>{#each columns as c, ci (c.key)}<td class:num={c.num}>{#if ci === 0 && swatch && swatch(p.row)}<span class="nw"><span class="swc" style:background={swatch(p.row)}></span>{c.render(p.row)}</span>{:else}{c.render(p.row)}{/if}</td>{/each}</tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .rt { display: flex; flex-direction: column; gap: 6px; }
  .bar { display: flex; align-items: center; gap: 12px; }
  .sp { flex: 1; }
  .lnk { border: 0; background: transparent; padding: 0; min-height: 0; font-size: 12px; color: var(--accent); }
  .lnk:hover { text-decoration: underline; background: transparent; }
  .wrap { overflow: auto; }
  .nw { white-space: nowrap; }
  .sort { border: 0; background: none; padding: 0; min-height: 0; font: inherit; font-weight: 600; color: inherit; cursor: pointer; text-align: inherit; }
  .sort:hover { color: var(--accent); background: none; }
  .swc { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: -1px; border: 1px solid var(--line); }
  .wrap.tall { max-height: 560px; }
</style>
