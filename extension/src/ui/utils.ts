import type { Bookmark, Video } from '../shared/types';

/** True when the query appears in the video's title, channel or one of its notes. An empty query matches. */
export function matchesSearch(video: Video, bookmarks: Bookmark[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    video.title.toLowerCase().includes(q) ||
    video.channel.toLowerCase().includes(q) ||
    bookmarks.some((b) => b.note.toLowerCase().includes(q))
  );
}

export function formatPercent(ratio: number): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** Saves text as a file through a temporary download link (no `downloads` permission needed). */
export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
