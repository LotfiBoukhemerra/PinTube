import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Bookmark, Collection, Library, Video } from '../shared/types';
import {
  addBookmark,
  createCollection,
  getLibrary,
  getRawLibrary,
  mergeLibrary,
  pinVideo,
  updateVideo,
} from '../storage/repository';
import {
  createBackup,
  createMarkdown,
  InvalidBackupError,
  parseBackup,
  prepareImport,
  UnsupportedBackupError,
} from './backup';

const VIDEO_ID = 'dQw4w9WgXcQ';
const OTHER_VIDEO_ID = 'aaaaaaaaaaa';
const COLLECTION_ID = '4f3c2a1b-8d7e-4c6b-9a5f-1e2d3c4b5a69';
const BOOKMARK_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
/** Extra ids for records added by a test. */
const UUID = [
  '11111111-2222-4333-8444-555555555555',
  '22222222-3333-4444-8555-666666666666',
  '33333333-4444-4555-8666-777777777777',
] as const;

const collection: Collection = { id: COLLECTION_ID, name: 'Course', createdAt: 1, updatedAt: 2, deletedAt: null };
const video: Video = {
  id: VIDEO_ID,
  title: 'Lesson [1]',
  channel: 'Teacher',
  duration: 600,
  position: 120,
  collectionId: COLLECTION_ID,
  completed: false,
  createdAt: 1,
  updatedAt: 3,
  deletedAt: null,
};
const bookmark: Bookmark = {
  id: BOOKMARK_ID,
  videoId: VIDEO_ID,
  time: 65,
  note: 'key idea',
  createdAt: 1,
  updatedAt: 4,
  deletedAt: null,
};

const library: Library = { collections: [collection], videos: [video], bookmarks: [bookmark] };
const EMPTY: Library = { collections: [], videos: [], bookmarks: [] };

/** The fixture as the plain object found in a backup file, ready to be tampered with. */
const fileData = () => JSON.parse(createBackup(library));
const parse = (data: unknown) => parseBackup(JSON.stringify(data));

