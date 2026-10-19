import type { LocaleCode } from '../i18n';

/**
 * Domain model. All timestamps are epoch milliseconds; all positions are seconds.
 *
 * Records carry a version (`updatedAt`) and are soft-deleted (`deletedAt`
 * marks a tombstone), so two copies of a library can always be merged:
 * that is what backup import does today and what sync will build on.
 */
export interface SyncMeta {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Collection extends SyncMeta {
  id: string;
  name: string;
}

export interface Video extends SyncMeta {
  /** YouTube video id (11 chars). */
  id: string;
  title: string;
  channel: string;
  /** Video length in seconds, 0 when unknown. */
  duration: number;
  /** Resume point in seconds. */
  position: number;
  collectionId: string | null;
  completed: boolean;
}

export interface Bookmark extends SyncMeta {
  id: string;
  videoId: string;
  /** Moment in the video, in seconds. */
  time: number;
  note: string;
}

export interface Library {
  collections: Collection[];
  videos: Video[];
  bookmarks: Bookmark[];
}

export type Theme = 'system' | 'light' | 'dark';
export type ResumeBehavior = 'ask' | 'auto' | 'off';

export interface Settings {
  language: LocaleCode;
  theme: Theme;
  /** Keep the resume point of pinned videos updated automatically while watching. */
  autoSave: boolean;
  resumeBehavior: ResumeBehavior;
  showPlayerButton: boolean;
}

/** Metadata the content script reads from the YouTube page. */
export interface VideoMeta {
  id: string;
  title: string;
  channel: string;
  duration: number;
}
