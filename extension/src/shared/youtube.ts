const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: unknown): id is string {
  return typeof id === 'string' && VIDEO_ID_RE.test(id);
}

/** Extracts the video id from a YouTube watch URL (`/watch?v=`), or null. */
export function parseWatchUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/watch') return null;
    const id = u.searchParams.get('v');
    return isValidVideoId(id) ? id : null;
  } catch {
    return null;
  }
}

/** True when the URL already asks YouTube to start at a given time (`t=` / `start=`). */
export function hasStartTime(url: string): boolean {
  try {
    const params = new URL(url).searchParams;
    return params.has('t') || params.has('start');
  } catch {
    return false;
  }
}

export function watchUrl(videoId: string, seconds = 0): string {
  const t = Math.floor(seconds);
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${t > 0 ? `&t=${t}s` : ''}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}
