import { browser, type Browser } from 'wxt/browser';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/** Requests handled by the background worker. */
export type BackgroundApi = {
  'ui.openLibrary': { req: void; res: void };
};

/** State of the YouTube video playing in a tab. */
export interface TabVideoState {
  videoId: string;
  title: string;
  currentTime: number;
  pinned: boolean;
  position: number | null;
}

/** Requests handled by the YouTube content script. */
export type TabApi = {
  'tab.getState': { req: void; res: TabVideoState | null };
  'tab.saveProgress': { req: void; res: TabVideoState | null };
  /** Jumps to a moment of the given video. False when the tab shows another video by now. */
  'tab.seek': { req: { videoId: string; time: number }; res: boolean };
};

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

interface Envelope {
  type: string;
  payload?: unknown;
}

type Reply<T> = { ok: true; data: T } | { ok: false };

type Api = Record<string, { req: unknown; res: unknown }>;
type Args<A extends Api, K extends keyof A> = A[K]['req'] extends void ? [] : [payload: A[K]['req']];

export type Handlers<A extends Api> = {
  [K in keyof A]: (payload: A[K]['req'], sender: Browser.runtime.MessageSender) => Promise<A[K]['res']>;
};

function unwrap<T>(reply: Reply<T> | undefined): T {
  if (!reply?.ok) throw new Error('Request failed');
  return reply.data;
}

export async function callBackground<K extends keyof BackgroundApi>(
  type: K,
  ...args: Args<BackgroundApi, K>
): Promise<BackgroundApi[K]['res']> {
  const reply = (await browser.runtime.sendMessage({ type, payload: args[0] } satisfies Envelope)) as
    Reply<BackgroundApi[K]['res']> | undefined;
  return unwrap(reply);
}

export async function callTab<K extends keyof TabApi>(
  tabId: number,
  type: K,
  ...args: Args<TabApi, K>
): Promise<TabApi[K]['res']> {
  const reply = (await browser.tabs.sendMessage(tabId, { type, payload: args[0] } satisfies Envelope)) as
    Reply<TabApi[K]['res']> | undefined;
  return unwrap(reply);
}

/**
 * Registers typed handlers. Uses `sendResponse` + `return true`, which works
 * the same way in every browser.
 */
export function listen<A extends Api>(handlers: Handlers<A>): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    const envelope = message as Envelope | undefined;
    if (!envelope || typeof envelope.type !== 'string' || !Object.hasOwn(handlers, envelope.type)) {
      return false;
    }
    const type = envelope.type as keyof A;
    handlers[type](envelope.payload as A[keyof A]['req'], sender).then(
      (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
      (error: unknown) => {
        console.error(`[PinTube] ${String(type)} failed`, error);
        sendResponse({ ok: false } satisfies Reply<never>);
      },
    );
    return true; // Keep the channel open for the async response.
  });
}
