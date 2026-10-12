<script lang="ts">
  // A slider over the years a variable is available (discrete ticks). Arrow
  // buttons step; the value is always one of `years`. Years in `sparse` are
  // drawn hollow (data for the scope shown, but few FUAs).
  import { tip, floatingTip } from '../tooltip';
  interface Props { years: number[]; value: number; sparse?: number[]; onchange: (y: number) => void; }
  let { years, value, sparse = [], onchange }: Props = $props();
  const sparseSet = $derived(new Set(sparse));
  const lo = $derived(years.length ? Math.min(...years) : 2000);
  const hi = $derived(years.length ? Math.max(...years) : 2023);
  const pct = (y: number) => (hi === lo ? 50 : ((y - lo) / (hi - lo)) * 100);
  const THUMB = 22;
  const at = (y: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${pct(y) / 100})`;

  function step(d: number) {
    const i = years.indexOf(value);
    const j = Math.max(0, Math.min(years.length - 1, (i < 0 ? 0 : i) + d));
    if (years[j] !== value) onchange(years[j]);
  }
  const nearest = (v: number) => years.reduce((b, y) => (Math.abs(y - v) < Math.abs(b - v) ? y : b), years[0]);
  let box: ReturnType<typeof floatingTip> | null = null;
  function hoverTick(e: MouseEvent) {
    if (!years.length || e.buttons) { box?.hide(); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = nearest(lo + ((e.clientX - r.left - THUMB / 2) / Math.max(1, r.width - THUMB)) * (hi - lo));
    box ??= floatingTip();
    box.show(r.left + THUMB / 2 + (pct(y) / 100) * (r.width - THUMB), r.top + 6, String(y));
  }
  $effect(() => () => { box?.destroy(); box = null; });
  function input(e: Event) {
    const best = nearest(Number((e.target as HTMLInputElement).value));
    if (best !== value) onchange(best);
  }
</script>

<div class="ts">
  <button type="button" aria-label="Previous year" use:tip={'Previous year'} onclick={() => step(-1)}>‹</button>
  <div class="track">
    <div class="line"></div>
    {#each years as y (y)}<span class="tick" class:on={y === value} class:sparse={sparseSet.has(y)} style:left={at(y)}></span>{/each}
    <input type="range" min={lo} max={hi} step="1" value={value} oninput={input} onmousemove={hoverTick} onmouseleave={() => box?.hide()} aria-label="Year" />
    <div class="lab num" style:left={at(value)}>{value}</div>
    <div class="end num l">{lo}</div><div class="end num r">{hi}</div>
  </div>
  <button type="button" aria-label="Next year" use:tip={'Next year'} onclick={() => step(1)}>›</button>
</div>

<style>
  .ts { display: flex; align-items: center; gap: 14px; flex: 1; }
  .ts > button { width: 32px; height: 32px; padding: 0; min-height: 0; }
  .track { position: relative; flex: 1; height: 54px; }
  .line { position: absolute; left: 0; right: 0; top: 27px; height: 2px; background: var(--line); }
  .tick { position: absolute; top: 21px; width: 2px; height: 14px; margin-left: -1px; background: var(--fg-3); }
  .tick.on { background: var(--accent); }
  .tick.sparse { background: transparent; border: 1px solid var(--fg-3); width: 4px; margin-left: -2px; }
  .tick.sparse.on { border-color: var(--accent); }
  input[type=range] { position: absolute; left: 0; right: 0; top: 16px; width: 100%; margin: 0; height: 24px; min-height: 0; padding: 0; border: 0; background: transparent; -webkit-appearance: none; appearance: none; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); border: 3px solid var(--panel); box-shadow: 0 0 0 1px var(--accent); cursor: pointer; }
  input[type=range]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 3px solid var(--panel); cursor: pointer; }
  .lab { position: absolute; top: 39px; transform: translateX(-50%); font-size: 12px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  .end { position: absolute; top: 0; font-size: 11px; color: var(--fg-3); }
  .end.l { left: 0; } .end.r { right: 0; }
</style>
