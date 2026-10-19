import type { IconDef } from '../shared/icons';

/**
 * Tiny DOM builder. YouTube enforces Trusted Types, so `innerHTML` is off
 * limits: everything is created with DOM APIs and text goes through
 * `textContent`, which also rules out HTML injection from video titles.
 */
type Props = {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: (Node | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    if (handler) el.addEventListener(type, handler);
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgIcon(icon: IconDef, className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', icon.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);
  for (const { d, fill, stroke } of icon.paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', fill ? 'currentColor' : 'none');
    if (stroke) {
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(stroke));
    }
    svg.append(path);
  }
  return svg;
}
