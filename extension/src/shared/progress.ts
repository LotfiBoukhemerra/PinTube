import type { Video } from './types';

/** A video counts as finished once the viewer is this close to the end. */
const COMPLETION_RATIO = 0.95;
const COMPLETION_TAIL_SECONDS = 10;

export function isFinished(position: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  return position >= duration * COMPLETION_RATIO || duration - position <= COMPLETION_TAIL_SECONDS;
}

/** True when `time` lies inside the video. An unknown duration (0) accepts any time. */
export function isWithinVideo(time: number, duration: number): boolean {
  return !(duration > 0) || time <= duration;
}

/** Progress of a video between 0 and 1. */
export function videoProgress(video: Pick<Video, 'position' | 'duration' | 'completed'>): number {
  if (video.completed) return 1;
  if (!(video.duration > 0)) return 0;
  return Math.min(1, Math.max(0, video.position / video.duration));
}

/** Watch-time-weighted progress of a group of videos, between 0 and 1. */
export function groupProgress(videos: Video[]): number {
  let watched = 0;
  let total = 0;
  for (const v of videos) {
    if (!(v.duration > 0)) continue;
    total += v.duration;
    watched += videoProgress(v) * v.duration;
  }
  return total > 0 ? watched / total : 0;
}
