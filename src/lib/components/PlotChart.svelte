<script lang="ts">
  // Hosts one Observable Plot figure. `make` is called again whenever the
  // container width or the theme changes.
  import type { Tokens } from '../theme/tokens';
  import { liveTokens } from '../theme/liveTokens.svelte';
  import { theme } from '../theme/theme.svelte';

  interface Props { make: (o: { width: number; tokens: Tokens; dark: boolean }) => Element | null; height?: number; label?: string }
  let { make, height = 260, label = '' }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  let width = $state(0);
  const tokens = $derived(liveTokens.value);

  $effect(() => {
    if (!el) return;
    const ro = new ResizeObserver((es) => { width = Math.floor(es[0].contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  });
  $effect(() => {
    const w = width, tk = tokens, d = theme.isDark, m = make;
    if (!el || w <= 0) return;
    const node = m({ width: w, tokens: tk, dark: d });
    el.replaceChildren(...(node ? [node] : []));
  });
</script>

<div class="pc" bind:this={el} style:height={height + 'px'} role="img" aria-label={label}></div>

<style>
  .pc { width: 100%; min-width: 0; overflow: visible; }
  .pc :global(svg) { display: block; max-width: 100%; }
  .pc :global(figure) { margin: 0; }
</style>
