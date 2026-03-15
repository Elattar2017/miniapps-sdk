jest.mock("react-native");

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { I18nProvider, useTranslation } from '../../src/i18n/useTranslation';
import { i18n } from '../../src/i18n/I18nProvider';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // Reset locale
  i18n.setLocale('en');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Test component that uses useTranslation
const TestConsumer: React.FC = () => {
  const { t, tp, locale, isRTL, direction } = useTranslation();
  return React.createElement('View', {},
    React.createElement('Text', { testID: 'locale' }, locale),
    React.createElement('Text', { testID: 'direction' }, direction),
    React.createElement('Text', { testID: 'isRTL' }, String(isRTL)),
    React.createElement('Text', { testID: 'translated' }, t('select.placeholder')),
    React.createElement('Text', { testID: 'pluralized' }, tp('item.count', 5)),
  );
};

function renderWithI18n(component: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => {
    tree = create(React.createElement(I18nProvider, {}, component));
  });
  return tree!;
}

function findByTestID(tree: ReactTestRenderer, testID: string) {
  return tree.root.find(el => el.props.testID === testID);
}

describe('I18nProvider + useTranslation', () => {
  it('provides t function', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    const el = findByTestID(tree, 'translated');
    expect(el.children[0]).toBe('Select an option');
  });

  it('provides tp function for pluralization', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    const el = findByTestID(tree, 'pluralized');
    expect(el.children[0]).toBe('5 items');
  });

  it('provides locale', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    const el = findByTestID(tree, 'locale');
    expect(el.children[0]).toBe('en');
  });

  it('provides direction as ltr for English', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    const el = findByTestID(tree, 'direction');
    expect(el.children[0]).toBe('ltr');
  });

  it('provides isRTL as false for English', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    const el = findByTestID(tree, 'isRTL');
    expect(el.children[0]).toBe('false');
  });

  it('re-renders when locale changes', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    expect(findByTestID(tree, 'locale').children[0]).toBe('en');

    act(() => {
      i18n.setLocale('ar');
    });

    expect(findByTestID(tree, 'locale').children[0]).toBe('ar');
  });

  it('updates direction to rtl when locale changes to Arabic', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    act(() => {
      i18n.setLocale('ar');
    });
    expect(findByTestID(tree, 'direction').children[0]).toBe('rtl');
  });

  it('updates isRTL to true when locale changes to Arabic', () => {
    const tree = renderWithI18n(React.createElement(TestConsumer));
    act(() => {
      i18n.setLocale('ar');
    });
    expect(findByTestID(tree, 'isRTL').children[0]).toBe('true');
  });

  it('multiple consumers get same locale', () => {
    const tree = renderWithI18n(
      React.createElement('View', {},
        React.createElement(TestConsumer),
        React.createElement(TestConsumer),
      ),
    );
    const localeNodes = tree.root.findAll(el => el.props.testID === 'locale');
    expect(localeNodes.length).toBe(2);
    expect(localeNodes[0].children[0]).toBe('en');
    expect(localeNodes[1].children[0]).toBe('en');
  });

  it('locale change propagates to all consumers', () => {
    const tree = renderWithI18n(
      React.createElement('View', {},
        React.createElement(TestConsumer),
        React.createElement(TestConsumer),
      ),
    );

    act(() => {
      i18n.setLocale('fr');
    });

    const localeNodes = tree.root.findAll(el => el.props.testID === 'locale');
    expect(localeNodes[0].children[0]).toBe('fr');
    expect(localeNodes[1].children[0]).toBe('fr');
  });
});

describe('useTranslation outside I18nProvider', () => {
  it('works with default context value', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TestConsumer));
    });
    const el = findByTestID(tree!, 'locale');
    expect(el.children[0]).toBe('en');
  });

  it('t function works without provider', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TestConsumer));
    });
    const el = findByTestID(tree!, 'translated');
    expect(el.children[0]).toBe('Select an option');
  });
});

describe('I18nProvider', () => {
  it('has displayName', () => {
    expect(I18nProvider.displayName).toBe('I18nProvider');
  });

  it('cleans up listener on unmount', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(I18nProvider, {}, React.createElement(TestConsumer)));
    });
    act(() => {
      tree!.unmount();
    });
    // Should not throw when locale changes after unmount
    expect(() => i18n.setLocale('de')).not.toThrow();
  });
});
