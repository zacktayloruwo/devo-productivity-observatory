// Client-side CSV of what a table shows.

export interface CsvColumn<T = any> { key: string; label: string; value?: (row: T) => unknown }

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const head = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value ? c.value(r) : (r as any)[c.key])).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

export function downloadCsv<T>(name: string, columns: CsvColumn<T>[], rows: T[]): void {
  const blob = new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name.endsWith('.csv') ? name : name + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
