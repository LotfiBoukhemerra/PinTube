import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createTranslator, localeDir, type LocaleCode, type Translate } from '../i18n';
import type { Settings, Theme } from '../shared/types';
import { useSettings } from './hooks';

interface AppContextValue {
  t: Translate;
  locale: LocaleCode;
  settings: Settings;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

function useDocumentAppearance(locale: LocaleCode | undefined, theme: Theme | undefined): void {
  const systemDark = useSystemDark();
  useEffect(() => {
    if (!locale) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDir(locale);
  }, [locale]);
  useEffect(() => {
    if (!theme) return;
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [theme, systemDark]);
}

/** Provides translations and settings; applies language direction and theme. */
export function AppProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const locale = settings?.language;
  const t = useMemo(() => (locale ? createTranslator(locale) : null), [locale]);
  useDocumentAppearance(locale, settings?.theme);
  const value = useMemo(() => (settings && t && locale ? { t, locale, settings } : null), [settings, t, locale]);

  if (!value) return null;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
