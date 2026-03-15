jest.mock("react-native");

import { I18nManager } from '../../src/i18n/I18nProvider';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('I18nManager', () => {
  let mgr: I18nManager;

  beforeEach(() => {
    mgr = new I18nManager('en');
    mgr.addStrings('en', {
      'hello': 'Hello',
      'greeting': 'Hello {{name}}',
      'item.count.zero': 'No items',
      'item.count.one': '1 item',
      'item.count.other': '{{count}} items',
    });
  });

  describe('pluralize', () => {
    it('returns zero form when count is 0', () => {
      expect(mgr.pluralize('item.count', 0)).toBe('No items');
    });

    it('returns one form when count is 1', () => {
      expect(mgr.pluralize('item.count', 1)).toBe('1 item');
    });

    it('returns other form when count is > 1', () => {
      expect(mgr.pluralize('item.count', 5)).toBe('5 items');
    });

    it('auto-injects count parameter', () => {
      expect(mgr.pluralize('item.count', 42)).toBe('42 items');
    });

    it('falls back to .other when specific form is missing', () => {
      mgr.addStrings('en', { 'thing.other': '{{count}} things' });
      expect(mgr.pluralize('thing', 0)).toBe('0 things');
    });

    it('falls back to key when no plural forms exist', () => {
      expect(mgr.pluralize('nonexistent', 5)).toBe('nonexistent');
    });

    it('merges additional params with count', () => {
      mgr.addStrings('en', { 'items.other': '{{count}} {{type}} items' });
      expect(mgr.pluralize('items', 3, { type: 'blue' })).toBe('3 blue items');
    });
  });

  describe('isRTL', () => {
    it('returns false for English', () => {
      mgr.setLocale('en');
      expect(mgr.isRTL()).toBe(false);
    });

    it('returns true for Arabic', () => {
      mgr.setLocale('ar');
      expect(mgr.isRTL()).toBe(true);
    });

    it('returns true for Hebrew', () => {
      mgr.setLocale('he');
      expect(mgr.isRTL()).toBe(true);
    });

    it('returns true for Farsi', () => {
      mgr.setLocale('fa');
      expect(mgr.isRTL()).toBe(true);
    });

    it('returns true for Urdu', () => {
      mgr.setLocale('ur');
      expect(mgr.isRTL()).toBe(true);
    });

    it('returns false for French', () => {
      mgr.setLocale('fr');
      expect(mgr.isRTL()).toBe(false);
    });
  });

  describe('getDirection', () => {
    it('returns ltr for English', () => {
      mgr.setLocale('en');
      expect(mgr.getDirection()).toBe('ltr');
    });

    it('returns rtl for Arabic', () => {
      mgr.setLocale('ar');
      expect(mgr.getDirection()).toBe('rtl');
    });
  });

  describe('addListener', () => {
    it('calls listener on setLocale', () => {
      const listener = jest.fn();
      mgr.addListener(listener);
      mgr.setLocale('ar');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = mgr.addListener(listener);
      unsubscribe();
      mgr.setLocale('ar');
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      mgr.addListener(listener1);
      mgr.addListener(listener2);
      mgr.setLocale('fr');
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });
});
