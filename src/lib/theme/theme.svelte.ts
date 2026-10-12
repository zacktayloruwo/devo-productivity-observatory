// Theme: 'system' (follow prefers-color-scheme), 'light' or 'dark'.
// The choice persists in localStorage and is applied as data-theme on
// <html>; app.css keys every colour off that attribute plus the media query.

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Resolved = 'light' | 'dark';
const KEY = 'devo-obs.theme';

function stored(): ThemeChoice {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

const initialChoice = stored();
let choice = $state<ThemeChoice>(initialChoice);
let systemDark = $state<boolean>(media?.matches ?? false);
media?.addEventListener?.('change', (e) => { systemDark = e.matches; });

function apply(c: ThemeChoice) {
  if (typeof document === 'undefined') return;
  if (c === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', c);
}
apply(initialChoice);

export const theme = {
  get choice(): ThemeChoice { return choice; },
  get resolved(): Resolved { return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice; },
  get isDark(): boolean { return this.resolved === 'dark'; }
};

export function setTheme(c: ThemeChoice) {
  choice = c;
  apply(c);
  try { if (c === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch { /* ignore */ }
}

// A two-way switch: the opposite of what is showing.
export function cycleTheme() {
  setTheme(theme.isDark ? 'light' : 'dark');
}
