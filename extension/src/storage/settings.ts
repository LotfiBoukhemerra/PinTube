import { browser } from 'wxt/browser';
import { DEFAULT_LOCALE, isLocaleCode } from '../i18n';
import type { ResumeBehavior, Settings, Theme } from '../shared/types';
import { STORAGE_KEYS } from './keys';

export const DEFAULT_SETTINGS: Settings = {
  language: DEFAULT_LOCALE,
  theme: 'system',
  autoSave: true,
  resumeBehavior: 'ask',
  showPlayerButton: true,
};

const THEMES: Theme[] = ['system', 'light', 'dark'];
const RESUME: ResumeBehavior[] = ['ask', 'auto', 'off'];

/** Validates stored settings field by field, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    language: isLocaleCode(s.language) ? s.language : DEFAULT_SETTINGS.language,
    theme: THEMES.includes(s.theme as Theme) ? (s.theme as Theme) : DEFAULT_SETTINGS.theme,
    autoSave: typeof s.autoSave === 'boolean' ? s.autoSave : DEFAULT_SETTINGS.autoSave,
    resumeBehavior: RESUME.includes(s.resumeBehavior as ResumeBehavior)
      ? (s.resumeBehavior as ResumeBehavior)
      : DEFAULT_SETTINGS.resumeBehavior,
    showPlayerButton: typeof s.showPlayerButton === 'boolean' ? s.showPlayerButton : DEFAULT_SETTINGS.showPlayerButton,
  };
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(result[STORAGE_KEYS.settings]);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export function watchSettings(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    const change = changes[STORAGE_KEYS.settings];
    if (area === 'local' && change) listener(normalizeSettings(change.newValue));
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
