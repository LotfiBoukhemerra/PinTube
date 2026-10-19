import { useEffect, useState } from 'react';
import { getLibrary, watchLibrary } from '../storage/repository';
import { getSettings, watchSettings } from '../storage/settings';
import type { Library, Settings } from '../shared/types';

/** Live view of the library: re-reads storage whenever any context changes it. */
export function useLibrary(): Library | null {
  const [library, setLibrary] = useState<Library | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = () => void getLibrary().then((lib) => !cancelled && setLibrary(lib));
    load();
    // Coalesce bursts of writes (e.g. an import) into one re-render.
    const unwatch = watchLibrary(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 80);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unwatch();
    };
  }, []);
  return library;
}

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getSettings().then((s) => !cancelled && setSettings(s));
    const unwatch = watchSettings(setSettings);
    return () => {
      cancelled = true;
      unwatch();
    };
  }, []);
  return settings;
}
