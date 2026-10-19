import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createTranslator, localeDir, type Translate } from '../i18n';
import { callBackground, listen, type TabApi, type TabVideoState } from '../messaging/protocol';
import { videoKey } from '../storage/keys';
import {
  addBookmark,
  findBookmarkAt,
  getVideo,
  pinVideo,
  saveProgress,
  updateBookmarkNote,
  watchLibrary,
} from '../storage/repository';
import { DEFAULT_SETTINGS, getSettings, watchSettings } from '../storage/settings';
import { formatTime } from '../shared/time';
import type { Settings, Video } from '../shared/types';
import { hasStartTime, parseWatchUrl } from '../shared/youtube';
import { PlayerButtons } from './player-buttons';
import { Toast } from './toast';
import { getCurrentVideoId, getVideoElement, isAdPlaying, readVideoMeta } from './youtube-page';

/** Minimum delay between two automatic saves while a pinned video plays. */
const AUTOSAVE_INTERVAL_MS = 10_000;
/** Events fired this soon after a navigation may still belong to the previous video. */
const SETTLE_MS = 1_500;
/** Offer to resume only at the start of a visit, not in the middle of watching. */
const RESUME_WINDOW_MS = 30_000;
/** Saved positions this close to the start are not worth a resume prompt. */
const MIN_RESUME_SECONDS = 5;

const PLAYBACK_EVENTS = ['playing', 'pause', 'seeked', 'timeupdate', 'emptied'] as const;

/** State of the visit to one watch page. */
interface Session {
  videoId: string;
  startedAt: number;
  /** True once the player is known to play this video (not the previous one). */
  ready: boolean;
  pinned: Video | null;
  lastAutoSaveAt: number;
  resumeHandled: boolean;
  /** A "resume?" question is on screen: auto-save waits for the answer. */
  resumePending: boolean;
  /**
   * Auto-save never moves the resume point backwards, unless the user acted
   * explicitly during this visit (pinned manually, chose "start over").
   */
  allowBackward: boolean;
}

export class PinTubeController {
  private settings: Settings = DEFAULT_SETTINGS;
  private t: Translate = createTranslator(DEFAULT_SETTINGS.language);
  private session: Session | null = null;
  private video: HTMLVideoElement | null = null;
  private videoListeners: AbortController | null = null;
  private lastHref = '';
  private onWatchPage = false;
  private readonly toast = new Toast();
  private readonly buttons = new PlayerButtons({
    onPin: () => void this.saveManually(),
    onBookmark: () => void this.addBookmarkHere(),
  });

  constructor(private readonly ctx: ContentScriptContext) {}

  async start(): Promise<void> {
    this.applySettings(await getSettings());
    const unwatchSettings = watchSettings((settings) => this.applySettings(settings));
    // Only the video on screen matters here: ignore every other library change.
    const unwatchLibrary = watchLibrary((keys) => {
      if (this.session && keys.includes(videoKey(this.session.videoId))) void this.refreshPinned();
    });
    this.ctx.onInvalidated(() => {
      unwatchSettings();
      unwatchLibrary();
      this.videoListeners?.abort();
      this.toast.destroy();
      this.buttons.unmount();
    });

    const signal = this.ctx.signal;
    // YouTube is a single-page app: these custom events mark in-app navigations.
    document.addEventListener('yt-navigate-start', () => void this.flush(), { signal });
    document.addEventListener('yt-navigate-finish', () => this.onNavigate(), { signal });
    window.addEventListener('pagehide', () => void this.flush(), { signal });
    document.addEventListener('visibilitychange', () => document.hidden && void this.flush(), { signal });
    // Safety net for missed navigation events and re-rendered player controls.
    // Away from watch pages a tick is a single string comparison.
    this.ctx.setInterval(() => this.tick(), 1000);

    listen<TabApi>({
      'tab.getState': () => this.getState(),
      'tab.saveProgress': () => this.saveManually(),
      'tab.seek': ({ videoId, time }) => this.seekTo(videoId, time),
    });

    this.onNavigate();
  }

  // -------------------------------------------------------------------------
  // Settings & page lifecycle
  // -------------------------------------------------------------------------

  private applySettings(settings: Settings): void {
    this.settings = settings;
    this.t = createTranslator(settings.language);
    this.toast.configure(localeDir(settings.language), this.t('toast.dismiss'));
    this.syncButton();
  }

  private tick(): void {
    if (location.href !== this.lastHref) this.onNavigate();
    if (!this.onWatchPage) return;
    // The page may not have been ready for this video at navigation time.
    if (!this.session) this.onNavigate();
    if (this.session) this.attachVideo();
    this.syncButton();
  }

