import { Bookmark as BookmarkIcon, CircleCheck, Circle, Play, Trash } from 'lucide-react';
import { useState } from 'react';
import { deleteVideo, updateVideo } from '../../storage/repository';
import { formatTime } from '../../shared/time';
import type { Bookmark, Collection, Video } from '../../shared/types';
import { watchUrl } from '../../shared/youtube';
import { useApp } from '../app-context';
import { VideoThumb } from '../components';
import { BookmarkList } from './BookmarkList';

interface Props {
  video: Video;
  bookmarks: Bookmark[];
  collections: Collection[];
}

export function VideoCard({ video, bookmarks, collections }: Props) {
  const { t } = useApp();
  const [expanded, setExpanded] = useState(false);
  const resumeUrl = watchUrl(video.id, video.position);

  const remove = async () => {
    if (window.confirm(t('library.deleteVideoConfirm'))) await deleteVideo(video.id);
  };

  return (
    <article className="video card">
      <a className="video-thumb-link" href={resumeUrl} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
        <VideoThumb video={video} width={196} />
      </a>

      <div className="video-body">
        <div className="video-head">
          <a className="video-title" href={resumeUrl} target="_blank" rel="noopener noreferrer" title={video.title}>
            {video.title}
          </a>
          {video.completed && <span className="badge badge-success">{t('library.completed')}</span>}
        </div>
        <p className="subtle">
          {video.channel && <>{video.channel} · </>}
          {t('library.watched', {
            watched: formatTime(video.position),
            total: video.duration > 0 ? formatTime(video.duration) : '—',
          })}
        </p>

        <div className="video-actions">
          <a className="btn btn-primary btn-sm" href={resumeUrl} target="_blank" rel="noopener noreferrer">
            <Play /> {t('common.continueAt', { time: formatTime(video.position) })}
          </a>

          <select
            className="select select-sm"
            aria-label={t('library.collection')}
            value={video.collectionId ?? ''}
            onChange={(e) => void updateVideo(video.id, { collectionId: e.target.value || null })}
          >
            <option value="">{t('library.noCollection')}</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button className="btn btn-sm" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <BookmarkIcon /> {t('library.bookmarks', { count: bookmarks.length })}
          </button>

          <span className="spacer" />

          <button
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={video.completed ? t('library.markInProgress') : t('library.markCompleted')}
            title={video.completed ? t('library.markInProgress') : t('library.markCompleted')}
            onClick={() => void updateVideo(video.id, { completed: !video.completed })}
          >
            {video.completed ? <CircleCheck /> : <Circle />}
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon btn-danger"
            aria-label={t('common.delete')}
            title={t('common.delete')}
            onClick={() => void remove()}
          >
            <Trash />
          </button>
        </div>

        {expanded && <BookmarkList video={video} bookmarks={bookmarks} />}
      </div>
    </article>
  );
}
