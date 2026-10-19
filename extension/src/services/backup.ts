import { z } from 'zod';
import { collectionNameKey, LIMITS } from '../storage/repository';
import type { Bookmark, Collection, Library, SyncMeta, Video } from '../shared/types';
import { isWithinVideo } from '../shared/progress';
import { formatTime } from '../shared/time';
import { watchUrl } from '../shared/youtube';

// Extension pages forbid eval (Content Security Policy): tell zod not to try it.
z.config({ jitless: true });

export const BACKUP_APP = 'pintube';
export const BACKUP_VERSION = 1;

// ---------------------------------------------------------------------------
// Schema: imported files are untrusted input, validate everything.
// ---------------------------------------------------------------------------

const MAX_RECORDS = 50_000;
const timestamp = z.number().int().nonnegative().max(8.64e15);
const seconds = z.number().finite().nonnegative().max(1e7);
const uuid = z.uuid();
const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => s.trim().slice(0, max));

const meta = {
  createdAt: timestamp,
  updatedAt: timestamp,
};

const collectionSchema = z.object({
  id: uuid,
  name: text(LIMITS.collectionName).pipe(z.string().min(1)),
  ...meta,
});

const videoSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: text(LIMITS.title),
  channel: text(LIMITS.channel).default(''),
  duration: seconds.default(0),
  position: seconds.default(0),
  collectionId: uuid.nullable().default(null),
  completed: z.boolean().default(false),
  ...meta,
});

const bookmarkSchema = z.object({
  id: uuid,
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  time: seconds,
  note: text(LIMITS.note).default(''),
  ...meta,
});

/** The file as a whole. Records are checked one by one afterwards, so a damaged one does not cost the rest. */
const recordList = z.array(z.unknown()).max(MAX_RECORDS).default([]);
const envelopeSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().positive(),
  collections: recordList,
  videos: recordList,
  bookmarks: recordList,
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const stripSync = <T extends SyncMeta>({ deletedAt: _deletedAt, ...rest }: T) => rest;

export function createBackup(library: Library, now = new Date()): string {
  const backup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    collections: library.collections.map(stripSync),
    videos: library.videos.map(stripSync),
    bookmarks: library.bookmarks.map(stripSync),
  };
  return JSON.stringify(backup, null, 2);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** The file is not a PinTube backup: not JSON, another format, or nothing usable in it. */
export class InvalidBackupError extends Error {
  constructor() {
    super('Invalid PinTube backup');
    this.name = 'InvalidBackupError';
  }
}

/** The backup was written by a newer version of PinTube than this one can read. */
export class UnsupportedBackupError extends Error {
  constructor() {
    super('Backup made by a newer version of PinTube');
    this.name = 'UnsupportedBackupError';
  }
}

export interface ParsedBackup {
  library: Library;
  /** Records left out because they were damaged or pointed to nothing. */
  skipped: number;
}

type Identified = SyncMeta & { id: string };

const alive = <T extends SyncMeta>(records: T[]) => records.filter((r) => r.deletedAt === null);

/** When a file lists the same record twice, its most recent version counts. */
function newestById<T extends Identified>(records: T[]): T[] {
  const byId = new Map<string, T>();
  for (const record of records) {
    const seen = byId.get(record.id);
    if (!seen || record.updatedAt > seen.updatedAt) byId.set(record.id, record);
  }
  return [...byId.values()];
}

/** A video has at most one bookmark per second (see `findBookmarkAt`). */
const secondKey = (b: Pick<Bookmark, 'videoId' | 'time'>) => `${b.videoId}:${Math.floor(b.time)}`;

/** Of two bookmarks on the same second, the one with a note wins, then the most recent. */
function preferredBookmark(a: Bookmark, b: Bookmark): Bookmark {
  if (Boolean(a.note) !== Boolean(b.note)) return a.note ? a : b;
  return b.updatedAt > a.updatedAt ? b : a;
}

/**
 * Reads a backup file and returns the records it holds, cleaned up so that
 * they respect the same rules as records created in the app:
 * damaged records are skipped one by one instead of rejecting the whole file,
 * and duplicates inside the file (same id, same collection name, same second
 * of a video) are folded into one.
 *
 * Throws InvalidBackupError or UnsupportedBackupError.
 */
