<script lang="ts">
  // One passage from text/app_text.csv, rendered inline with its markup:
  // <p><Text k="overview.reading.1" vars={{ possessive }} /></p>
  // View links ([label](view:map)) go to that view for the country and
  // geography in view.
  import { raw, parse, type Vars } from '../text/t';
  import { href, route } from '../router.svelte';
  import { routeCountry } from '../routeState';

  interface Props { k: string; vars?: Vars }
  let { k, vars = {} }: Props = $props();
  const nodes = $derived(parse(raw(k, vars)));
  const country = $derived(routeCountry());
</script>

{#each nodes as n, i (i)}
  {#if n.kind === 'text'}{n.text}
  {:else if n.kind === 'strong'}<b>{n.text}</b>
  {:else if n.kind === 'em'}<i>{n.text}</i>
  {:else if n.kind === 'code'}<span class="mono">{n.text}</span>
  {:else if n.kind === 'link' && n.view}<a href={href([n.view, country], { geo: route.query.geo })}>{n.label}</a>
  {:else if n.kind === 'link'}<a href={n.href} target="_blank" rel="noopener">{n.label}</a>{/if}
{/each}
