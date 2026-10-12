<script lang="ts">
  // The choropleth: FUA polygons on an SVG with the country's projection
  // fitted to its mainland FUAs and d3-zoom pan/zoom, plus fixed inset
  // panels for the parts far from the mainland (src/lib/geo/projections.ts),
  // each on its own projection, neither panned nor zoomed. Generic over what
  // it draws: the parent supplies the features, a fill per feature id and a
  // hover box, and gets clicks back.
  import { geoPath, type GeoProjection } from 'd3-geo';
  import { zoom as d3zoom, zoomIdentity, type ZoomTransform, type ZoomBehavior } from 'd3-zoom';
  import { select } from 'd3-selection';
  import type { Feature, Geometry, MultiLineString } from 'geojson';
  import type { FuaFeature, AdminFeature } from '../geo/geojson';
  import { splitFeatures, type Layout } from '../geo/projections';
  import { floatingTip, type TipContent } from '../tooltip';
  import { liveTokens } from '../theme/liveTokens.svelte';

  interface Props {
    features: FuaFeature[];
    layout: Layout;
    land?: Feature<Geometry>[];              // the land fill, every country
    borders?: Feature<Geometry> | MultiLineString | null;   // the selected country's national boundary
    admin?: AdminFeature[];                  // subnational outlines, drawn over the FUAs
    fillFor: (id: string) => string;
    tipFor: (id: string) => TipContent;
    selected?: string;
    onselect?: (id: string | null) => void;
  }
  let { features, layout, land = [], borders = null, admin = [], fillFor, tipFor, selected = '', onselect }: Props = $props();

  let host: HTMLDivElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();
  let width = $state(0), height = $state(0);
  let transform = $state<ZoomTransform>(zoomIdentity);
  let hovered = $state('');
  const tokens = $derived(liveTokens.value);

  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver((es) => { width = Math.floor(es[0].contentRect.width); height = Math.floor(es[0].contentRect.height); });
    ro.observe(host);
    return () => ro.disconnect();
  });

  const split = $derived(splitFeatures(features, layout));
  const INSET_W = 190, INSET_H = 140;
  // the insets stack in the bottom-right corner; a wide map puts them in a row
  const insetCols = $derived(Math.max(1, Math.min(split.insets.length, Math.floor((width - 320) / (INSET_W + 10)))));

  // the main projection fitted to the mainland features
  const projection = $derived.by<GeoProjection | null>(() => {
    if (!split.main.length || width <= 0 || height <= 0) return null;
    const p = layout.make();
    p.fitExtent([[24, 24], [width - 24, height - 24]], { type: 'FeatureCollection', features: split.main } as any);
    return p;
  });
  const path = $derived(projection ? geoPath(projection) : null);
  const fuaPaths = $derived.by(() => { const d = new Map<string, string>(); if (!path) return d; for (const f of split.main) d.set(f.properties.fua_id, path(f as any) ?? ''); return d; });
  const landPath = $derived.by(() => { if (!path || !land.length) return ''; return land.map((f) => path(f as any) ?? '').join(''); });
  const borderPath = $derived(path && borders ? path(borders as any) ?? '' : '');
  // the subnational outlines, split between the main map and the insets as the FUAs are
  const adminSplit = $derived(splitFeatures(admin, layout));
  const adminPaths = $derived.by(() => { if (!path) return []; return adminSplit.main.map((f) => ({ id: f.properties.id, name: f.properties.name, d: path(f as any) ?? '' })); });

  // each inset: its projection fitted to its features, paths for them and the land
  const insetPanels = $derived.by(() => split.insets.map(({ inset, features: fs }) => {
    const p = inset.make();
    p.fitExtent([[10, 10], [INSET_W - 10, INSET_H - 10]], { type: 'FeatureCollection', features: fs } as any);
    const pth = geoPath(p);
    const adm = adminSplit.insets.find((a) => a.inset.id === inset.id)?.features ?? [];
    return { inset, paths: fs.map((f) => ({ id: f.properties.fua_id, name: f.properties.fua_name, d: pth(f as any) ?? '' })),
      land: land.length ? land.map((f) => pth(f as any) ?? '').join('') : '', borders: borders ? pth(borders as any) ?? '' : '',
      admin: adm.map((f) => pth(f as any) ?? '').join('') };
  }));

  let zb: ZoomBehavior<SVGSVGElement, unknown> | null = null;
  $effect(() => {
    if (!svgEl) return;
    zb = d3zoom<SVGSVGElement, unknown>().scaleExtent([1, 60]).on('zoom', (e) => { transform = e.transform; });
    select(svgEl).call(zb).on('dblclick.zoom', null);
    return () => { select(svgEl!).on('.zoom', null); };
  });
  // a new feature set resets the view
  $effect(() => { void features; void layout; if (svgEl && zb) select(svgEl).call(zb.transform, zoomIdentity); });
  export function reset() { if (svgEl && zb) select(svgEl).call(zb.transform, zoomIdentity); }

  let box: ReturnType<typeof floatingTip> | null = null;
  function over(e: MouseEvent, id: string) {
    hovered = id;
    const c = tipFor(id);
    if (!c) { box?.hide(); return; }
    box ??= floatingTip();
    box.show(e.clientX, e.clientY, c);
  }
  function out() { hovered = ''; box?.hide(); }
  $effect(() => () => { box?.destroy(); box = null; });
  const sw = $derived(1 / transform.k);
  const strokeOf = (id: string) => (id === hovered || id === selected ? tokens.fg : tokens.panel);
  const widthOf = (id: string) => (id === selected ? 2 : id === hovered ? 1.5 : 0.6);
