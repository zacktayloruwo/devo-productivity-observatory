<script lang="ts">
  let { size = 18, label = 'Loading' }: { size?: number; label?: string } = $props();
</script>

<span class="sp" role="status" aria-live="polite" style:width={size + 'px'} style:height={size + 'px'} style:border-width={Math.max(2, Math.round(size / 9)) + 'px'}>
  <span class="sr">{label}</span>
</span>

<style>
  .sp { display: inline-block; box-sizing: border-box; border-style: solid; border-color: var(--line) var(--line) var(--accent) var(--line); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .sp { animation-duration: 2s; } }
</style>