  private onNavigate(): void {
    this.lastHref = location.href;
    this.onWatchPage = parseWatchUrl(location.href) !== null;
    const id = getCurrentVideoId();
    if (id && id === this.session?.videoId) return;
    // The previous video was saved on `yt-navigate-start`; saving now could
    // record the new video's time under the old one.
    if (this.session) {
      this.session = null;
      // Whatever is on screen belongs to the previous video: a late click on
      // "Resume" or a note typed now must not land on the new one.
      this.toast.hide();
    }
    if (id) this.startSession(id);
    this.syncButton();
  }

  private startSession(videoId: string): void {
    const session: Session = {
      videoId,
      startedAt: Date.now(),
      ready: false,
      pinned: null,
      lastAutoSaveAt: 0,
      resumeHandled: false,
      resumePending: false,
      allowBackward: false,
    };
    this.session = session;
    this.attachVideo();
    void getVideo(videoId).then((video) => {
      if (this.session !== session) return;
      session.pinned = video;
      this.buttons.setPinned(Boolean(video));
      this.maybeResume();
    });
  }

  private async refreshPinned(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const video = await getVideo(session.videoId);
    if (this.session !== session) return;
    session.pinned = video;
    this.buttons.setPinned(Boolean(video));
  }

  private syncButton(): void {
    if (this.settings.showPlayerButton && this.session) {
      this.buttons.setPinned(Boolean(this.session.pinned));
      this.buttons.ensureMounted({
        pin: this.t('player.pinButton'),
        bookmark: this.t('player.bookmarkButton'),
      });
    } else {
      this.buttons.unmount();
    }
  }

  // -------------------------------------------------------------------------
  // Playback tracking
  // -------------------------------------------------------------------------

  private attachVideo(): void {
    const video = getVideoElement();
    if (!video || video === this.video) return;
    this.videoListeners?.abort();
    this.videoListeners = new AbortController();
    this.video = video;
    for (const type of PLAYBACK_EVENTS) {
      video.addEventListener(type, (event) => this.onPlaybackEvent(event.type), {
        signal: this.videoListeners.signal,
      });
    }
  }

  private onPlaybackEvent(type: string): void {
    const session = this.session;
    if (!session) return;
    if (type === 'emptied') {
      session.ready = false; // A new source is loading.
      return;
    }
    // Videos that are not pinned are never tracked: stop here, several times a second.
    if (session.ready && !session.pinned) return;
    if (isAdPlaying()) return;
    if (!session.ready) {
      const settled = Date.now() - session.startedAt > SETTLE_MS;
      if (type === 'playing' || (type === 'timeupdate' && settled)) session.ready = true;
      else return;
    }
    this.maybeResume();
    if (type === 'pause' || type === 'seeked') void this.autoSave(true);
    else if (type === 'timeupdate') void this.autoSave(false);
  }

  /** Saves the current position right away (before leaving the page). */
  private async flush(): Promise<void> {
    await this.autoSave(true);
  }

  private async autoSave(force: boolean): Promise<void> {
    const session = this.session;
    const video = this.video;
    if (!session?.ready || !session.pinned || !video || !this.settings.autoSave) return;
    if (session.resumePending || isAdPlaying() || getCurrentVideoId() !== session.videoId) return;
    const now = Date.now();
    if (!force && now - session.lastAutoSaveAt < AUTOSAVE_INTERVAL_MS) return;
    const time = video.currentTime;
    if (!session.allowBackward && time < session.pinned.position) return;
    session.lastAutoSaveAt = now;
    const updated = await saveProgress(session.videoId, time, video.duration).catch(() => null);
    if (updated && this.session === session) session.pinned = updated;
  }

