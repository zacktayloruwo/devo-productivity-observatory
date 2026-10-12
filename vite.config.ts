import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Start downloading DuckDB-WASM's engine (eh bundle) while the HTML is parsed,
// instead of when the first query boots the database. The engine is fetched
// again inside DuckDB's worker, which Chromium does not serve from a page
// preload, so an inline script fetches it once into a Blob (window.__duckdbEh)
// and db.ts hands DuckDB a blob: URL for it. Build only.
function preloadDuckdb(): Plugin {
  let base = './';
  return {
    name: 'preload-duckdb',
    apply: 'build',
    configResolved(c) { base = c.base; },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const names = Object.keys(ctx.bundle ?? {});
        const wasm = names.find((f) => /duckdb-eh-[^/]*\.wasm$/.test(f));
        const worker = names.find((f) => /duckdb-browser-eh\.worker-[^/]*\.js$/.test(f));
        const tags: { tag: string; attrs?: Record<string, string>; children?: string; injectTo: 'head' }[] = [];
        if (worker) tags.push({ tag: 'link', attrs: { rel: 'preload', href: base + worker, as: 'fetch', crossorigin: 'anonymous' }, injectTo: 'head' });
        if (wasm) tags.push({ tag: 'script', children: `window.__duckdbEh=fetch(${JSON.stringify(base + wasm)}).then(function(r){if(!r.ok)throw new Error(r.status);return r.blob()}).catch(function(){return null});`, injectTo: 'head' });
        return tags;
      }
    }
  };
}

// GitHub Pages serves the site from /<repo>/; VITE_BASE=/ for a custom domain.
// No COOP/COEP headers, deliberately: GitHub Pages cannot send them, so the
// app runs on DuckDB-WASM's single-threaded (eh/mvp) bundle.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/devo-productivity-observatory/',
  plugins: [svelte(), preloadDuckdb()],
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 }
});
