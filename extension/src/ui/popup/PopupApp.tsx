import { Library as LibraryIcon, RefreshCw, Trash } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { callTab, type TabVideoState } from '../../messaging/protocol';
import { deleteVideo } from '../../storage/repository';
import type { Bookmark, Video } from '../../shared/types';
import { formatTime } from '../../shared/time';
import { parseWatchUrl, watchUrl } from '../../shared/youtube';
import { useApp } from '../app-context';
import { ConfirmButton, Logo, PinIcon, VideoThumb } from '../components';
import { useLibrary } from '../hooks';
import { matchesSearch } from '../utils';

type CurrentTab =
  { kind: 'loading' } | { kind: 'none' } | { kind: 'reload' } | { kind: 'video'; tabId: number; state: TabVideoState };

/** Without a search, the list shows the videos watched most recently and not finished yet. */
const RECENT_LIMIT = 10;
/** A search looks through the whole library; only the best matches are drawn (thumbnails are the cost). */
const SEARCH_LIMIT = 20;

/** A video opens where it was left, or from the start once it is finished. */
const resumeUrl = (video: Video) => watchUrl(video.id, video.completed ? 0 : video.position);

async function readCurrentTab(): Promise<CurrentTab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !parseWatchUrl(tab.url)) return { kind: 'none' };
  try {
    const state = await callTab(tab.id, 'tab.getState');
    return state ? { kind: 'video', tabId: tab.id, state } : { kind: 'none' };
  } catch {
    // The tab was open before PinTube was installed or updated.
    return { kind: 'reload' };
  }
}

export function PopupApp() {
  const { t } = useApp();
  const library = useLibrary();
  const [current, setCurrent] = useState<CurrentTab>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const refreshTab = useCallback(() => void readCurrentTab().then(setCurrent), []);
  useEffect(refreshTab, [refreshTab]);

  const saveCurrent = async () => {
    if (current.kind !== 'video') return;
    setSaving(true);
    try {
      const state = await callTab(current.tabId, 'tab.saveProgress');
      if (state) setCurrent({ ...current, state });
    } catch {
      refreshTab();
    } finally {
      setSaving(false);
    }
  };

  /** Jumps to a bookmark in the YouTube tab, then gets out of the way. */
  const jumpTo = async (time: number) => {
    if (current.kind !== 'video') return;
    try {
      const jumped = await callTab(current.tabId, 'tab.seek', { videoId: current.state.videoId, time });
      if (jumped) window.close();
      else refreshTab(); // The tab moved on to another video.
    } catch {
      refreshTab();
    }
  };

  /** Removes the video and its bookmarks; the YouTube tab notices and resets its pin button. */
  const unpin = async (videoId: string) => {
    await deleteVideo(videoId);
    refreshTab();
  };

  const open = async (url: string) => {
    await browser.tabs.create({ url });
    window.close();
  };

  const openLibrary = async () => {
    await browser.runtime.openOptionsPage();
    window.close();
  };

  const currentBookmarks =
    current.kind === 'video' && current.state.pinned
      ? (library?.bookmarks ?? []).filter((b) => b.videoId === current.state.videoId).sort((a, b) => a.time - b.time)
      : [];

  const videos = library?.videos ?? [];
  const searching = query.trim() !== '';
  const notes = new Map<string, Bookmark[]>();
  if (searching) {
    for (const b of library?.bookmarks ?? []) notes.set(b.videoId, [...(notes.get(b.videoId) ?? []), b]);
  }
  const listed = (
    searching
      ? videos.filter((v) => matchesSearch(v, notes.get(v.id) ?? [], query))
      : videos.filter((v) => !v.completed)
  )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, searching ? SEARCH_LIMIT : RECENT_LIMIT);

  return (
    <div className="popup">
      <header className="popup-header">
        <Logo />
        <button className="btn btn-sm" onClick={() => void openLibrary()}>
          <LibraryIcon /> {t('popup.openLibrary')}
        </button>
      </header>

      <section className="popup-section popup-current">
        <h2 className="popup-title">{t('popup.currentVideo')}</h2>
        {current.kind === 'none' && <p className="notice">{t('popup.notOnYouTube')}</p>}
        {current.kind === 'reload' && (
          <div className="notice notice-warning popup-reload">
            <span>{t('popup.reloadTab')}</span>
            <button className="btn btn-sm" onClick={() => void browser.tabs.reload().then(() => window.close())}>
              <RefreshCw />
            </button>
          </div>
        )}
        {current.kind === 'video' && (
          <div className="current card">
            <p className="current-title" title={current.state.title}>
              {current.state.title}
            </p>
            {current.state.position !== null && (
              <p className="subtle">{t('popup.savedAt', { time: formatTime(current.state.position) })}</p>
            )}
            <div className="current-actions">
              <button className="btn btn-primary" disabled={saving} onClick={() => void saveCurrent()}>
                <PinIcon /> {current.state.pinned ? t('popup.saveProgress') : t('popup.pinThis')}
              </button>
              {current.state.pinned && (
                <ConfirmButton
                  className="btn-danger"
                  label={t('popup.unpin')}
                  confirmLabel={t('popup.unpinConfirm')}
                  onConfirm={() => void unpin(current.state.videoId)}
                >
                  <Trash /> {t('popup.unpin')}
                </ConfirmButton>
              )}
            </div>
            {currentBookmarks.length > 0 && (
              <div className="popup-bookmarks">
                <p className="subtle">{t('library.bookmarks', { count: currentBookmarks.length })}</p>
                <ul>
                  {currentBookmarks.map((bookmark) => (
                    <li key={bookmark.id}>
                      <button
                        className="popup-bookmark"
                        title={bookmark.note || undefined}
                        onClick={() => void jumpTo(bookmark.time)}
                      >
                        <span className="bookmark-time">{formatTime(bookmark.time)}</span>
                        <span className="popup-bookmark-note">{bookmark.note}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="popup-section popup-list">
        <h2 className="popup-title">{t('popup.continueWatching')}</h2>
        {videos.length > 0 && (
          <input
            className="input"
            type="search"
            autoFocus
            placeholder={t('library.search')}
            aria-label={t('library.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter opens the first result.
              if (e.key === 'Enter' && listed[0]) void open(resumeUrl(listed[0]));
            }}
          />
        )}
        {library && listed.length === 0 && (
          <p className="notice">{t(searching ? 'library.noResults' : 'popup.empty')}</p>
        )}
        <ul className="recent">
          {listed.map((video) => (
            <li key={video.id} className="recent-row">
              <button className="recent-item" onClick={() => void open(resumeUrl(video))}>
                <VideoThumb video={video} width={96} />
                <span className="recent-text">
                  <span className="recent-title">{video.title}</span>
                  <span className="subtle">
                    {video.completed
                      ? t('library.completed')
                      : t('common.continueAt', { time: formatTime(video.position) })}
                  </span>
                </span>
              </button>
              <ConfirmButton
                className="btn-ghost btn-sm btn-icon btn-danger"
                label={t('popup.unpin')}
                confirmLabel={t('popup.unpinConfirm')}
                onConfirm={() => void unpin(video.id)}
              >
                <Trash />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
