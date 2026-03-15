/**
 * useTranslation Hook Test Suite
 *
 * Covers useTranslation() return value (t function, locale),
 * translation with interpolation, locale changes, and missing key fallback.
 */

import { i18n } from '../../src/i18n/I18nProvider';
import { useTranslation } from '../../src/i18n/useTranslation';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  // Reset the singleton locale back to 'en'
  i18n.setLocale('en');
});

describe('useTranslation hook', () => {
  it('returns an object with t function and locale string', () => {
    const result = useTranslation();
    expect(result).toHaveProperty('t');
    expect(result).toHaveProperty('locale');
    expect(typeof result.t).toBe('function');
    expect(typeof result.locale).toBe('string');
  });

  it('locale matches i18n.getLocale()', () => {
    i18n.setLocale('fr');
    const { locale } = useTranslation();
    expect(locale).toBe('fr');
    expect(locale).toBe(i18n.getLocale());
  });

  it('t() translates keys correctly using loaded strings', () => {
    i18n.addStrings('en', { 'test.hook.greeting': 'Hello' });
    const { t } = useTranslation();
    expect(t('test.hook.greeting')).toBe('Hello');
  });

  it('t() with interpolation replaces {{param}} placeholders', () => {
    i18n.addStrings('en', { 'test.hook.welcome': 'Welcome, {{user}}!' });
    const { t } = useTranslation();
    expect(t('test.hook.welcome', { user: 'Alice' })).toBe('Welcome, Alice!');
  });

  it('language change updates translations returned by t()', () => {
    i18n.addStrings('en', { 'test.hook.label': 'Name' });
    i18n.addStrings('es', { 'test.hook.label': 'Nombre' });

    // Initially English
    const { t: tEn } = useTranslation();
    expect(tEn('test.hook.label')).toBe('Name');

    // Switch locale
    i18n.setLocale('es');
    const { t: tEs } = useTranslation();
    expect(tEs('test.hook.label')).toBe('Nombre');
  });

  it('missing key returns the key itself as fallback', () => {
    const { t } = useTranslation();
    expect(t('nonexistent.hook.key.value')).toBe('nonexistent.hook.key.value');
  });
});
