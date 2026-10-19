import { browser } from 'wxt/browser';
import { newId } from '../shared/ids';
import { isFinished, isWithinVideo } from '../shared/progress';
import type { Bookmark, Collection, Library, SyncMeta, Video, VideoMeta } from '../shared/types';
import { isValidVideoId } from '../shared/youtube';
import { bookmarkKey, collectionKey, isLibraryKey, KEY_PREFIX, videoKey } from './keys';
import { mergeRecord } from './merge';

/** Text limits. */
export const LIMITS = {
  title: 300,
  channel: 200,
  note: 2000,
  collectionName: 100,
} as const;

const clampText = (value: string, max: number) => value.trim().slice(0, max);
const clampSeconds = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

type Stored = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Low-level access
// ---------------------------------------------------------------------------

async function getOne<T>(key: string): Promise<T | undefined> {
  const result = (await browser.storage.local.get(key)) as Stored;
  return result[key] as T | undefined;
}

async function putMany(entries: Stored): Promise<void> {
  if (Object.keys(entries).length > 0) await browser.storage.local.set(entries);
}

/** Reads the whole library, tombstones included. */
export async function getRawLibrary(): Promise<Library> {
  const all = (await browser.storage.local.get(null)) as Stored;
  const library: Library = { collections: [], videos: [], bookmarks: [] };
  for (const [key, value] of Object.entries(all)) {
    if (!isLibraryKey(key) || !value || typeof value !== 'object') continue;
    if (key.startsWith(KEY_PREFIX.video)) library.videos.push(value as Video);
    else if (key.startsWith(KEY_PREFIX.bookmark)) library.bookmarks.push(value as Bookmark);
    else library.collections.push(value as Collection);
  }
  return library;
}

const alive = <T extends SyncMeta>(records: T[]) => records.filter((r) => r.deletedAt === null);

/** The library as the user sees it (no tombstones). */
export async function getLibrary(): Promise<Library> {
  const raw = await getRawLibrary();
  return {
    collections: alive(raw.collections),
    videos: alive(raw.videos),
    bookmarks: alive(raw.bookmarks),
  };
}

/**
 * Calls `listener` with the changed storage keys whenever library records
 * change in any context. Returns an unsubscribe function.
 */
export function watchLibrary(listener: (keys: string[]) => void): () => void {
  const handler = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'local') return;
    const keys = Object.keys(changes).filter(isLibraryKey);
    if (keys.length > 0) listener(keys);
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

function touch<T extends SyncMeta>(record: T, patch: Partial<NoInfer<T>>, now = Date.now()): T {
  return { ...record, ...patch, updatedAt: Math.max(now, record.updatedAt + 1) };
}

