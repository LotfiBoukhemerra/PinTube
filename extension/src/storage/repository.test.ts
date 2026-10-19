import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mergeRecord } from './merge';
import {
  addBookmark,
  BookmarkTimeError,
  createCollection,
  deleteAllRecords,
  deleteCollection,
  deleteBookmark,
  deleteVideo,
  DuplicateBookmarkError,
  DuplicateCollectionError,
  findBookmarkAt,
  getLibrary,
  getRawLibrary,
  getVideo,
  mergeLibrary,
  pinVideo,
  purgeTombstones,
  renameCollection,
  saveProgress,
  updateBookmarkNote,
  updateVideo,
} from './repository';
import type { Video } from '../shared/types';

const META = { id: 'dQw4w9WgXcQ', title: '  Never Gonna Give You Up ', channel: 'Rick', duration: 213 };

beforeEach(() => {
  fakeBrowser.reset();
});

describe('videos', () => {
  it('pins a video and updates its position', async () => {
    const first = await pinVideo(META, 42);
    expect(first).toMatchObject({ id: META.id, title: 'Never Gonna Give You Up', position: 42 });

    const second = await pinVideo(META, 100);
    expect(second.position).toBe(100);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('rejects invalid ids', async () => {
    await expect(pinVideo({ ...META, id: 'bad' }, 1)).rejects.toThrow();
  });

  it('auto-saves only pinned videos and marks them completed near the end', async () => {
    expect(await saveProgress(META.id, 10, 213)).toBeNull();
    await pinVideo(META, 10);
    const saved = await saveProgress(META.id, 210, 213);
    expect(saved?.completed).toBe(true);
  });

  it('deletes a video with its bookmarks and revives it when pinned again', async () => {
    await pinVideo(META, 10);
    await addBookmark(META.id, 5, 'intro');
    await deleteVideo(META.id);

    expect(await getVideo(META.id)).toBeNull();
    expect((await getLibrary()).bookmarks).toHaveLength(0);
    const raw = await getRawLibrary();
    expect(raw.videos[0]?.deletedAt).not.toBeNull();
    expect(raw.bookmarks[0]?.deletedAt).not.toBeNull();

    const revived = await pinVideo(META, 20);
    expect(revived.deletedAt).toBeNull();
    expect(revived.position).toBe(20);
  });
});

describe('bookmarks', () => {
  it('keeps the note optional and trimmed', async () => {
    await pinVideo(META, 10);
    const quick = await addBookmark(META.id, 5, '   ');
    expect(quick.note).toBe('');

    await updateBookmarkNote(quick.id, '  intro ');
    expect((await getLibrary()).bookmarks[0]?.note).toBe('intro');
    await updateBookmarkNote(quick.id, '');
    expect((await getLibrary()).bookmarks[0]?.note).toBe('');
  });

  it('allows only one bookmark per second of a video', async () => {
    await pinVideo(META, 10);
    await pinVideo({ ...META, id: 'aaaaaaaaaaa' }, 10);
    const first = await addBookmark(META.id, 127.2, '');

    await expect(addBookmark(META.id, 127.2, '')).rejects.toBeInstanceOf(DuplicateBookmarkError);
    await expect(addBookmark(META.id, 127.9, 'same second')).rejects.toBeInstanceOf(DuplicateBookmarkError);
    await expect(addBookmark(META.id, 127, 'same second')).rejects.toBeInstanceOf(DuplicateBookmarkError);
    expect((await getLibrary()).bookmarks).toHaveLength(1);
    expect(await findBookmarkAt(META.id, 127.5)).toMatchObject({ id: first.id });

    // The next second, and the same second of another video, are free.
    await expect(addBookmark(META.id, 128, 'next second')).resolves.toBeDefined();
    await expect(addBookmark('aaaaaaaaaaa', 127.2, 'other video')).resolves.toBeDefined();

    // Deleting a bookmark frees its second.
    await deleteBookmark(first.id);
    expect(await findBookmarkAt(META.id, 127.2)).toBeNull();
    await expect(addBookmark(META.id, 127.2, 'again')).resolves.toBeDefined();
  });

  it('refuses a time that is not inside the video', async () => {
    await pinVideo(META, 10); // 213 seconds long
    await expect(addBookmark(META.id, 214, 'too late')).rejects.toBeInstanceOf(BookmarkTimeError);
    await expect(addBookmark(META.id, 17 * 60, 'way too late')).rejects.toBeInstanceOf(BookmarkTimeError);
    await expect(addBookmark(META.id, -1, 'negative')).rejects.toBeInstanceOf(BookmarkTimeError);
    await expect(addBookmark(META.id, Number.NaN, 'not a number')).rejects.toBeInstanceOf(BookmarkTimeError);
    expect((await getLibrary()).bookmarks).toHaveLength(0);

    await expect(addBookmark(META.id, 213, 'last second')).resolves.toMatchObject({ time: 213 });
    await expect(addBookmark(META.id, 0, 'first second')).resolves.toMatchObject({ time: 0 });
  });

  it('trusts the length reported by the player over the stored one', async () => {
    await pinVideo(META, 10);
    // A live stream keeps growing after it was pinned.
    await expect(addBookmark(META.id, 300, 'later', 400)).resolves.toMatchObject({ time: 300 });
    await expect(addBookmark(META.id, 500, 'too late', 400)).rejects.toBeInstanceOf(BookmarkTimeError);
  });

  it('accepts any time while the length of the video is unknown', async () => {
    await pinVideo({ ...META, duration: 0 }, 10);
    await expect(addBookmark(META.id, 5000, 'somewhere')).resolves.toMatchObject({ time: 5000 });
  });
});

describe('collections', () => {
  it('unassigns videos when a collection is deleted', async () => {
    const collection = await createCollection('Course');
    await pinVideo(META, 10);
    await updateVideo(META.id, { collectionId: collection.id });
    await deleteCollection(collection.id);
    expect((await getVideo(META.id))?.collectionId).toBeNull();
    expect((await getLibrary()).collections).toHaveLength(0);
  });

  it('refuses a name that is already used, ignoring case and spacing', async () => {
    await createCollection('React Course');
    await expect(createCollection('React Course')).rejects.toBeInstanceOf(DuplicateCollectionError);
    await expect(createCollection('  react   COURSE ')).rejects.toBeInstanceOf(DuplicateCollectionError);
    expect((await getLibrary()).collections).toHaveLength(1);
  });

  it('refuses renaming to the name of another collection', async () => {
    const first = await createCollection('Math');
    const second = await createCollection('Physics');
    await expect(renameCollection(second.id, 'math')).rejects.toBeInstanceOf(DuplicateCollectionError);

    // Changing only the letter case of its own name is fine.
    await renameCollection(first.id, 'MATH');
    const names = (await getLibrary()).collections.map((c) => c.name).sort();
    expect(names).toEqual(['MATH', 'Physics']);
  });

  it('frees the name of a deleted collection', async () => {
    const collection = await createCollection('Course');
    await deleteCollection(collection.id);
    await expect(createCollection('Course')).resolves.toMatchObject({ name: 'Course' });
  });
});

describe('bulk operations', () => {
  it('merges incoming records with last-write-wins', async () => {
    const local = await pinVideo(META, 10);
    const older: Video = { ...local, position: 99, updatedAt: local.updatedAt - 1 };
    expect(await mergeLibrary({ collections: [], videos: [older], bookmarks: [] })).toBe(0);

    const newer: Video = { ...local, position: 120, updatedAt: local.updatedAt + 1 };
    expect(await mergeLibrary({ collections: [], videos: [newer], bookmarks: [] })).toBe(1);
    expect(await getVideo(META.id)).toMatchObject({ position: 120 });
  });

  it('turns everything into tombstones on delete all', async () => {
    await pinVideo(META, 10);
    await createCollection('A');
    await deleteAllRecords();
    const lib = await getLibrary();
    expect(lib.videos).toHaveLength(0);
    expect(lib.collections).toHaveLength(0);
    expect((await getRawLibrary()).videos).toHaveLength(1);
  });

  it('purges only tombstones older than the given age', async () => {
    await pinVideo(META, 10);
    await pinVideo({ ...META, id: 'aaaaaaaaaaa' }, 10);
    await deleteVideo(META.id);

    await purgeTombstones(60_000);
    expect((await getRawLibrary()).videos).toHaveLength(2);

    await purgeTombstones(-1);
    const raw = await getRawLibrary();
    expect(raw.videos.map((v) => v.id)).toEqual(['aaaaaaaaaaa']);
  });
});

describe('mergeRecord', () => {
  const base = { createdAt: 1, updatedAt: 10, deletedAt: null };

  it('keeps the newest version', () => {
    expect(mergeRecord(undefined, { ...base })).toEqual(base);
    expect(mergeRecord({ ...base }, { ...base, updatedAt: 5 })).toBeNull();
    expect(mergeRecord({ ...base }, { ...base })).toBeNull();
    expect(mergeRecord({ ...base }, { ...base, updatedAt: 11 })).toMatchObject({ updatedAt: 11 });
  });
});
