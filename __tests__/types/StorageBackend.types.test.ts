jest.mock("react-native");

import { InMemoryStorage } from '../../src/adapters/StorageAdapter';
import type { IStorageBackend } from '../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IStorageBackend conformance', () => {
  let store: IStorageBackend;

  beforeEach(() => {
    store = new InMemoryStorage();
  });

  it('getString returns undefined for missing key', () => {
    expect(store.getString('missing')).toBeUndefined();
  });

  it('setString + getString round-trip', () => {
    store.setString('key', 'value');
    expect(store.getString('key')).toBe('value');
  });

  it('getNumber returns undefined for missing key', () => {
    expect(store.getNumber('missing')).toBeUndefined();
  });

  it('setNumber + getNumber round-trip', () => {
    store.setNumber('num', 42);
    expect(store.getNumber('num')).toBe(42);
  });

  it('getBoolean returns undefined for missing key', () => {
    expect(store.getBoolean('missing')).toBeUndefined();
  });

  it('setBoolean + getBoolean round-trip', () => {
    store.setBoolean('flag', true);
    expect(store.getBoolean('flag')).toBe(true);
  });

  it('contains returns false for missing key', () => {
    expect(store.contains('missing')).toBe(false);
  });

  it('contains returns true for existing key', () => {
    store.setString('key', 'val');
    expect(store.contains('key')).toBe(true);
  });

  it('delete removes key', () => {
    store.setString('key', 'val');
    store.delete('key');
    expect(store.getString('key')).toBeUndefined();
  });

  it('clearAll removes all keys', () => {
    store.setString('a', '1');
    store.setNumber('b', 2);
    store.clearAll();
    expect(store.getAllKeys()).toEqual([]);
  });
});
