import { PIN_FILLED } from '../shared/icons';
import { h, svgIcon } from './dom';
import { getPlayer } from './youtube-page';

export interface ToastAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

interface ShowOptions {
  message: string;
  actions?: ToastAction[];
  /** Auto-hide delay; 0 keeps the toast until an action or dismissal. */
  durationMs?: number;
  onDismiss?: () => void;
}

interface PromptOptions {
  message: string;
  /** Text already in the field when the prompt opens. */
  value?: string;
  placeholder: string;
  submitLabel: string;
  cancelLabel: string;
}

const STYLES = `
:host { all: initial; }
.toast {
  position: absolute; top: 16px; inset-inline-start: 16px; z-index: 2147483000;
  display: flex; flex-direction: column; gap: 10px; max-width: min(360px, calc(100% - 32px));
  padding: 12px 14px; border-radius: 12px; box-sizing: border-box;
  background: rgba(20, 20, 24, 0.94); color: #fff; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  font: 500 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
  animation: in 160ms ease-out;
}
.toast.fixed { position: fixed; }
@keyframes in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.row { display: flex; align-items: center; gap: 10px; }
.icon { width: 18px; height: 18px; color: #fa003f; flex: none; }
.message { flex: 1; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
button {
  font: inherit; font-size: 13px; cursor: pointer; border-radius: 8px; padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.22); background: transparent; color: #fff;
}
button:hover { background: rgba(255, 255, 255, 0.1); }
button.primary { background: #fa003f; border-color: #fa003f; }
button.primary:hover { background: #d40036; border-color: #d40036; }
button.close { border: none; padding: 2px 6px; font-size: 18px; line-height: 1; opacity: 0.7; }
button:focus-visible, input:focus-visible { outline: 2px solid #fa003f; outline-offset: 2px; }
input {
  font: inherit; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.08); color: #fff;
}
input::placeholder { color: rgba(255, 255, 255, 0.55); }
`;

/**
 * Notification shown inside the YouTube player (so it stays visible in full
 * screen). Rendered in a closed shadow root: YouTube's CSS cannot affect it
 * and the page cannot read it.
 */
export class Toast {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private timer: number | undefined;
  private cancelPrompt: (() => void) | null = null;
  /** Removes the listeners added to `window` in `mount`. */
  private windowListeners: AbortController | null = null;
  private dir: 'ltr' | 'rtl' = 'ltr';
  private dismissLabel = 'Dismiss';

  configure(dir: 'ltr' | 'rtl', dismissLabel: string): void {
    this.dir = dir;
    this.dismissLabel = dismissLabel;
  }

  private mount(): ShadowRoot {
    const container = getPlayer() ?? document.body;
    if (!this.host || !this.root) {
      this.host = h('div', { attrs: { 'data-pintube': 'toast' } });
      this.root = this.host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = STYLES;
      this.root.append(style);
      // Keep YouTube keyboard shortcuts (space, k, f, …) from firing while typing a note.
      const host = this.host;
      this.windowListeners = new AbortController();
      const { signal } = this.windowListeners;
      for (const type of ['keydown', 'keyup', 'keypress'] as const) {
        host.addEventListener(type, (event) => event.stopPropagation());
        window.addEventListener(
          type,
          (event) => {
            if (event.composedPath().includes(host)) event.stopImmediatePropagation();
          },
          { capture: true, signal },
        );
      }
    }
    if (this.host.parentElement !== container) container.append(this.host);
    return this.root;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root?.querySelector('.toast')?.remove();
    // A prompt replaced by another toast counts as cancelled.
    const cancel = this.cancelPrompt;
    this.cancelPrompt = null;
    cancel?.();
  }

  show({ message, actions = [], durationMs = 4000, onDismiss }: ShowOptions): void {
    const root = this.mount();
    this.hide();
    const dismiss = () => {
      this.hide();
      onDismiss?.();
    };
    const buttons = actions.map((action) =>
      h('button', {
        className: action.primary ? 'primary' : '',
        text: action.label,
        on: {
          click: () => {
            this.hide();
            action.run();
          },
        },
      }),
    );
    const toast = h('div', { className: this.toastClass(), attrs: { dir: this.dir, role: 'status' } }, [
      h('div', { className: 'row' }, [
        svgIcon(PIN_FILLED, 'icon'),
        h('span', { className: 'message', text: message }),
        h('button', {
          className: 'close',
          text: '×',
          attrs: { 'aria-label': this.dismissLabel },
          on: { click: dismiss },
        }),
      ]),
      buttons.length > 0 ? h('div', { className: 'actions' }, buttons) : null,
    ]);
    root.append(toast);
    if (durationMs > 0) this.timer = window.setTimeout(dismiss, durationMs);
  }

  /** Asks for a short text, which may be left empty. Resolves with the text, or null when cancelled. */
  prompt({ message, value = '', placeholder, submitLabel, cancelLabel }: PromptOptions): Promise<string | null> {
    const root = this.mount();
    this.hide();
    return new Promise((resolve) => {
      const finish = (value: string | null) => {
        this.cancelPrompt = null;
        this.hide();
        resolve(value);
      };
      const input = h('input', { attrs: { type: 'text', placeholder, maxlength: '2000', 'aria-label': placeholder } });
      input.value = value;
      const form = h('form', { className: this.toastClass(), attrs: { dir: this.dir } }, [
        h('div', { className: 'row' }, [
          svgIcon(PIN_FILLED, 'icon'),
          h('span', { className: 'message', text: message }),
        ]),
        input,
        h('div', { className: 'actions' }, [
          h('button', { text: cancelLabel, attrs: { type: 'button' }, on: { click: () => finish(null) } }),
          h('button', { className: 'primary', text: submitLabel, attrs: { type: 'submit' } }),
        ]),
      ]);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        finish(input.value.trim());
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') finish(null);
      });
      root.append(form);
      this.cancelPrompt = () => resolve(null);
      input.focus();
    });
  }

  destroy(): void {
    this.hide();
    this.windowListeners?.abort();
    this.windowListeners = null;
    this.host?.remove();
    this.host = null;
    this.root = null;
  }

  private toastClass(): string {
    return this.host?.parentElement === document.body ? 'toast fixed' : 'toast';
  }
}
