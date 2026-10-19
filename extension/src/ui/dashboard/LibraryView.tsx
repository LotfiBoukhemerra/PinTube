import { FileText, Pencil, Search, Trash } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createMarkdown } from '../../services/backup';
import { deleteCollection, DuplicateCollectionError, LIMITS, renameCollection } from '../../storage/repository';
import { groupProgress, videoProgress } from '../../shared/progress';
import type { Bookmark, Library, Video } from '../../shared/types';
import { useApp } from '../app-context';
import { PinIcon, ProgressBar } from '../components';
import { dateStamp, downloadText, formatPercent, matchesSearch } from '../utils';
import { navigate, type LibraryScope } from './router';
import { VideoCard } from './VideoCard';

type StatusFilter = 'all' | 'inProgress' | 'completed';
type SortKey = 'recent' | 'added' | 'progress' | 'title';

const SORTERS: Record<SortKey, (a: Video, b: Video) => number> = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  added: (a, b) => b.createdAt - a.createdAt,
  progress: (a, b) => videoProgress(b) - videoProgress(a),
  title: (a, b) => a.title.localeCompare(b.title),
};

export function LibraryView({ scope, library }: { scope: LibraryScope; library: Library | null }) {
  const { t } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const bookmarksByVideo = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    for (const b of library?.bookmarks ?? []) {
      map.set(b.videoId, [...(map.get(b.videoId) ?? []), b]);
    }
    return map;
  }, [library]);

  const collection = scope.type === 'collection' ? library?.collections.find((c) => c.id === scope.id) : undefined;
  // The collection may have been deleted, possibly on another device. A brand
  // new collection can also be briefly missing until the library reloads, so
  // only redirect if it is still missing after a short grace period.
  const missing = Boolean(library && scope.type === 'collection' && !collection);
  useEffect(() => {
    if (!missing) return;
    const timer = window.setTimeout(() => navigate({ page: 'library', scope: { type: 'all' } }), 1000);
    return () => window.clearTimeout(timer);
  }, [missing]);

  if (!library) return <p className="muted">{t('common.loading')}</p>;
  if (missing) return null;

  const inScope = library.videos.filter((v) =>
    scope.type === 'all' ? true : scope.type === 'unsorted' ? v.collectionId === null : v.collectionId === scope.id,
  );
  const visible = inScope
    .filter((v) => (status === 'all' ? true : status === 'completed' ? v.completed : !v.completed))
    .filter((v) => matchesSearch(v, bookmarksByVideo.get(v.id) ?? [], query))
    .sort(SORTERS[sort]);

  const title = collection?.name ?? t(scope.type === 'unsorted' ? 'nav.unsorted' : 'nav.allVideos');

  const exportNotes = () => {
    const md = createMarkdown(library, {
      title: `PinTube · ${title}`,
      unsortedLabel: t('nav.unsorted'),
      collectionId: collection ? collection.id : scope.type === 'unsorted' ? null : undefined,
    });
    downloadText(`pintube-notes-${dateStamp()}.md`, md, 'text/markdown');
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (collection && newName.trim()) await renameCollection(collection.id, newName);
      setRenaming(false);
    } catch (e) {
      // Keep the field open so the name can be corrected.
      setRenameError(t(e instanceof DuplicateCollectionError ? 'collection.duplicateName' : 'common.error'));
    }
  };

  const removeCollection = async () => {
    if (!collection || !window.confirm(t('collection.deleteConfirm'))) return;
    await deleteCollection(collection.id);
    navigate({ page: 'library', scope: { type: 'all' } });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-heading">
          {renaming && collection ? (
            <form onSubmit={(e) => void submitRename(e)}>
              <input
                className="input page-title-input"
                autoFocus
                maxLength={LIMITS.collectionName}
                aria-label={t('collection.namePlaceholder')}
                aria-invalid={renameError !== null}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setRenameError(null);
                }}
                onBlur={(e) => void submitRename(e)}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
              />
              {renameError && (
                <p className="notice notice-error" role="alert">
                  {renameError}
                </p>
              )}
            </form>
          ) : (
            <h1 className="page-title">{title}</h1>
          )}
          <p className="subtle">{t('library.videoCount', { count: inScope.length })}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" onClick={exportNotes} disabled={inScope.length === 0}>
            <FileText /> {t('collection.exportMarkdown')}
          </button>
          {collection && (
            <>
              <button
                className="btn btn-sm btn-icon"
                aria-label={t('common.rename')}
                title={t('common.rename')}
                onClick={() => {
                  setNewName(collection.name);
                  setRenameError(null);
                  setRenaming(true);
                }}
              >
                <Pencil />
              </button>
              <button
                className="btn btn-sm btn-icon btn-danger"
                aria-label={t('common.delete')}
                title={t('common.delete')}
                onClick={() => void removeCollection()}
              >
                <Trash />
              </button>
            </>
          )}
        </div>
      </header>

      {collection && inScope.length > 0 && (
        <div className="collection-progress">
          <ProgressBar value={groupProgress(inScope)} />
          <span className="subtle">{t('collection.progress', { percent: formatPercent(groupProgress(inScope)) })}</span>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <Search className="icon" />
          <span className="sr-only">{t('library.search')}</span>
          <input
            className="input"
            type="search"
            placeholder={t('library.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="segmented" role="group">
          {(['all', 'inProgress', 'completed'] as const).map((s) => (
            <button
              key={s}
              className={status === s ? 'active' : ''}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {t(
                s === 'all'
                  ? 'library.filterAll'
                  : s === 'inProgress'
                    ? 'library.filterInProgress'
                    : 'library.filterCompleted',
              )}
            </button>
          ))}
        </div>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="recent">{t('library.sortRecent')}</option>
          <option value="added">{t('library.sortAdded')}</option>
          <option value="progress">{t('library.sortProgress')}</option>
          <option value="title">{t('library.sortTitle')}</option>
        </select>
      </div>

      {library.videos.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">
            <PinIcon />
          </span>
          <h2>{t('library.emptyTitle')}</h2>
          <p className="muted">{t('library.emptyBody')}</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="empty muted">{t('library.noResults')}</p>
      ) : (
        <div className="video-list">
          {visible.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              bookmarks={bookmarksByVideo.get(video.id) ?? []}
              collections={library.collections}
            />
          ))}
        </div>
      )}
    </div>
  );
}