export function parseBackup(json: string, now = Date.now()): ParsedBackup {
  let data: unknown;
  try {
    // Some editors save a byte order mark that JSON.parse refuses.
    data = JSON.parse(json.replace(/^﻿/, ''));
  } catch {
    throw new InvalidBackupError();
  }
  const envelope = envelopeSchema.safeParse(data);
  if (!envelope.success) throw new InvalidBackupError();
  if (envelope.data.version > BACKUP_VERSION) throw new UnsupportedBackupError();

  let skipped = 0;
  const valid = <S extends z.ZodType>(schema: S, items: unknown[]): z.output<S>[] => {
    const records: z.output<S>[] = [];
    for (const item of items) {
      const result = schema.safeParse(item);
      if (result.success) records.push(result.data);
      else skipped++;
    }
    return records;
  };
  // A date in the future would make a record win every later merge.
  const stamps = (r: { createdAt: number; updatedAt: number }) => ({
    createdAt: Math.min(r.createdAt, now),
    updatedAt: Math.min(r.updatedAt, now),
    deletedAt: null,
  });

  // Collections: one per name. The oldest keeps its id and the others become aliases of it.
  const collections: Collection[] = [];
  const collectionAlias = new Map<string, string>();
  const collectionByName = new Map<string, Collection>();
  const parsedCollections = newestById(
    valid(collectionSchema, envelope.data.collections).map((c) => ({ ...c, ...stamps(c) })),
  );
  for (const collection of parsedCollections.sort((a, b) => a.createdAt - b.createdAt)) {
    const key = collectionNameKey(collection.name);
    const kept = collectionByName.get(key);
    if (kept) {
      collectionAlias.set(collection.id, kept.id);
    } else {
      collectionByName.set(key, collection);
      collections.push(collection);
    }
  }

  // Videos. A collection id that is not in the file is kept for now: the
  // collection may exist in the library the backup is imported into.
  const videos: Video[] = newestById(
    valid(videoSchema, envelope.data.videos).map((v) => ({
      ...v,
      title: v.title || v.id,
      position: v.duration > 0 ? Math.min(v.position, v.duration) : v.position,
      collectionId: v.collectionId === null ? null : (collectionAlias.get(v.collectionId) ?? v.collectionId),
      ...stamps(v),
    })),
  );

  // Bookmarks: only for videos of the file, inside the video, one per second.
  const durations = new Map(videos.map((v) => [v.id, v.duration]));
  const bookmarkBySecond = new Map<string, Bookmark>();
  for (const bookmark of newestById(
    valid(bookmarkSchema, envelope.data.bookmarks).map((b) => ({ ...b, ...stamps(b) })),
  )) {
    const duration = durations.get(bookmark.videoId);
    if (duration === undefined || !isWithinVideo(bookmark.time, duration)) {
      skipped++;
      continue;
    }
    const key = secondKey(bookmark);
    const kept = bookmarkBySecond.get(key);
    bookmarkBySecond.set(key, kept ? preferredBookmark(kept, bookmark) : bookmark);
  }
  const bookmarks = [...bookmarkBySecond.values()];

  // Records were found, but not a single one could be read: this is not a usable backup.
  if (skipped > 0 && collections.length + videos.length + bookmarks.length === 0) throw new InvalidBackupError();
  return { library: { collections, videos, bookmarks }, skipped };
}

/**
 * Fits the records of a backup to the library they are imported into
 * (`local`, tombstones included), so that importing never creates what the
 * app itself refuses to create:
 *
 * - a collection whose name is already used here is not added a second time:
 *   its videos join the collection that has the name;
 * - a bookmark on a second that is already bookmarked here is not added
 *   either: the existing bookmark stays and takes the better note;
 * - importing is an explicit "restore", so records deleted here come back,
 *   even when the deletion is more recent than the backup.
 *
 * The result is ready for `mergeLibrary`.
 */
