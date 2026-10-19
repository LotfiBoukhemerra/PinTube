import { Check, Pencil, Plus, Trash, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { LIMITS, addBookmark, deleteBookmark, updateBookmarkNote } from '../../storage/repository';
import { isWithinVideo } from '../../shared/progress';
import { formatTime, parseTime } from '../../shared/time';
import type { Bookmark, Video } from '../../shared/types';
import { watchUrl } from '../../shared/youtube';
import { useApp } from '../app-context';

function BookmarkRow({ video, bookmark }: { video: Video; bookmark: Bookmark }) {
  const { t } = useApp();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(bookmark.note);

  const startEditing = () => {
    setNote(bookmark.note);
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    await updateBookmarkNote(bookmark.id, note);
    setEditing(false);
  };

  const remove = async () => {
    if (window.confirm(t('library.deleteBookmarkConfirm'))) await deleteBookmark(bookmark.id);
  };

  return (
    <li className="bookmark">
      <a className="bookmark-time" href={watchUrl(video.id, bookmark.time)} target="_blank" rel="noopener noreferrer">
        {formatTime(bookmark.time)}
      </a>
      {editing ? (
        <form className="bookmark-edit" onSubmit={(e) => void save(e)}>
          <input
            className="input"
            autoFocus
            maxLength={LIMITS.note}
            value={note}
            aria-label={t('library.bookmarkNote')}
            placeholder={t('library.bookmarkNote')}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          />
          <button className="btn btn-sm btn-icon" type="submit" aria-label={t('common.save')}>
            <Check />
          </button>
          <button
            className="btn btn-sm btn-icon"
            type="button"
            aria-label={t('common.cancel')}
            onClick={() => setEditing(false)}
          >
            <X />
          </button>
        </form>
      ) : (
        <>
          {bookmark.note ? (
            <span className="bookmark-note">{bookmark.note}</span>
          ) : (
            <span className="bookmark-note">
              <button className="bookmark-note-empty" onClick={startEditing}>
                {t('library.addNote')}
              </button>
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={t('common.edit')}
            title={t('common.edit')}
            onClick={startEditing}
          >
            <Pencil />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon btn-danger"
            aria-label={t('common.delete')}
            title={t('common.delete')}
            onClick={() => void remove()}
          >
            <Trash />
          </button>
        </>
      )}
    </li>
  );
}

export function BookmarkList({ video, bookmarks }: { video: Video; bookmarks: Bookmark[] }) {
  const { t } = useApp();
  const [time, setTime] = useState(() => formatTime(video.position));
  const [note, setNote] = useState('');
  /** `time` tells whether the time field is what needs fixing. */
  const [error, setError] = useState<{ message: string; time: boolean } | null>(null);
  const sorted = [...bookmarks].sort((a, b) => a.time - b.time);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const seconds = parseTime(time);
    if (seconds === null) {
      setError({ message: t('library.invalidTime'), time: true });
      return;
    }
    if (!isWithinVideo(seconds, video.duration)) {
      setError({ message: t('library.timeBeyondVideo', { duration: formatTime(video.duration) }), time: true });
      return;
    }
    if (bookmarks.some((b) => Math.floor(b.time) === seconds)) {
      setError({ message: t('library.bookmarkExists', { time: formatTime(seconds) }), time: true });
      return;
    }
    setError(null);
    try {
      await addBookmark(video.id, seconds, note);
      setNote('');
    } catch {
      // The video changed or disappeared while the form was open.
      setError({ message: t('common.error'), time: false });
    }
  };

  return (
    <div className="bookmarks">
      {sorted.length > 0 && (
        <ul className="bookmark-list">
          {sorted.map((b) => (
            <BookmarkRow key={b.id} video={video} bookmark={b} />
          ))}
        </ul>
      )}
      <form className="bookmark-add" onSubmit={(e) => void add(e)}>
        <input
          className="input bookmark-time-input"
          value={time}
          aria-label={t('library.bookmarkTime')}
          aria-invalid={error?.time === true}
          placeholder={t('library.bookmarkTime')}
          onChange={(e) => {
            setTime(e.target.value);
            setError(null);
          }}
        />
        <input
          className="input"
          value={note}
          maxLength={LIMITS.note}
          aria-label={t('library.bookmarkNote')}
          placeholder={t('library.bookmarkNote')}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-sm" type="submit">
          <Plus /> {t('library.addBookmark')}
        </button>
      </form>
      {error && (
        <p className="notice notice-error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
