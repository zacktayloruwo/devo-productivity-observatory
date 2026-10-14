// Running text (.prose) flows into columns only when it is long enough:
// the number of columns is the largest that the width allows (columns at
// least MIN_CH characters wide) and that still gives every column at least
// MIN_LINES lines. Short passages stay in one column.
//
// Installed once (main.ts): every .prose element already in the page or
// added later is measured on first sight, on resize and when its text changes.
const MIN_LINES = 3;
const MIN_CH = 34;

let canvas: HTMLCanvasElement | null = null;
function chWidth(cs: CSSStyleDeclaration): number {
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return parseFloat(cs.fontSize) * 0.55;
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText('0').width;
}

function layout(node: HTMLElement) {
  node.style.columnCount = '1';
  const cs = getComputedStyle(node);
  const width = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const gap = parseFloat(cs.columnGap) || 32;
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
  // the text's height in one full-width column (headings span every column)
  let textHeight = 0;
  node.querySelectorAll<HTMLElement>('p, li, dl').forEach((el) => {
    const m = getComputedStyle(el);
    textHeight += el.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom);
  });
  const lines = textHeight / lineHeight;
  const minCol = MIN_CH * chWidth(cs);
  const maxCols = Math.max(1, Math.floor((width + gap) / (minCol + gap)));
  let cols = 1;
  for (let k = maxCols; k > 1; k--) {
    const colWidth = (width - (k - 1) * gap) / k;
    // the same text in narrower columns takes proportionally more lines
    if ((lines * width) / colWidth / k >= MIN_LINES) { cols = k; break; }
  }
  node.style.columnCount = String(cols);
}

export function installProseColumns() {
  const seen = new WeakSet<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let frame = 0;
  const schedule = (el: HTMLElement) => {
    pending.add(el);
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      for (const n of pending) if (n.isConnected) layout(n);
      pending.clear();
    });
  };
  const widths = new WeakMap<Element, number>();
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const w = Math.round(e.contentRect.width);
      if (widths.get(e.target) !== w) { widths.set(e.target, w); schedule(e.target as HTMLElement); }
    }
  });
  const watch = (el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    ro.observe(el);
    new MutationObserver(() => schedule(el)).observe(el, { childList: true, subtree: true, characterData: true });
    schedule(el);
  };
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>('.prose').forEach(watch);
  scan(document);
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => {
      if (n instanceof HTMLElement) { if (n.classList.contains('prose')) watch(n); scan(n); }
    });
  }).observe(document.body, { childList: true, subtree: true });
  // fonts change line heights once they load
  document.fonts?.ready.then(() => document.querySelectorAll<HTMLElement>('.prose').forEach(schedule));
}