function freshMeta(now = Date.now()): SyncMeta {
  return { createdAt: now, updatedAt: now, deletedAt: null };
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export async function getVideo(id: string): Promise<Video | null> {
  const video = await getOne<Video>(videoKey(id));
  return video && video.deletedAt === null ? video : null;
}

/** Pins a video (or updates its resume point when it is already pinned). */
export async function pinVideo(meta: VideoMeta, position: number): Promise<Video> {
  if (!isValidVideoId(meta.id)) throw new Error('Invalid video id');
  const existing = await getOne<Video>(videoKey(meta.id));
  const duration = clampSeconds(meta.duration) || existing?.duration || 0;
  const pos = clampSeconds(position);
  const details = {
    title: clampText(meta.title, LIMITS.title) || existing?.title || meta.id,
    channel: clampText(meta.channel, LIMITS.channel) || existing?.channel || '',
    duration,
    position: pos,
  };

  let video: Video;
  if (existing && existing.deletedAt === null) {
    video = touch(existing, { ...details, completed: existing.completed || isFinished(pos, duration) });
  } else if (existing) {
    // Re-pinning a deleted video revives the same record, so the newer version wins any later merge.
    video = touch(existing, {
      ...details,
      collectionId: null,
      completed: isFinished(pos, duration),
      createdAt: Date.now(),
      deletedAt: null,
    });
  } else {
    video = {
      id: meta.id,
      ...details,
      collectionId: null,
      completed: isFinished(pos, duration),
      ...freshMeta(),
    };
  }
  await putMany({ [videoKey(video.id)]: video });
  return video;
}

/**
 * Auto-save of the resume point for an already pinned video.
 * Returns null when the video is not pinned. Skips no-op writes.
 */
export async function saveProgress(id: string, position: number, duration: number): Promise<Video | null> {
  const video = await getVideo(id);
  if (!video) return null;
  const pos = clampSeconds(position);
  const dur = clampSeconds(duration) || video.duration;
  if (Math.abs(video.position - pos) < 1 && video.duration === dur) return video;
  const updated = touch(video, {
    position: pos,
    duration: dur,
    completed: video.completed || isFinished(pos, dur),
  });
  await putMany({ [videoKey(id)]: updated });
  return updated;
}

/** Moves a video to a collection (or out of any) and/or marks it completed or not. */
export async function updateVideo(
  id: string,
  patch: Partial<Pick<Video, 'collectionId' | 'completed'>>,
): Promise<void> {
  const video = await getVideo(id);
  if (!video) return;
  await putMany({ [videoKey(id)]: touch(video, patch) });
}

/** Deletes a video together with its bookmarks. */
export async function deleteVideo(id: string): Promise<void> {
  const video = await getVideo(id);
  if (!video) return;
  const now = Date.now();
  const raw = await getRawLibrary();
  const entries: Stored = { [videoKey(id)]: touch(video, { deletedAt: now }, now) };
  for (const b of alive(raw.bookmarks)) {
    if (b.videoId === id) entries[bookmarkKey(b.id)] = touch(b, { deletedAt: now }, now);
  }
  await putMany(entries);
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/** Thrown when a bookmark is placed at a time that is not inside its video. */
export class BookmarkTimeError extends Error {
  constructor() {
    super('Bookmark time is outside the video');
    this.name = 'BookmarkTimeError';
  }
}

/** Thrown when the video already has a bookmark at that second. */
export class DuplicateBookmarkError extends Error {
  constructor() {
    super('A bookmark already exists at this time');
    this.name = 'DuplicateBookmarkError';
  }
}

/**
 * The bookmark of a video at the given second, if any. Times are compared by
 * whole seconds, the way they are displayed: 14:07.2 and 14:07.9 are the same moment.
 */
export async function findBookmarkAt(videoId: string, time: number): Promise<Bookmark | null> {
  const second = Math.floor(time);
  const { bookmarks } = await getLibrary();
  return bookmarks.find((b) => b.videoId === videoId && Math.floor(b.time) === second) ?? null;
}

/**
 * Adds a bookmark to a pinned video; the note may be empty. `duration` is the
 * video length reported by the player when the caller has it; the stored
 * length is used otherwise. Throws BookmarkTimeError or DuplicateBookmarkError.
 */
export async function addBookmark(videoId: string, time: number, note: string, duration?: number): Promise<Bookmark> {
  const video = await getVideo(videoId);
  if (!video) throw new Error('Video is not pinned');
  const length = clampSeconds(duration ?? 0) || video.duration;
  if (!Number.isFinite(time) || time < 0 || !isWithinVideo(time, length)) throw new BookmarkTimeError();
  if (await findBookmarkAt(videoId, time)) throw new DuplicateBookmarkError();

  const bookmark: Bookmark = { id: newId(), videoId, time, note: clampText(note, LIMITS.note), ...freshMeta() };
  await putMany({ [bookmarkKey(bookmark.id)]: bookmark });
  return bookmark;
}

export async function updateBookmarkNote(id: string, note: string): Promise<void> {
  const bookmark = await getOne<Bookmark>(bookmarkKey(id));
  if (!bookmark || bookmark.deletedAt !== null) return;
  const cleanNote = clampText(note, LIMITS.note);
  if (cleanNote === bookmark.note) return;
  await putMany({ [bookmarkKey(id)]: touch(bookmark, { note: cleanNote }) });
}

export async function deleteBookmark(id: string): Promise<void> {
  const bookmark = await getOne<Bookmark>(bookmarkKey(id));
  if (!bookmark || bookmark.deletedAt !== null) return;
  await putMany({ [bookmarkKey(id)]: touch(bookmark, { deletedAt: Date.now() }) });
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** Thrown when a collection is created or renamed with a name that is already used. */
export class DuplicateCollectionError extends Error {
  constructor() {
    super('A collection with this name already exists');
    this.name = 'DuplicateCollectionError';
  }
}

/** Names that differ only by letter case or surrounding/repeated spaces count as the same. */
export const collectionNameKey = (name: string) =>
  name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

async function assertNameIsFree(name: string, exceptId?: string): Promise<void> {
  const { collections } = await getLibrary();
  const key = collectionNameKey(name);
  if (collections.some((c) => c.id !== exceptId && collectionNameKey(c.name) === key))
    throw new DuplicateCollectionError();
}

/** Throws DuplicateCollectionError when the name is already taken. */
export async function createCollection(name: string): Promise<Collection> {
  const clean = clampText(name, LIMITS.collectionName) || 'Untitled';
  await assertNameIsFree(clean);
  const collection: Collection = { id: newId(), name: clean, ...freshMeta() };
  await putMany({ [collectionKey(collection.id)]: collection });
  return collection;
}

/** Throws DuplicateCollectionError when another collection already has the name. */
export async function renameCollection(id: string, name: string): Promise<void> {
  const collection = await getOne<Collection>(collectionKey(id));
  const clean = clampText(name, LIMITS.collectionName);
  if (!collection || collection.deletedAt !== null || !clean || clean === collection.name) return;
  await assertNameIsFree(clean, id);
  await putMany({ [collectionKey(id)]: touch(collection, { name: clean }) });
}

/** Deletes a collection. Its videos are kept and simply become unsorted. */
export async function deleteCollection(id: string): Promise<void> {
  const collection = await getOne<Collection>(collectionKey(id));
  if (!collection || collection.deletedAt !== null) return;
  const now = Date.now();
  const raw = await getRawLibrary();
  const entries: Stored = { [collectionKey(id)]: touch(collection, { deletedAt: now }, now) };
  for (const v of alive(raw.videos)) {
    if (v.collectionId === id) entries[videoKey(v.id)] = touch(v, { collectionId: null }, now);
  }
  await putMany(entries);
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * Merges records into the local library with last-write-wins.
 * Returns how many records were written.
 */
export async function mergeLibrary(incoming: Library): Promise<number> {
  const all = (await browser.storage.local.get(null)) as Stored;
  const entries: Stored = {};
  const merge = <T extends SyncMeta>(key: string, record: T) => {
    const next = mergeRecord(all[key] as T | undefined, record);
    if (next) entries[key] = next;
  };
  for (const c of incoming.collections) merge(collectionKey(c.id), c);
  for (const v of incoming.videos) merge(videoKey(v.id), v);
  for (const b of incoming.bookmarks) merge(bookmarkKey(b.id), b);
  await putMany(entries);
  return Object.keys(entries).length;
}

/** Removes tombstones older than `maxAgeMs` so deleted records do not pile up forever. */
export async function purgeTombstones(maxAgeMs: number): Promise<void> {
  const raw = await getRawLibrary();
  const cutoff = Date.now() - maxAgeMs;
  const keys: string[] = [];
  const collect = <T extends SyncMeta & { id: string }>(records: T[], keyOf: (id: string) => string) => {
    for (const r of records) {
      if (r.deletedAt !== null && r.deletedAt < cutoff) keys.push(keyOf(r.id));
    }
  };
  collect(raw.collections, collectionKey);
  collect(raw.videos, videoKey);
  collect(raw.bookmarks, bookmarkKey);
  if (keys.length > 0) await browser.storage.local.remove(keys);
}

/** Deletes every video, bookmark and collection. */
export async function deleteAllRecords(): Promise<void> {
  const raw = await getRawLibrary();
  const now = Date.now();
  const entries: Stored = {};
  for (const c of alive(raw.collections)) entries[collectionKey(c.id)] = touch(c, { deletedAt: now }, now);
  for (const v of alive(raw.videos)) entries[videoKey(v.id)] = touch(v, { deletedAt: now }, now);
  for (const b of alive(raw.bookmarks)) entries[bookmarkKey(b.id)] = touch(b, { deletedAt: now }, now);
  await putMany(entries);
}
