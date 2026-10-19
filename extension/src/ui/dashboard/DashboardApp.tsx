import { useEffect } from 'react';
import { purgeTombstones } from '../../storage/repository';
import { useApp } from '../app-context';
import { useLibrary } from '../hooks';
import { LibraryView } from './LibraryView';
import { routeHref, useRoute } from './router';
import { SettingsView } from './SettingsView';
import { Sidebar } from './Sidebar';

/** Deleted records are kept this long (so a later merge cannot bring them back), then dropped. */
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export function DashboardApp() {
  const { t } = useApp();
  const route = useRoute();
  const library = useLibrary();

  // Housekeeping runs here, when the library page opens, rather than on a background timer.
  useEffect(() => void purgeTombstones(TOMBSTONE_TTL_MS).catch(() => undefined), []);

  useEffect(() => {
    document.title = `PinTube · ${t(route.page === 'settings' ? 'nav.settings' : 'nav.library')}`;
  }, [route.page, t]);

  return (
    <div className="layout">
      <Sidebar route={route} library={library} />
      <main className="main">
        {route.page === 'library' && <LibraryView key={routeHref(route)} scope={route.scope} library={library} />}
        {route.page === 'settings' && <SettingsView library={library} />}
      </main>
    </div>
  );
}
