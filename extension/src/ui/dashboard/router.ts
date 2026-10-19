import { useEffect, useState } from 'react';

export type LibraryScope = { type: 'all' } | { type: 'unsorted' } | { type: 'collection'; id: string };

export type Route = { page: 'library'; scope: LibraryScope } | { page: 'settings' };

const HOME: Route = { page: 'library', scope: { type: 'all' } };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'settings':
      return { page: 'settings' };
    case 'unsorted':
      return { page: 'library', scope: { type: 'unsorted' } };
    case 'collection':
      return parts[1] ? { page: 'library', scope: { type: 'collection', id: parts[1] } } : HOME;
    default:
      return HOME;
  }
}

export function routeHref(route: Route): string {
  if (route.page !== 'library') return `#/${route.page}`;
  if (route.scope.type === 'unsorted') return '#/unsorted';
  if (route.scope.type === 'collection') return `#/collection/${encodeURIComponent(route.scope.id)}`;
  return '#/';
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}

/** Current route, kept in the URL hash so pages can be bookmarked and the back button works. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
