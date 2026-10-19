import { describe, expect, it } from 'vitest';
import { groupProgress, isFinished, videoProgress } from './progress';
import { formatTime, parseTime } from './time';
import type { Video } from './types';
import { hasStartTime, isValidVideoId, parseWatchUrl, watchUrl } from './youtube';

describe('time', () => {
  it('formats seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });

  it('parses times', () => {
    expect(parseTime('45')).toBe(45);
    expect(parseTime('12:34')).toBe(754);
    expect(parseTime(' 1:02:03 ')).toBe(3723);
    expect(parseTime('1:60')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('youtube urls', () => {
  it('extracts ids from watch urls only', () => {
    expect(parseWatchUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ');
    expect(parseWatchUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBeNull();
    expect(parseWatchUrl('https://evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseWatchUrl('https://www.youtube.com/watch?v=<script>')).toBeNull();
    expect(parseWatchUrl('not a url')).toBeNull();
  });

  it('validates ids', () => {
    expect(isValidVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidVideoId('short')).toBe(false);
    expect(isValidVideoId(42)).toBe(false);
  });

  it('detects start times and builds resume links', () => {
    expect(hasStartTime('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe(true);
    expect(hasStartTime('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(watchUrl('dQw4w9WgXcQ', 754.8)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=754s');
    expect(watchUrl('dQw4w9WgXcQ', 0)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('progress', () => {
  const video = (position: number, duration: number, completed = false) => ({ position, duration, completed }) as Video;

  it('detects the end of a video', () => {
    expect(isFinished(95, 100)).toBe(true);
    expect(isFinished(3591, 3600)).toBe(true);
    expect(isFinished(50, 100)).toBe(false);
    expect(isFinished(10, 0)).toBe(false);
  });

  it('computes progress', () => {
    expect(videoProgress(video(30, 120))).toBe(0.25);
    expect(videoProgress(video(30, 120, true))).toBe(1);
    expect(videoProgress(video(30, 0))).toBe(0);
    expect(groupProgress([video(60, 100), video(0, 300)])).toBe(60 / 400);
    expect(groupProgress([])).toBe(0);
  });
});
