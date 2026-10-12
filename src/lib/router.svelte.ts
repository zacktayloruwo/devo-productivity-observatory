// Hash router: the URL is the view state. `#/map/USA/2019?var=labprod_usdppp`.
// Works from any static host (GitHub Pages included), survives reloads, and
// every state change rewrites the hash so any view can be linked.

export type Route = {
  path: string[];          // ['map', 'USA', '2019']
  query: Record<string, string>;
  raw: string;
};
export type QueryPatch = Record<string, string | number | undefined | null>;

export function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  const path = p.split('/').filter(Boolean).map(decodeURIComponent);
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(q)) query[k] = v;
  return { path, query, raw: hash };
}

let current = $state<Route>(typeof location === 'undefined' ? parse('') : parse(location.hash));
function setCurrent(r: Route) { current = r; }

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { setCurrent(parse(location.hash)); });
}

export const route = {
  get value() { return current; },
  get path() { return current.path; },
  get query() { return current.query; }
};

export function buildHash(path: string[] | string, query: QueryPatch): string {
  const p = Array.isArray(path) ? path.map(encodeURIComponent).join('/') : path.replace(/^\/+/, '');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const q = qs.toString();
  return '#/' + p + (q ? '?' + q : '');
}

export function href(path: string[] | string, query: QueryPatch = {}): string {
  return buildHash(path, query);
}

export function go(path: string[] | string, query: QueryPatch = {}) {
  location.hash = href(path, query);
}

// Replace the whole route without a history entry (a redirect).
export function replace(path: string[] | string, query: QueryPatch = {}) {
  history.replaceState(null, '', href(path, query));
  setCurrent(parse(location.hash));
}

// Replace only the query string of the current route, without a history entry.
export function setQuery(patch: QueryPatch) {
  const q: Record<string, string> = { ...current.query };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') delete q[k]; else q[k] = String(v);
  }
  history.replaceState(null, '', buildHash(current.path, q));
  setCurrent(parse(location.hash));
}
