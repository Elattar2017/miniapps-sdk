import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { i18n } from './I18nProvider';

interface I18nContextValue {
  t: (key: string, params?: Record<string, string>) => string;
  tp: (key: string, count: number, params?: Record<string, string>) => string;
  locale: string;
  isRTL: boolean;
  direction: 'ltr' | 'rtl';
}

const defaultValue: I18nContextValue = {
  t: i18n.t.bind(i18n),
  tp: i18n.pluralize.bind(i18n),
  locale: i18n.getLocale(),
  isRTL: i18n.isRTL(),
  direction: i18n.getDirection(),
};

export const I18nContext = createContext<I18nContextValue>(defaultValue);

/** Provider component that makes i18n reactive */
export const I18nProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState(i18n.getLocale());

  useEffect(() => {
    const unsubscribe = i18n.addListener(() => {
      setLocale(i18n.getLocale());
    });
    return unsubscribe;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>) => i18n.t(key, params),
    [locale],
  );

  const tp = useCallback(
    (key: string, count: number, params?: Record<string, string>) => i18n.pluralize(key, count, params),
    [locale],
  );

  const value: I18nContextValue = {
    t,
    tp,
    locale,
    isRTL: i18n.isRTL(),
    direction: i18n.getDirection(),
  };

  return React.createElement(I18nContext.Provider, { value }, children);
};

I18nProvider.displayName = 'I18nProvider';

/** Hook for accessing i18n in components.
 *  Falls back to direct i18n singleton when called outside React render cycle. */
export function useTranslation(): I18nContextValue {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useContext(I18nContext);
  } catch {
    // Fallback for non-React contexts (e.g., direct function calls in tests)
    return {
      t: i18n.t.bind(i18n),
      tp: i18n.pluralize.bind(i18n),
      locale: i18n.getLocale(),
      isRTL: i18n.isRTL(),
      direction: i18n.getDirection(),
    };
  }
}