describe('parseBackup', () => {
  it('round-trips a library', () => {
    const { library: parsed, skipped } = parseBackup(createBackup(library));
    expect(parsed.videos[0]).toMatchObject({
      id: VIDEO_ID,
      position: 120,
      collectionId: COLLECTION_ID,
      deletedAt: null,
    });
    expect(parsed.bookmarks).toHaveLength(1);
    expect(parsed.collections).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('rejects files that are not a backup', () => {
    for (const text of [
      '',
      'not json',
      'null',
      '[]',
      '"pintube"',
      '{"app":"other","version":1}',
      '{"app":"pintube"}',
    ]) {
      expect(() => parseBackup(text), text).toThrow(InvalidBackupError);
    }
    expect(() => parse({ ...fileData(), version: 0 })).toThrow(InvalidBackupError);
    expect(() => parse({ ...fileData(), videos: 'many' })).toThrow(InvalidBackupError);
  });

  it('asks for an update when the backup comes from a newer version', () => {
    expect(() => parse({ ...fileData(), version: 2 })).toThrow(UnsupportedBackupError);
  });

  it('accepts a file saved with a byte order mark, and one without any record', () => {
    expect(parseBackup(`﻿${createBackup(library)}`).library.videos).toHaveLength(1);
    expect(parse({ app: 'pintube', version: 1 })).toEqual({ library: EMPTY, skipped: 0 });
  });

  it('skips damaged records one by one and keeps the rest', () => {
    const data = fileData();
    data.videos.push({ ...data.videos[0], id: '"><img src=x onerror=alert(1)>' });
    data.videos.push({ ...data.videos[0], id: OTHER_VIDEO_ID, duration: 'long' });
    data.videos.push(null, 42, 'video');
    data.collections.push(
      { ...data.collections[0], id: 'not-a-uuid' },
      { ...data.collections[0], id: UUID[0], name: '   ' },
    );
    data.bookmarks.push({ ...data.bookmarks[0], id: UUID[1], time: -5 });

    const { library: parsed, skipped } = parse(data);
    expect(parsed.videos.map((v) => v.id)).toEqual([VIDEO_ID]);
    expect(parsed.collections.map((c) => c.id)).toEqual([COLLECTION_ID]);
    expect(parsed.bookmarks.map((b) => b.id)).toEqual([BOOKMARK_ID]);
    expect(skipped).toBe(8);
  });

  it('rejects a file in which no record can be read', () => {
    const data = fileData();
    data.collections = [];
    data.videos[0].id = 'bad';
    // The only bookmark belongs to the unreadable video.
    expect(() => parse(data)).toThrow(InvalidBackupError);
  });

  it('skips bookmarks without a video or placed past the end of their video', () => {
    const data = fileData();
    data.bookmarks.push({ ...data.bookmarks[0], id: UUID[0], videoId: OTHER_VIDEO_ID });
    data.bookmarks.push({ ...data.bookmarks[0], id: UUID[1], time: 17 * 60 });
    const { library: parsed, skipped } = parse(data);
    expect(parsed.bookmarks.map((b) => b.time)).toEqual([65]);
    expect(skipped).toBe(2);
  });

  it('brings out-of-range values back in range', () => {
    const data = fileData();
    data.videos[0].title = 'x'.repeat(500);
    data.videos[0].position = 900; // past the end of a 600 s video
    data.videos[0].updatedAt = 5000;
    data.videos.push({ ...data.videos[0], id: OTHER_VIDEO_ID, title: '  ' });
    const { library: parsed } = parseBackup(JSON.stringify(data), 1000);

    const [first, second] = parsed.videos;
    expect(first?.title).toHaveLength(300);
    expect(first?.position).toBe(600);
    expect(first?.updatedAt).toBe(1000); // not in the future
    expect(second?.title).toBe(OTHER_VIDEO_ID); // never empty
  });

  it('keeps the newest copy of a record listed twice', () => {
    const data = fileData();
    data.videos.push({ ...data.videos[0], position: 300, updatedAt: 9 });
    data.videos.push({ ...data.videos[0], position: 30, updatedAt: 1 });
    data.bookmarks.push({ ...data.bookmarks[0], note: 'older', updatedAt: 1 });
    const { library: parsed, skipped } = parse(data);
    expect(parsed.videos).toHaveLength(1);
    expect(parsed.videos[0]?.position).toBe(300);
    expect(parsed.bookmarks.map((b) => b.note)).toEqual(['key idea']);
    expect(skipped).toBe(0);
  });

  it('folds collections that share a name into the oldest one', () => {
    const data = fileData();
    data.collections.push({ ...data.collections[0], id: UUID[0], name: '  course ', createdAt: 5, updatedAt: 5 });
    data.videos.push({ ...data.videos[0], id: OTHER_VIDEO_ID, collectionId: UUID[0] });
    const { library: parsed } = parse(data);
    expect(parsed.collections.map((c) => c.id)).toEqual([COLLECTION_ID]);
    expect(parsed.videos.map((v) => v.collectionId)).toEqual([COLLECTION_ID, COLLECTION_ID]);
  });

  it('keeps one bookmark per second of a video: the one with a note, then the newest', () => {
    const data = fileData();
    data.bookmarks = [
      { ...data.bookmarks[0], id: UUID[0], time: 65.2, note: '', updatedAt: 9 },
      { ...data.bookmarks[0], id: BOOKMARK_ID, time: 65.9, note: 'key idea', updatedAt: 4 },
      { ...data.bookmarks[0], id: UUID[1], time: 70, note: 'old', updatedAt: 1 },
      { ...data.bookmarks[0], id: UUID[2], time: 70, note: 'new', updatedAt: 2 },
    ];
    const { library: parsed, skipped } = parse(data);
    expect(parsed.bookmarks.map((b) => b.note).sort()).toEqual(['key idea', 'new']);
    expect(skipped).toBe(0);
  });
});

describe('prepareImport', () => {
  it('leaves a backup untouched when nothing in the library conflicts with it', () => {
    expect(prepareImport(library, EMPTY)).toEqual(library);
  });

  it('merges a new collection into the local one that already has its name', () => {
    const local: Library = { ...EMPTY, collections: [{ ...collection, id: UUID[0], name: 'COURSE' }] };
    const prepared = prepareImport(library, local);
    expect(prepared.collections).toHaveLength(0);
    expect(prepared.videos[0]?.collectionId).toBe(UUID[0]);
  });

  it('does not rename a local collection to a name used by another one', () => {
    const local: Library = {
      ...EMPTY,
      collections: [
        { ...collection, name: 'Old name' },
        { ...collection, id: UUID[0], name: 'Course' },
      ],
    };
    const prepared = prepareImport(library, local);
    expect(prepared.collections).toHaveLength(0);
    // The video stays in its own collection, which keeps its local name.
    expect(prepared.videos[0]?.collectionId).toBe(COLLECTION_ID);
  });

  it('keeps a reference to a collection that only exists locally and drops unknown ones', () => {
    const incoming: Library = {
      collections: [],
      videos: [
        { ...video, collectionId: UUID[0] },
        { ...video, id: OTHER_VIDEO_ID, collectionId: UUID[1] },
      ],
      bookmarks: [],
    };
    const local: Library = { ...EMPTY, collections: [{ ...collection, id: UUID[0], name: 'Local' }] };
    expect(prepareImport(incoming, local).videos.map((v) => v.collectionId)).toEqual([UUID[0], null]);
  });

  it('does not add a second bookmark on a second that is already bookmarked', () => {
    const mine: Bookmark = { ...bookmark, id: UUID[0], time: 65.7, note: 'my note', updatedAt: 9 };
    const local: Library = { ...EMPTY, videos: [video], bookmarks: [mine] };
    // The local note is more recent: nothing to write.
    expect(prepareImport(library, local).bookmarks).toHaveLength(0);

    // Same second, same note: nothing to write either.
    const same: Library = { ...local, bookmarks: [{ ...mine, note: 'key idea' }] };
    expect(prepareImport(library, same).bookmarks).toHaveLength(0);
  });

  it('gives the existing bookmark the better note instead', () => {
    const empty: Bookmark = { ...bookmark, id: UUID[0], note: '', updatedAt: 9 };
    const fromEmpty = prepareImport(library, { ...EMPTY, videos: [video], bookmarks: [empty] }, 1000);
    expect(fromEmpty.bookmarks).toEqual([{ ...empty, note: 'key idea', updatedAt: 1000 }]);

    const older: Bookmark = { ...bookmark, id: UUID[0], note: 'older note', updatedAt: 2 };
    const fromOlder = prepareImport(library, { ...EMPTY, videos: [video], bookmarks: [older] }, 1000);
    expect(fromOlder.bookmarks).toEqual([{ ...older, note: 'key idea', updatedAt: 1000 }]);
  });

  it('merges the very same bookmark normally', () => {
    const local: Library = {
      ...EMPTY,
      videos: [video],
      bookmarks: [{ ...bookmark, note: 'edited here', updatedAt: 9 }],
    };
    expect(prepareImport(library, local).bookmarks).toEqual([bookmark]);
  });

  it('restores records that were deleted locally', () => {
    const local: Library = {
      collections: [collection],
      videos: [{ ...video, deletedAt: 50, updatedAt: 50 }],
      bookmarks: [{ ...bookmark, deletedAt: 50, updatedAt: 50 }],
    };
    const prepared = prepareImport(library, local);
    expect(prepared.videos[0]?.updatedAt).toBe(51);
    expect(prepared.bookmarks[0]?.updatedAt).toBe(51);
    expect(prepared.collections[0]?.updatedAt).toBe(2);
  });
});

describe('importing into a library', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  const importBackup = async (json: string) =>
    mergeLibrary(prepareImport(parseBackup(json).library, await getRawLibrary()));

  it('creates no duplicate when the other browser has the same collection and bookmark', async () => {
    // This browser: the same video in a collection of the same name, bookmarked at the same second.
    const mine = await createCollection('course');
    await pinVideo({ id: VIDEO_ID, title: 'Lesson [1]', channel: 'Teacher', duration: 600 }, 200);
    await updateVideo(VIDEO_ID, { collectionId: mine.id });
    await addBookmark(VIDEO_ID, 65.4, '');
    await addBookmark(VIDEO_ID, 90, 'only here');

    await importBackup(createBackup(library));

    const result = await getLibrary();
    expect(result.collections.map((c) => c.name)).toEqual(['course']);
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]).toMatchObject({ position: 200, collectionId: mine.id });
    expect(result.bookmarks.map((b) => [Math.floor(b.time), b.note]).sort()).toEqual([
      [65, 'key idea'],
      [90, 'only here'],
    ]);
  });

  it('changes nothing when the same backup is imported twice', async () => {
    const backup = createBackup(library);
    expect(await importBackup(backup)).toBe(3);
    expect(await importBackup(backup)).toBe(0);
    const result = await getLibrary();
    expect([result.collections.length, result.videos.length, result.bookmarks.length]).toEqual([1, 1, 1]);
  });

  it('re-imports its own export without changes', async () => {
    await createCollection('Course');
    await pinVideo({ id: VIDEO_ID, title: 'Lesson', channel: '', duration: 600 }, 10);
    await addBookmark(VIDEO_ID, 30, 'note');
    expect(await importBackup(createBackup(await getLibrary()))).toBe(0);
  });
});

describe('createMarkdown', () => {
  it('exports notes as markdown with escaped titles', () => {
    const md = createMarkdown(library, { title: 'Notes', unsortedLabel: 'Unsorted' });
    expect(md).toContain('## Course');
    expect(md).toContain('### [Lesson \\[1\\]](https://www.youtube.com/watch?v=dQw4w9WgXcQ) — Teacher');
    expect(md).toContain('- [1:05](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s) key idea');
  });

  it('keeps every title on its own line', () => {
    const md = createMarkdown(
      { ...library, videos: [{ ...video, title: 'Part 1\n## Not a heading' }] },
      { title: 'Notes', unsortedLabel: 'Unsorted' },
    );
    expect(md).toContain('### [Part 1 \\#\\# Not a heading](https://www.youtube.com/watch?v=dQw4w9WgXcQ)');
    expect(md).not.toMatch(/^## Not a heading/m);
  });
});
