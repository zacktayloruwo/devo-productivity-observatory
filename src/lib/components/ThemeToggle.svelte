<script lang="ts">
  import { theme, cycleTheme } from '../theme/theme.svelte';
  const title = $derived(theme.isDark ? 'Switch to light theme' : 'Switch to dark theme');
</script>

<button type="button" class="tt" aria-label="Toggle theme" {title} onclick={cycleTheme}>
  {#if theme.isDark}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
  {:else}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>
  {/if}
</button>

<style>
  .tt { width: 36px; height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
</style>