  private maybeResume(): void {
    const session = this.session;
    const video = this.video;
    if (!session || session.resumeHandled || !session.ready || !session.pinned || !video || isAdPlaying()) return;
    session.resumeHandled = true;

    const target = session.pinned.position;
    const nearEnd = Number.isFinite(video.duration) && target >= video.duration - MIN_RESUME_SECONDS;
    if (
      this.settings.resumeBehavior === 'off' ||
      session.pinned.completed ||
      target < MIN_RESUME_SECONDS ||
      nearEnd ||
      hasStartTime(location.href) ||
      Date.now() - session.startedAt > RESUME_WINDOW_MS ||
      Math.abs(video.currentTime - target) < MIN_RESUME_SECONDS // Already there (e.g. YouTube resumed itself).
    ) {
      return;
    }

    const time = formatTime(target);
    if (this.settings.resumeBehavior === 'auto') {
      video.currentTime = target;
      this.toast.show({
        message: this.t('toast.resumed', { time }),
        durationMs: 6000,
        actions: [
          {
            label: this.t('toast.startOver'),
            run: () => {
              session.allowBackward = true;
              video.currentTime = 0;
            },
          },
        ],
      });
      return;
    }

    session.resumePending = true;
    this.toast.show({
      message: this.t('toast.resumeAsk', { time }),
      durationMs: 15_000,
      onDismiss: () => {
        session.resumePending = false;
      },
      actions: [
        {
          label: this.t('toast.resume'),
          primary: true,
          run: () => {
            session.resumePending = false;
            video.currentTime = target;
          },
        },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // User actions
  // -------------------------------------------------------------------------

  private currentTarget(): { id: string; video: HTMLVideoElement } | null {
    const id = getCurrentVideoId();
    const video = this.video ?? getVideoElement();
    return id && video ? { id, video } : null;
  }

  /** Pin button and popup button: pin the video / save the current position. */
  private async saveManually(): Promise<TabVideoState | null> {
    const target = this.currentTarget();
    if (!target) return null;
    if (isAdPlaying()) {
      this.toast.show({ message: this.t('toast.adPlaying') });
      return null;
    }
    const { id, video } = target;
    try {
      const wasPinned = Boolean(await getVideo(id));
      const saved = await pinVideo(readVideoMeta(id, video), video.currentTime);
      this.onPinned(id, saved);
      const time = formatTime(saved.position);
      this.toast.show({
        message: this.t(wasPinned ? 'toast.savedAt' : 'toast.pinnedAt', { time }),
        durationMs: 5000,
        actions: [
          {
            label: this.t('toast.addBookmark'),
            run: () => void this.promptBookmark(id, saved.position, video.duration),
          },
          { label: this.t('toast.library'), run: () => void callBackground('ui.openLibrary').catch(() => undefined) },
        ],
      });
      return this.stateOf(id, video, saved);
    } catch {
      this.toast.show({ message: this.t('toast.error') });
      return null;
    }
  }

  /** Bookmark button: bookmark the current moment (pins the video first if needed). */
  private async addBookmarkHere(): Promise<void> {
    const target = this.currentTarget();
    if (!target) return;
    if (isAdPlaying()) {
      this.toast.show({ message: this.t('toast.adPlaying') });
      return;
    }
    const { id, video } = target;
    const time = video.currentTime;
    const duration = video.duration;
    try {
      if (!(await getVideo(id))) this.onPinned(id, await pinVideo(readVideoMeta(id, video), time));
      await this.promptBookmark(id, time, duration);
    } catch {
      this.toast.show({ message: this.t('toast.error') });
    }
  }

  /** `time` and `duration` are read from the player when the user asks, before the note is typed. */
  private async promptBookmark(videoId: string, time: number, duration: number): Promise<void> {
    const video = this.video;
    const wasPlaying = Boolean(video && !video.paused);
    video?.pause();
    const at = { time: formatTime(time) };
    // A second already bookmarked is edited, not bookmarked twice.
    const existing = await findBookmarkAt(videoId, time).catch(() => null);
    const note = await this.toast.prompt({
      message: existing ? this.t('toast.editBookmark', at) : this.t('toast.addBookmark'),
      value: existing?.note,
      placeholder: this.t('toast.notePlaceholder', at),
      submitLabel: this.t('common.save'),
      cancelLabel: this.t('common.cancel'),
    });
    if (wasPlaying) void video?.play().catch(() => undefined);
    if (note === null) return;
    try {
      if (existing) {
        await updateBookmarkNote(existing.id, note);
        this.toast.show({ message: this.t('toast.bookmarkUpdated', at) });
      } else {
        await addBookmark(videoId, time, note, duration);
        this.toast.show({ message: this.t('toast.bookmarkAdded', at) });
      }
    } catch {
      this.toast.show({ message: this.t('toast.error') });
    }
  }

  /** Popup: jump to a bookmark of the video on screen and play from there. */
  private async seekTo(videoId: string, time: number): Promise<boolean> {
    const target = this.currentTarget();
    if (!target || target.id !== videoId || !Number.isFinite(time) || time < 0) return false;
    if (isAdPlaying()) {
      this.toast.show({ message: this.t('toast.adPlaying') });
      return true;
    }
    const { video } = target;
    const session = this.session;
    if (session) {
      // The user chose where to watch: a resume prompt or an automatic resume must not override it.
      session.resumePending = false;
      session.resumeHandled = true;
    }
    this.toast.hide();
    video.currentTime = Number.isFinite(video.duration) ? Math.min(time, video.duration) : time;
    void video.play().catch(() => undefined);
    return true;
  }

  private onPinned(videoId: string, saved: Video): void {
    const session = this.session;
    if (session?.videoId === videoId) {
      session.pinned = saved;
      session.allowBackward = true;
      session.resumePending = false;
      session.resumeHandled = true;
    }
    this.buttons.setPinned(true);
  }

  private async getState(): Promise<TabVideoState | null> {
    const target = this.currentTarget();
    if (!target) return null;
    return this.stateOf(target.id, target.video, await getVideo(target.id));
  }

  private stateOf(id: string, video: HTMLVideoElement, pinned: Video | null): TabVideoState {
    return {
      videoId: id,
      title: pinned?.title || readVideoMeta(id, video).title,
      currentTime: video.currentTime,
      pinned: Boolean(pinned),
      position: pinned?.position ?? null,
    };
  }
}
