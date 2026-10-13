// Compiles text/app_text.csv (every descriptive passage the site shows) into
// src/lib/text/generated/strings.json, and refuses to build when the table
// and the code disagree:
//   - every key must be unique and have text;
//   - every key the code uses (t('key'), <Text k="key">) must be in the table;
//   - keys in the table that nothing uses are reported (a warning only).
// Runs at the start of `npm run dev`, `npm run build` and `npm run check`.
//
// The table is a plain CSV (key, text, context, notes) that Excel opens and
// saves; placeholders are {name}; light markup is **bold**, *italic*,
// `code`, [label](https://url) and [label](view:name) for a link to a view.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'text', 'app_text.csv');
const out = join(root, 'src', 'lib', 'text', 'generated', 'strings.json');

// RFC 4180 CSV: quoted fields with doubled quotes and embedded newlines
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(src, 'utf8'));
const header = rows.shift().map((h) => h.trim().toLowerCase());
const ki = header.indexOf('key'), ti = header.indexOf('text');
if (ki < 0 || ti < 0) { console.error('text/app_text.csv needs "key" and "text" columns'); process.exit(1); }

const strings = {};
const errors = [];
rows.forEach((r, i) => {
  const key = (r[ki] ?? '').trim(), text = (r[ti] ?? '').trim();
  if (!key) { errors.push(`row ${i + 2}: empty key`); return; }
  if (!/^[a-z0-9_.]+$/.test(key)) errors.push(`row ${i + 2}: key "${key}" may only use a-z, 0-9, _ and .`);
  if (key in strings) errors.push(`row ${i + 2}: duplicate key "${key}"`);
  if (!text) errors.push(`row ${i + 2}: "${key}" has no text`);
  strings[key] = text;
});

// keys the code refers to
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === 'generated' || n === 'node_modules' || n === 't.ts') continue;
    if (statSync(p).isDirectory()) walk(p, acc); else if (/\.(svelte|ts)$/.test(n)) acc.push(p);
  }
  return acc;
}
const used = new Set();
const prefixes = new Set();   // t('geo.' + level): every key with the prefix counts as used
for (const f of walk(join(root, 'src'))) {
  const code = readFileSync(f, 'utf8');
  for (const m of code.matchAll(/\bt\(\s*'([a-z0-9_.]+)'\s*([,)+])/g)) (m[2] === '+' ? prefixes : used).add(m[1]);
  for (const m of code.matchAll(/<Text\b[^>]*\bk="([a-z0-9_.]+)"/g)) used.add(m[1]);
  for (const m of code.matchAll(/\bk=\{?'([a-z0-9_.]+)'/g)) used.add(m[1]);
  // keys chosen at run time: t(cond ? 'a' : 'b')
  for (const m of code.matchAll(/\bt\([^)]*?\?\s*'([a-z0-9_.]+)'\s*:\s*'([a-z0-9_.]+)'/g)) { used.add(m[1]); used.add(m[2]); }
}
for (const p of prefixes) {
  const hits = Object.keys(strings).filter((k) => k.startsWith(p));
  if (!hits.length) errors.push(`the code builds keys from "${p}" but text/app_text.csv has no row starting with it`);
  hits.forEach((k) => used.add(k));
}
for (const k of used) if (!(k in strings)) errors.push(`the code uses "${k}" but text/app_text.csv has no such row`);
const unused = Object.keys(strings).filter((k) => !used.has(k));

if (errors.length) { console.error('text/app_text.csv:\n  ' + errors.join('\n  ')); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(strings, null, 2) + '\n');
console.log(`text: ${Object.keys(strings).length} strings -> src/lib/text/generated/strings.json` + (unused.length ? `\n  unused: ${unused.join(', ')}` : ''));
