import { Folder, Inbox, Layers, Plus, Settings } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { createCollection, DuplicateCollectionError, LIMITS } from '../../storage/repository';
import { groupProgress } from '../../shared/progress';
import type { Library } from '../../shared/types';
import { useApp } from '../app-context';
import { Logo } from '../components';
import { formatPercent } from '../utils';
import { navigate, routeHref, type Route } from './router';

function NavLink({
  href,
  active,
  icon,
  children,
  aside,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <a className={active ? 'nav-link active' : 'nav-link'} href={href} aria-current={active ? 'page' : undefined}>
      {icon}
      <span className="nav-text">{children}</span>
      {aside !== undefined && <span className="nav-aside">{aside}</span>}
    </a>
  );
}

export function Sidebar({ route, library }: { route: Route; library: Library | null }) {
  const { t } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const videos = library?.videos ?? [];
  const collections = [...(library?.collections ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const scope = route.page === 'library' ? route.scope : null;

  const closeForm = () => {
    setCreating(false);
    setName('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    try {
      const collection = await createCollection(clean);
      closeForm();
      navigate({ page: 'library', scope: { type: 'collection', id: collection.id } });
    } catch (e) {
      setError(t(e instanceof DuplicateCollectionError ? 'collection.duplicateName' : 'common.error'));
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Logo />
      </div>

      <nav className="nav" aria-label={t('nav.library')}>
        <NavLink
          href={routeHref({ page: 'library', scope: { type: 'all' } })}
          active={scope?.type === 'all'}
          icon={<Layers />}
          aside={videos.length}
        >
          {t('nav.allVideos')}
        </NavLink>
        <NavLink
          href={routeHref({ page: 'library', scope: { type: 'unsorted' } })}
          active={scope?.type === 'unsorted'}
          icon={<Inbox />}
          aside={videos.filter((v) => v.collectionId === null).length}
        >
          {t('nav.unsorted')}
        </NavLink>
      </nav>

      <div className="nav-section">
        <span>{t('nav.collections')}</span>
        <button
          className="btn btn-ghost btn-icon"
          aria-label={t('nav.newCollection')}
          title={t('nav.newCollection')}
          onClick={() => (creating ? closeForm() : setCreating(true))}
        >
          <Plus />
        </button>
      </div>

      {creating && (
        <form className="sidebar-form" onSubmit={(e) => void submit(e)}>
          <input
            className="input"
            autoFocus
            maxLength={LIMITS.collectionName}
            placeholder={t('collection.namePlaceholder')}
            aria-label={t('collection.namePlaceholder')}
            aria-invalid={error !== null}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Escape' && closeForm()}
          />
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}

      <nav className="nav nav-collections" aria-label={t('nav.collections')}>
        {collections.map((c) => {
          const inside = videos.filter((v) => v.collectionId === c.id);
          return (
            <NavLink
              key={c.id}
              href={routeHref({ page: 'library', scope: { type: 'collection', id: c.id } })}
              active={scope?.type === 'collection' && scope.id === c.id}
              icon={<Folder />}
              aside={`${formatPercent(groupProgress(inside))}%`}
            >
              {c.name}
            </NavLink>
          );
        })}
      </nav>

      <nav className="nav nav-bottom">
        <NavLink href={routeHref({ page: 'settings' })} active={route.page === 'settings'} icon={<Settings />}>
          {t('nav.settings')}
        </NavLink>
      </nav>
    </aside>
  );
}
