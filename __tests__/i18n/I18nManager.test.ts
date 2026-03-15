import { I18nManager } from '../../src/i18n/I18nProvider';

describe('I18nManager', () => {
  let manager: I18nManager;

  beforeEach(() => {
    manager = new I18nManager();
  });

  test('defaults to "en" locale', () => {
    expect(manager.getLocale()).toBe('en');
  });

  test('t() returns key when no strings loaded', () => {
    expect(manager.t('some.missing.key')).toBe('some.missing.key');
  });

  test('t() returns English string after addStrings', () => {
    manager.addStrings('en', { 'hello': 'Hello World' });
    expect(manager.t('hello')).toBe('Hello World');
  });

  test('t() with parameter interpolation ({{name}} -> actual value)', () => {
    manager.addStrings('en', { 'greeting': 'Hello, {{name}}!' });
    expect(manager.t('greeting', { name: 'Alice' })).toBe('Hello, Alice!');
  });

  test('t() with multiple parameters', () => {
    manager.addStrings('en', { 'info': '{{name}} is {{age}} years old' });
    expect(manager.t('info', { name: 'Bob', age: '30' })).toBe('Bob is 30 years old');
  });

  test('t() with empty params object - no interpolation', () => {
    manager.addStrings('en', { 'static': 'No params here' });
    expect(manager.t('static', {})).toBe('No params here');
  });

  test('setLocale() changes locale', () => {
    manager.setLocale('fr');
    expect(manager.getLocale()).toBe('fr');
  });

  test('getLocale() returns current locale', () => {
    expect(manager.getLocale()).toBe('en');
    manager.setLocale('de');
    expect(manager.getLocale()).toBe('de');
  });

  test('addStrings() merges strings for a locale', () => {
    manager.addStrings('en', { 'key1': 'Value 1' });
    manager.addStrings('en', { 'key2': 'Value 2' });
    expect(manager.t('key1')).toBe('Value 1');
    expect(manager.t('key2')).toBe('Value 2');
  });

  test('addStrings() overwrites existing key', () => {
    manager.addStrings('en', { 'key1': 'Original' });
    manager.addStrings('en', { 'key1': 'Updated' });
    expect(manager.t('key1')).toBe('Updated');
  });

  test('fallback: locale string missing -> falls back to "en"', () => {
    manager.addStrings('en', { 'common': 'English fallback' });
    manager.addStrings('fr', { 'other': 'French value' });
    manager.setLocale('fr');
    expect(manager.t('common')).toBe('English fallback');
  });

  test('fallback: both locale and "en" missing -> returns key', () => {
    manager.addStrings('en', { 'exists': 'Yes' });
    manager.addStrings('fr', { 'autre': 'Oui' });
    manager.setLocale('fr');
    expect(manager.t('totally.missing.key')).toBe('totally.missing.key');
  });

  test('locale "en" does not double-fallback (no infinite loop)', () => {
    manager.setLocale('en');
    // Key that does not exist at all - should just return the key
    expect(manager.t('nonexistent')).toBe('nonexistent');
  });

  test('t() with non-existent parameter placeholder left as-is', () => {
    manager.addStrings('en', { 'template': 'Hello {{name}}, your code is {{code}}' });
    // Only provide 'name', not 'code'
    expect(manager.t('template', { name: 'Alice' })).toBe('Hello Alice, your code is {{code}}');
  });
});
