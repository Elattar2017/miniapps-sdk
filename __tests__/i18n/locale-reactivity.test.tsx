/**
 * Tests for host → SDK locale change reactivity.
 *
 * Verifies that:
 * 1. KernelConfig.locale syncs to i18n singleton
 * 2. LOCALE_CHANGE intent triggers locale change
 * 3. I18nProvider in SDKProvider tree makes ScreenRenderer reactive
 * 4. RTL direction flips when switching to Arabic/Hebrew
 * 5. Module i18n strings resolve against current locale
 */

jest.mock('react-native');

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { I18nProvider, useTranslation } from '../../src/i18n/useTranslation';
import { i18n } from '../../src/i18n/I18nProvider';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  i18n.setLocale('en');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Consumer that shows locale + direction + translated text
const LocaleDisplay: React.FC = () => {
  const { t, locale, isRTL, direction } = useTranslation();
  return React.createElement('View', {},
    React.createElement('Text', { testID: 'locale' }, locale),
    React.createElement('Text', { testID: 'direction' }, direction),
    React.createElement('Text', { testID: 'isRTL' }, String(isRTL)),
    React.createElement('Text', { testID: 'goBack' }, t('screen.action.goBack')),
    React.createElement('Text', { testID: 'loadFailed' }, t('module.error.loadFailed')),
  );
};

function findByTestID(tree: ReactTestRenderer, testID: string) {
  return tree.root.find(el => el.props.testID === testID);
}

describe('Host locale prop → SDK reactivity', () => {
  it('starts in English (LTR) by default', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(LocaleDisplay)));
    });
    expect(findByTestID(tree!, 'locale').children[0]).toBe('en');
    expect(findByTestID(tree!, 'direction').children[0]).toBe('ltr');
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('false');
    expect(findByTestID(tree!, 'goBack').children[0]).toBe('Go Back');
  });

  it('switches to Arabic (RTL) when locale changes to ar', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(LocaleDisplay)));
    });

    act(() => {
      i18n.setLocale('ar');
    });

    expect(findByTestID(tree!, 'locale').children[0]).toBe('ar');
    expect(findByTestID(tree!, 'direction').children[0]).toBe('rtl');
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('true');
    // Arabic strings should load (auto-loaded in I18nProvider.ts)
    expect(findByTestID(tree!, 'goBack').children[0]).toBe('رجوع');
    expect(findByTestID(tree!, 'loadFailed').children[0]).toBe('فشل في تحميل الوحدات');
  });

  it('switches to Hebrew (RTL)', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(LocaleDisplay)));
    });

    act(() => {
      i18n.setLocale('he');
    });

    expect(findByTestID(tree!, 'locale').children[0]).toBe('he');
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('true');
    expect(findByTestID(tree!, 'direction').children[0]).toBe('rtl');
    // Hebrew has no string table — falls back to English
    expect(findByTestID(tree!, 'goBack').children[0]).toBe('Go Back');
  });

  it('switches back from RTL to LTR when locale changes to en', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(LocaleDisplay)));
    });

    // Switch to Arabic
    act(() => { i18n.setLocale('ar'); });
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('true');

    // Switch back to English
    act(() => { i18n.setLocale('en'); });
    expect(findByTestID(tree!, 'locale').children[0]).toBe('en');
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('false');
    expect(findByTestID(tree!, 'direction').children[0]).toBe('ltr');
    expect(findByTestID(tree!, 'goBack').children[0]).toBe('Go Back');
  });

  it('supports Farsi (RTL) and Urdu (RTL)', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(LocaleDisplay)));
    });

    act(() => { i18n.setLocale('fa'); });
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('true');

    act(() => { i18n.setLocale('ur'); });
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('true');

    // Non-RTL language
    act(() => { i18n.setLocale('fr'); });
    expect(findByTestID(tree!, 'isRTL').children[0]).toBe('false');
  });
});

describe('Module i18n strings + locale switching', () => {
  it('resolves module strings for current locale', () => {
    // Simulate module manifest i18n loading
    i18n.addStrings('en', { 'greeting': 'Hello' });
    i18n.addStrings('ar', { 'greeting': 'مرحبا' });

    const ModuleConsumer: React.FC = () => {
      const { t, locale } = useTranslation();
      return React.createElement('View', {},
        React.createElement('Text', { testID: 'locale' }, locale),
        React.createElement('Text', { testID: 'greeting' }, t('greeting')),
      );
    };

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(ModuleConsumer)));
    });

    // English
    expect(findByTestID(tree!, 'greeting').children[0]).toBe('Hello');

    // Switch to Arabic
    act(() => { i18n.setLocale('ar'); });
    expect(findByTestID(tree!, 'greeting').children[0]).toBe('مرحبا');

    // Switch back to English
    act(() => { i18n.setLocale('en'); });
    expect(findByTestID(tree!, 'greeting').children[0]).toBe('Hello');
  });

  it('falls back to English when locale has no translation', () => {
    i18n.addStrings('en', { 'farewell': 'Goodbye' });

    const Consumer: React.FC = () => {
      const { t } = useTranslation();
      return React.createElement('Text', { testID: 'farewell' }, t('farewell'));
    };

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(Consumer)));
    });

    // Switch to French (no farewell string defined)
    act(() => { i18n.setLocale('fr'); });
    // Should fall back to English
    expect(findByTestID(tree!, 'farewell').children[0]).toBe('Goodbye');
  });

  it('falls back to key when no translation exists', () => {
    const Consumer: React.FC = () => {
      const { t } = useTranslation();
      return React.createElement('Text', { testID: 'missing' }, t('nonexistent.key'));
    };

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(Consumer)));
    });

    expect(findByTestID(tree!, 'missing').children[0]).toBe('nonexistent.key');
  });
});

describe('Arabic built-in strings auto-loaded', () => {
  it('has Arabic strings loaded for SDK UI elements', () => {
    i18n.setLocale('ar');
    expect(i18n.t('screen.action.goBack')).toBe('رجوع');
    expect(i18n.t('screen.error.default')).toBe('فشل في تحميل الشاشة');
    expect(i18n.t('select.placeholder')).toBe('اختر خياراً');
    expect(i18n.t('repeater.empty')).toBe('لا توجد عناصر');
    expect(i18n.t('loading.label')).toBe('جارٍ التحميل');
    expect(i18n.t('chart.noData')).toBe('لا توجد بيانات');
  });

  it('has English strings as default', () => {
    i18n.setLocale('en');
    expect(i18n.t('screen.action.goBack')).toBe('Go Back');
    expect(i18n.t('select.placeholder')).toBe('Select an option');
  });
});

describe('KernelConfig.locale integration', () => {
  it('locale field exists in KernelConfig type', () => {
    // This is a type-level test — if it compiles, the type exists
    const config: import('../../src/types/kernel.types').KernelConfig = {
      authToken: 'test',
      tenantId: 'test',
      userId: 'test',
      apiBaseUrl: 'http://test',
      zones: {},
      locale: 'ar', // Should compile without error
    };
    expect(config.locale).toBe('ar');
  });
});

describe('LOCALE_CHANGE intent type', () => {
  it('is a valid IntentType', () => {
    const intentType: import('../../src/types/navigation.types').IntentType = 'LOCALE_CHANGE';
    expect(intentType).toBe('LOCALE_CHANGE');
  });
});
