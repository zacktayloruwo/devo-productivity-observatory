// The site's descriptive text, from text/app_text.csv (compiled by
// tools/text_compile.mjs into generated/strings.json).
//
//   t('key', { country: 'Spain' })   the text with {placeholders} filled, markup removed
//   parse(t(...))                    the text as inline nodes for Text.svelte
//
// Markup: **bold**, *italic*, `code`, [label](https://url),
// [label](view:productivity) for a link to a view of the current country.
import strings from './generated/strings.json';

export type Vars = Record<string, string | number | null | undefined>;
export type Node =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em' | 'code'; text: string }
  | { kind: 'link'; label: string; href: string; view?: string };

const TABLE: Record<string, string> = strings;

function fill(key: string, vars: Vars = {}): string {
  const s = TABLE[key];
  if (s === undefined) {
    if (import.meta.env.DEV) console.warn(`text: no string for "${key}"`);
    return key;
  }
  return s.replace(/\{([a-z0-9_]+)\}/g, (m, name) => {
    const v = vars[name];
    if (v === undefined || v === null) { if (import.meta.env.DEV) console.warn(`text: "${key}" has no value for {${name}}`); return m; }
    return String(v);
  });
}

// the raw string with placeholders filled and markup kept (for Text.svelte)
export function raw(key: string, vars?: Vars): string { return fill(key, vars); }

// plain text: markup removed, link labels kept
export function t(key: string, vars?: Vars): string {
  return parse(fill(key, vars)).map((n) => (n.kind === 'link' ? n.label : n.text)).join('');
}

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
export function parse(s: string): Node[] {
  const out: Node[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index! > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1] !== undefined) {
      const target = m[2];
      out.push(target.startsWith('view:') ? { kind: 'link', label: m[1], href: '', view: target.slice(5) } : { kind: 'link', label: m[1], href: target });
    } else if (m[3] !== undefined) out.push({ kind: 'strong', text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: 'em', text: m[4] });
    else out.push({ kind: 'code', text: m[5] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}
