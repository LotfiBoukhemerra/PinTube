import { describe, expect, it } from 'vitest';
import { createTranslator, isLocaleCode, LOCALES } from './index';
import { en } from './locales/en';

describe('i18n', () => {
  it('interpolates parameters', () => {
    const t = createTranslator('en');
    expect(t('toast.pinnedAt', { time: '1:23' })).toBe('Pinned at 1:23');
    expect(t('toast.pinnedAt')).toBe('Pinned at {time}');
  });

  it('keeps the same placeholders in every language', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [code, locale] of Object.entries(LOCALES)) {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(locale.messages[key]), `${code}:${key}`).toEqual(placeholders(en[key]));
      }
    }
  });

  it('validates locale codes', () => {
    expect(isLocaleCode('ar')).toBe(true);
    expect(isLocaleCode('toString')).toBe(false);
  });
});
