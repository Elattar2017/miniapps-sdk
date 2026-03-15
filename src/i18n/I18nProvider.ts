/**
 * I18nProvider - Internationalization manager
 * @module i18n/I18nProvider
 *
 * Provides translation functionality with locale switching,
 * parameter interpolation, and fallback chain (locale -> 'en' -> key).
 */

export class I18nManager {
  private locale: string;
  private strings: Record<string, Record<string, string>> = {};
  private listeners: Set<() => void> = new Set();

  constructor(defaultLocale: string = 'en') {
    this.locale = defaultLocale;
  }

  setLocale(locale: string): void {
    this.locale = locale;
    // Sync platform-level RTL (React Native I18nManager)
    try {
      const RNI18n = require('react-native').I18nManager;
      if (RNI18n) {
        RNI18n.allowRTL(true);
        const shouldBeRTL = this.isRTL();
        if (RNI18n.isRTL !== shouldBeRTL) {
          RNI18n.forceRTL(shouldBeRTL);
        }
      }
    } catch {
      // Not in React Native environment (web, tests) — skip
    }
    this.listeners.forEach(cb => cb());
  }

  getLocale(): string {
    return this.locale;
  }

  addStrings(locale: string, strings: Record<string, string>): void {
    if (!this.strings[locale]) {
      this.strings[locale] = {};
    }
    Object.assign(this.strings[locale], strings);
  }

  t(key: string, params?: Record<string, string>): string {
    // Try current locale first
    let value = this.strings[this.locale]?.[key];

    // Fall back to English
    if (value === undefined && this.locale !== 'en') {
      value = this.strings['en']?.[key];
    }

    // Fall back to key itself
    if (value === undefined) {
      return key;
    }

    // Interpolate parameters
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), paramValue);
      }
    }

    return value;
  }

  /** Pluralize a key based on count */
  pluralize(key: string, count: number, params?: Record<string, string>): string {
    let pluralKey: string;
    if (count === 0) {
      pluralKey = `${key}.zero`;
    } else if (count === 1) {
      pluralKey = `${key}.one`;
    } else {
      pluralKey = `${key}.other`;
    }

    // Try plural form, fall back to .other, fall back to key itself
    const mergedParams = { ...params, count: String(count) };
    const result = this.t(pluralKey, mergedParams);
    if (result !== pluralKey) return result;

    // Fall back to .other form
    const otherKey = `${key}.other`;
    const otherResult = this.t(otherKey, mergedParams);
    if (otherResult !== otherKey) return otherResult;

    return this.t(key, mergedParams);
  }

  /** Check if current locale is RTL */
  isRTL(): boolean {
    const rtlLocales = ['ar', 'he', 'fa', 'ur'];
    return rtlLocales.includes(this.locale);
  }

  /** Get text direction for current locale */
  getDirection(): 'ltr' | 'rtl' {
    return this.isRTL() ? 'rtl' : 'ltr';
  }

  /** Register a listener for locale changes */
  addListener(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export const i18n = new I18nManager();

/** Convenience function for host apps to change SDK locale at runtime */
export function setLocale(locale: string): void {
  i18n.setLocale(locale);
}

// Auto-load built-in string tables
import { EN_STRINGS } from './strings/en';
import { AR_STRINGS } from './strings/ar';
i18n.addStrings('en', EN_STRINGS);
i18n.addStrings('ar', AR_STRINGS);
