<script lang="ts">
  // The report's ranked tables: the top ten, middle ten and bottom ten rows,
  // with "…" separators only where rows are hidden, and a switch to show all.
  interface Col { key: string; label: string; num?: boolean; render: (row: any) => string }
  interface Props { rows: any[]; columns: Col[]; k?: number; csvName?: string }
  let { rows, columns, k = 10, csvName = '' }: Props = $props();
  import { downloadCsv } from '../util/csv';
  let all = $state(false);

  type Part = { kind: 'row'; row: any; rank: number } | { kind: 'sep' };
  const parts = $derived.by<Part[]>(() => {
    const n = rows.length;
    if (all || n <= 3 * k) return rows.map((row, i) => ({ kind: 'row', row, rank: i + 1 }));
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
      for (const i of grp) out.push({ kind: 'row', row: rows[i], rank: i + 1 });
      last = grp[grp.length - 1];
    }
    return out;
  });
</script>

<div class="rt">
  <div class="bar">
    <span class="muted small num">{rows.length} ranked</span>
    <span class="sp"></span>
    {#if csvName}<button type="button" class="lnk" onclick={() => downloadCsv(csvName, [{ key: 'rank', label: 'Rank', value: (r: any) => rows.indexOf(r) + 1 }, ...columns.map((c) => ({ key: c.key, label: c.label, value: (r: any) => r[c.key] }))], rows)}>Download CSV</button>{/if}
    {#if rows.length > 3 * k}<button type="button" class="lnk" onclick={() => (all = !all)}>{all ? `Show top, middle and bottom ${k}` : 'Show all'}</button>{/if}
  </div>
  <div class="wrap" class:tall={all}>
    <table class="data">
      <thead><tr><th class="num">Rank</th>{#each columns as c (c.key)}<th class:num={c.num}>{c.label}</th>{/each}</tr></thead>
      <tbody>
        {#each parts as p, i (i)}
          {#if p.kind === 'sep'}
            <tr class="sep"><td colspan={columns.length + 1}>…</td></tr>
          {:else}
            <tr><td class="num">{p.rank}</td>{#each columns as c (c.key)}<td class:num={c.num}>{c.render(p.row)}</td>{/each}</tr>
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
  .wrap.tall { max-height: 560px; }
</style>
