/**
 * Every record lives under its own key in `browser.storage.local`. Small keys
 * mean several contexts (YouTube tab, popup, library page) can write at the
 * same time without overwriting each other's changes.
 */
export const KEY_PREFIX = {
  video: 'v:',
  bookmark: 'b:',
  collection: 'c:',
} as const;

export const STORAGE_KEYS = {
  settings: 'settings',
} as const;

export const videoKey = (id: string) => `${KEY_PREFIX.video}${id}`;
export const bookmarkKey = (id: string) => `${KEY_PREFIX.bookmark}${id}`;
export const collectionKey = (id: string) => `${KEY_PREFIX.collection}${id}`;

export function isLibraryKey(key: string): boolean {
  return (
    key.startsWith(KEY_PREFIX.video) || key.startsWith(KEY_PREFIX.bookmark) || key.startsWith(KEY_PREFIX.collection)
  );
}