</script>

<div class="mc" bind:this={host}>
  <svg bind:this={svgEl} {width} {height} role="img" aria-label="Map of functional urban areas">
    <rect class="bg" width={width} height={height} fill={tokens.water} onclick={() => onselect?.(null)} role="presentation" />
    <g transform={transform.toString()}>
      {#if landPath}<path d={landPath} fill={tokens.land} stroke={tokens.line} stroke-width={0.5 * sw} />{/if}
      {#each split.main as f (f.properties.fua_id)}
        {@const id = f.properties.fua_id}
        <path d={fuaPaths.get(id)} fill={fillFor(id)} stroke={strokeOf(id)} stroke-width={widthOf(id) * sw}
          onmousemove={(e) => over(e, id)} onmouseleave={out} onclick={() => onselect?.(id)} onkeydown={(e) => { if (e.key === 'Enter') onselect?.(id); }} role="button" tabindex="-1" aria-label={f.properties.fua_name} />
      {/each}
      <!-- outlines over the FUAs, never catching the pointer -->
      {#each adminPaths as a (a.id)}<path class="adm" d={a.d} stroke={tokens['fg-2']} stroke-width={0.8 * sw} />{/each}
      {#if borderPath}<path class="adm" d={borderPath} stroke={tokens.fg} stroke-width={1.1 * sw} />{/if}
    </g>
  </svg>
  {#if insetPanels.length}
    <div class="insets" style:grid-template-columns={`repeat(${insetCols}, ${INSET_W}px)`}>
      {#each insetPanels as p (p.inset.id)}
        <div class="inset" style:width={INSET_W + 'px'}>
          <svg width={INSET_W} height={INSET_H} role="img" aria-label={p.inset.label}>
            <rect width={INSET_W} height={INSET_H} fill={tokens.water} />
            {#if p.land}<path d={p.land} fill={tokens.land} stroke={tokens.line} stroke-width="0.5" />{/if}
            {#each p.paths as f (f.id)}
              <path d={f.d} fill={fillFor(f.id)} stroke={strokeOf(f.id)} stroke-width={widthOf(f.id)}
                onmousemove={(e) => over(e, f.id)} onmouseleave={out} onclick={() => onselect?.(f.id)} onkeydown={(e) => { if (e.key === 'Enter') onselect?.(f.id); }} role="button" tabindex="-1" aria-label={f.name} />
            {/each}
            {#if p.admin}<path class="adm" d={p.admin} stroke={tokens['fg-2']} stroke-width="0.8" />{/if}
            {#if p.borders}<path class="adm" d={p.borders} stroke={tokens.fg} stroke-width="1.1" />{/if}
          </svg>
          <div class="lab">{p.inset.label}</div>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class="fit" title="Fit to extent" aria-label="Fit to extent" onclick={reset}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
  </button>
</div>

<style>
  .mc { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; }
  svg { display: block; }
  .mc > svg { cursor: grab; }
  .mc > svg:active { cursor: grabbing; }
  path { cursor: pointer; }
  path:focus { outline: none; }
  .adm { fill: none; pointer-events: none; stroke-linejoin: round; }
  .fit { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; min-height: 0; }
  .insets { position: absolute; right: 16px; bottom: 16px; display: grid; gap: 10px; z-index: 2; }
  .inset { position: relative; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; background: var(--panel); box-shadow: 0 2px 10px rgba(0,0,0,.12); }
  .inset .lab { position: absolute; left: 0; bottom: 0; padding: 2px 6px; font-size: 10px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--fg-2); background: color-mix(in srgb, var(--panel) 80%, transparent); border-top-right-radius: 6px; }
</style>
