import { BOOKMARK_ADD, PIN_FILLED, PIN_OUTLINE, type IconDef } from '../shared/icons';
import { h, svgIcon } from './dom';
import { getRightControls } from './youtube-page';

const STYLE_ID = 'pintube-button-style';
const STYLES = `
.pintube-button { display: inline-flex !important; align-items: center; justify-content: center; vertical-align: top; }
.pintube-button[hidden] { display: none !important; }
.pintube-button svg { width: 24px; height: 24px; color: #fff; transition: transform 120ms ease; }
/* The pin fills its whole frame, unlike the icons around it: draw it smaller so it looks the same size. */
.pintube-button.pintube-pin svg { width: 20px; height: 20px; }
.pintube-button:hover svg { transform: scale(1.1); }
.pintube-button.pintube-pinned svg { color: #fa003f; }
`;

export interface PlayerButtonLabels {
  pin: string;
  bookmark: string;
}

/**
 * The buttons inserted into YouTube's player controls: the pin and, once the
 * video is pinned, a bookmark button just before it.
 */
export class PlayerButtons {
  private pin: HTMLButtonElement | null = null;
  private bookmark: HTMLButtonElement | null = null;
  private pinned = false;
  private labels: PlayerButtonLabels = { pin: '', bookmark: '' };
  /** What is currently in the DOM, so nothing is redrawn unless it changed. */
  private rendered: { pinned: boolean; labels: PlayerButtonLabels } | null = null;

  constructor(private readonly actions: { onPin: () => void; onBookmark: () => void }) {}

  /** Inserts the buttons when YouTube's controls are present (idempotent). */
  ensureMounted(labels: PlayerButtonLabels): void {
    this.labels = labels;
    const controls = getRightControls();
    if (!controls) return;
    if (!document.getElementById(STYLE_ID)) {
      document.head.append(h('style', { attrs: { id: STYLE_ID }, text: STYLES }));
    }
    this.pin ??= this.createButton('pintube-pin', this.actions.onPin);
    this.bookmark ??= this.createButton('pintube-bookmark', this.actions.onBookmark, BOOKMARK_ADD);
    if (this.pin.parentElement !== controls || this.bookmark.nextElementSibling !== this.pin) {
      controls.prepend(this.bookmark, this.pin);
    }
    this.render();
  }

  unmount(): void {
    this.pin?.remove();
    this.bookmark?.remove();
  }

  setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.render();
  }

  private createButton(className: string, onClick: () => void, icon?: IconDef): HTMLButtonElement {
    return h(
      'button',
      {
        className: `ytp-button pintube-button ${className}`,
        on: {
          click: (event) => {
            event.stopPropagation();
            onClick();
          },
        },
      },
      [icon && svgIcon(icon)],
    );
  }

  private render(): void {
    const { pin, bookmark, pinned, labels, rendered } = this;
    if (!pin || !bookmark) return;
    if (
      rendered?.pinned === pinned &&
      rendered.labels.pin === labels.pin &&
      rendered.labels.bookmark === labels.bookmark
    ) {
      return;
    }
    this.rendered = { pinned, labels };

    pin.classList.toggle('pintube-pinned', pinned);
    pin.setAttribute('aria-label', labels.pin);
    pin.setAttribute('title', labels.pin);
    pin.setAttribute('aria-pressed', String(pinned));
    pin.replaceChildren(svgIcon(pinned ? PIN_FILLED : PIN_OUTLINE));

    bookmark.hidden = !pinned;
    bookmark.setAttribute('aria-label', labels.bookmark);
    bookmark.setAttribute('title', labels.bookmark);
  }
}
