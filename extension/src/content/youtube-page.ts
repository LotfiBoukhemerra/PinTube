import type { VideoMeta } from '../shared/types';
import { parseWatchUrl } from '../shared/youtube';

/**
 * Everything that depends on YouTube's markup lives here, so a YouTube
 * redesign only requires changes in this file.
 */
const SELECTORS = {
  player: '#movie_player',
  video: '#movie_player video.html5-main-video, #movie_player video',
  rightControls: '#movie_player .ytp-right-controls',
  watchPage: 'ytd-watch-flexy',
  title: 'ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1',
  channel:
    'ytd-watch-metadata #owner #channel-name a, #owner #channel-name a, ytd-video-owner-renderer #channel-name a',
} as const;

export const getPlayer = () => document.querySelector<HTMLElement>(SELECTORS.player);
export const getVideoElement = () => document.querySelector<HTMLVideoElement>(SELECTORS.video);
export const getRightControls = () => document.querySelector<HTMLElement>(SELECTORS.rightControls);

/** True while YouTube plays an ad in the player: its time must never be saved. */
export function isAdPlaying(): boolean {
  const player = getPlayer();
  return Boolean(player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')));
}

/**
 * Id of the video shown on the current watch page, or null. Returns null
 * during navigation, while the URL and the page disagree.
 */
export function getCurrentVideoId(): string | null {
  const fromUrl = parseWatchUrl(location.href);
  if (!fromUrl) return null;
  const fromPage = document.querySelector(SELECTORS.watchPage)?.getAttribute('video-id');
  return fromPage && fromPage !== fromUrl ? null : fromUrl;
}

const textOf = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? '';

export function readVideoMeta(id: string, video: HTMLVideoElement | null): VideoMeta {
  const title =
    textOf(SELECTORS.title) ||
    document.title
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*-\s*YouTube$/, '')
      .trim();
  const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
  return { id, title, channel: textOf(SELECTORS.channel), duration };
}