export function prepareImport(incoming: Library, local: Library, now = Date.now()): Library {
  // Collections ---------------------------------------------------------------
  const localCollections = alive(local.collections);
  const localCollectionIds = new Set(localCollections.map((c) => c.id));
  const localByName = new Map(localCollections.map((c) => [collectionNameKey(c.name), c]));
  const alias = new Map<string, string>();
  const collections = incoming.collections.filter((collection) => {
    const owner = localByName.get(collectionNameKey(collection.name));
    if (!owner || owner.id === collection.id) return true;
    // The name belongs to another collection of this library. A collection
    // that is new here merges into it; one that already exists here under
    // another name simply keeps that name.
    if (!localCollectionIds.has(collection.id)) alias.set(collection.id, owner.id);
    return false;
  });
  const knownCollections = new Set([...localCollectionIds, ...collections.map((c) => c.id)]);

  // Videos --------------------------------------------------------------------
  const videos = incoming.videos.map((video) => {
    const id = video.collectionId === null ? null : (alias.get(video.collectionId) ?? video.collectionId);
    return { ...video, collectionId: id !== null && knownCollections.has(id) ? id : null };
  });

  // Bookmarks -----------------------------------------------------------------
  const localBookmarks = alive(local.bookmarks);
  const localBookmarkIds = new Set(localBookmarks.map((b) => b.id));
  const localBySecond = new Map(localBookmarks.map((b) => [secondKey(b), b]));
  const bookmarks: Bookmark[] = [];
  for (const bookmark of incoming.bookmarks) {
    const taken = localBySecond.get(secondKey(bookmark));
    if (!taken || localBookmarkIds.has(bookmark.id)) {
      bookmarks.push(bookmark); // A free second, or the very same bookmark: a normal merge.
    } else if (preferredBookmark(taken, bookmark) === bookmark && bookmark.note !== taken.note) {
      bookmarks.push({ ...taken, note: bookmark.note, updatedAt: Math.max(now, taken.updatedAt + 1) });
    }
  }

  // Restore what was deleted here ----------------------------------------------
  const revive = <T extends Identified>(records: T[], localRecords: T[]): T[] => {
    const deleted = new Map(localRecords.filter((r) => r.deletedAt !== null).map((r) => [r.id, r.updatedAt]));
    return records.map((record) => {
      const deletedVersion = deleted.get(record.id);
      return deletedVersion !== undefined && deletedVersion >= record.updatedAt
        ? { ...record, updatedAt: deletedVersion + 1 }
        : record;
    });
  };
  return {
    collections: revive(collections, local.collections),
    videos: revive(videos, local.videos),
    bookmarks: revive(bookmarks, local.bookmarks),
  };
}

// ---------------------------------------------------------------------------
// Markdown export of notes
// ---------------------------------------------------------------------------

/** Escapes Markdown syntax and keeps the text on one line, so it cannot break the document's structure. */
const escapeMd = (value: string) => value.replace(/\s*\n\s*/g, ' ').replace(/([\\[\]()*_`#<>|!])/g, '\\$1');

export function createMarkdown(
  library: Library,
  options: { title: string; unsortedLabel: string; collectionId?: string | null },
): string {
  const lines: string[] = [`# ${escapeMd(options.title)}`, ''];
  const bookmarksByVideo = new Map<string, Bookmark[]>();
  for (const b of library.bookmarks) {
    const list = bookmarksByVideo.get(b.videoId) ?? [];
    list.push(b);
    bookmarksByVideo.set(b.videoId, list);
  }

  const groups: { name: string; videos: Video[] }[] = [];
  const byCollection = (id: string | null) =>
    library.videos.filter((v) => v.collectionId === id).sort((a, b) => a.createdAt - b.createdAt);

  if (options.collectionId !== undefined) {
    const collection = library.collections.find((c) => c.id === options.collectionId);
    groups.push({ name: collection?.name ?? options.unsortedLabel, videos: byCollection(options.collectionId) });
  } else {
    for (const c of [...library.collections].sort((a, b) => a.name.localeCompare(b.name))) {
      groups.push({ name: c.name, videos: byCollection(c.id) });
    }
    groups.push({ name: options.unsortedLabel, videos: byCollection(null) });
  }

  for (const group of groups) {
    if (group.videos.length === 0) continue;
    lines.push(`## ${escapeMd(group.name)}`, '');
    for (const video of group.videos) {
      const channel = video.channel ? ` — ${escapeMd(video.channel)}` : '';
      lines.push(`### [${escapeMd(video.title)}](${watchUrl(video.id)})${channel}`, '');
      const progress = video.duration > 0 ? ` / ${formatTime(video.duration)}` : '';
      lines.push(`[${formatTime(video.position)}${progress}](${watchUrl(video.id, video.position)})`, '');
      const bookmarks = (bookmarksByVideo.get(video.id) ?? []).sort((a, b) => a.time - b.time);
      for (const b of bookmarks) {
        const note = b.note ? ` ${escapeMd(b.note)}` : '';
        lines.push(`- [${formatTime(b.time)}](${watchUrl(video.id, b.time)})${note}`);
      }
      if (bookmarks.length > 0) lines.push('');
    }
  }
  return lines.join('\n');
}
