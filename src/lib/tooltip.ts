// Hover boxes (tippy.js), styled with the app's tokens (app.css, theme "obs").
//
//   <span use:tip={'text'}>…</span>                 plain text
//   <span use:tip={{ html: `<b>${esc(x)}</b>` }}>   HTML built here, escaped
import tippy, { type Instance, type Props } from 'tippy.js';
import 'tippy.js/dist/tippy.css';

export type TipContent = string | { html: string } | null | undefined;

const BASE: Partial<Props> = {
  theme: 'obs', delay: [200, 0], duration: [120, 80], maxWidth: 340, appendTo: () => document.body
};

export { esc } from './util/esc';

function props(c: NonNullable<TipContent>): Partial<Props> {
  return typeof c === 'string' ? { content: c, allowHTML: false } : { content: c.html, allowHTML: true };
}

export function tip(node: HTMLElement | SVGElement, content: TipContent) {
  let inst: Instance | null = null;
  function apply(c: TipContent) {
    if (!c) { inst?.destroy(); inst = null; return; }
    if (inst) inst.setProps(props(c));
    else inst = tippy(node as Element, { ...BASE, ...props(c) });
  }
  apply(content);
  return { update: apply, destroy() { inst?.destroy(); inst = null; } };
}

// A box not attached to an element: show(x, y, content) at client coordinates.
export function floatingTip() {
  let at = { x: 0, y: 0 };
  const inst = tippy(document.createElement('div'), {
    ...BASE, delay: 0, trigger: 'manual', placement: 'top', offset: [0, 12],
    getReferenceClientRect: () => new DOMRect(at.x, at.y, 0, 0)
  });
  let last = '';
  return {
    show(x: number, y: number, content: NonNullable<TipContent>) {
      at = { x, y };
      const key = typeof content === 'string' ? 't:' + content : 'h:' + content.html;
      if (key !== last) { inst.setProps(props(content)); last = key; }
      if (!inst.state.isVisible) inst.show();
      inst.popperInstance?.update();
    },
    hide() { inst.hide(); },
    destroy() { inst.destroy(); }
  };
}
