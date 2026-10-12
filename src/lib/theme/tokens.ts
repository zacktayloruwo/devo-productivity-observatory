// Read the resolved colour tokens from CSS so Plot and the map draw with the
// same palette the DOM uses, in whichever theme is active.

export const TOKEN_NAMES = [
  'bg', 'panel', 'panel-2', 'line', 'line-2', 'fg', 'fg-2', 'fg-3', 'accent', 'accent-bg', 'accent-deep',
  'focal', 'focal-bg', 'water', 'land', 'neutral', 'neutral-line', 'good', 'warn', 'bad', 'focus', 'covid'
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Record<TokenName, string> & { sans: string; serif: string };

export function readTokens(el: Element = document.documentElement): Tokens {
  const cs = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const n of TOKEN_NAMES) out[n] = cs.getPropertyValue('--' + n).trim();
  out.sans = cs.getPropertyValue('--sans').trim();
  out.serif = cs.getPropertyValue('--serif').trim();
  return out as Tokens;
}

// Fire `cb` whenever the resolved theme may have changed. Returns an unsubscribe.
export function onThemeChange(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  const h = () => cb();
  mq?.addEventListener?.('change', h);
  return () => { mo.disconnect(); mq?.removeEventListener?.('change', h); };
}
