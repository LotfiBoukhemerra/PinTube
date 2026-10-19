import { ar } from './locales/ar';
import { en, type MessageKey, type Messages } from './locales/en';
import { es } from './locales/es';

export type { MessageKey } from './locales/en';

interface LocaleDefinition {
  /** Name of the language, written in that language. */
  nativeName: string;
  dir: 'ltr' | 'rtl';
  messages: Messages;
}

/**
 * Registered languages. To add one:
 *   1. copy `locales/en.ts` to `locales/<code>.ts` and translate it,
 *   2. add an entry below.
 * TypeScript reports any missing or unknown key.
 */
export const LOCALES = {
  en: { nativeName: 'English', dir: 'ltr', messages: en },
  ar: { nativeName: 'العربية', dir: 'rtl', messages: ar },
  es: { nativeName: 'Español', dir: 'ltr', messages: es },
} as const satisfies Record<string, LocaleDefinition>;

export type LocaleCode = keyof typeof LOCALES;

export const DEFAULT_LOCALE: LocaleCode = 'en';

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value);
}

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

export function createTranslator(locale: LocaleCode): Translate {
  const messages: Messages = LOCALES[locale].messages;
  return (key, params) => {
    const template = messages[key] ?? en[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };
}

export function localeDir(locale: LocaleCode): 'ltr' | 'rtl' {
  return LOCALES[locale].dir;
}
