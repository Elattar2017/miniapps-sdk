/**
 * StorageAdapter Platform Factory Test Suite
 *
 * Tests createPlatformStorage factory, isInitialized, and round-trip operations.
 */

import {
  createPlatformStorage,
  StorageAdapter,
  createStorageAdapter,
} from '../../src/adapters/StorageAdapter';
import type { IStorageBackend } from '../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StorageAdapter platform factory', () => {
  it('createPlatformStorage returns IStorageBackend', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    expect(storage).toBeDefined();
    expect(typeof storage.getString).toBe('function');
    expect(typeof storage.setString).toBe('function');
    expect(typeof storage.delete).toBe('function');
    expect(typeof storage.getAllKeys).toBe('function');
    expect(typeof storage.clearAll).toBe('function');
  });

  it('getString / setString round-trip works', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    storage.setString('key1', 'value1');
    expect(storage.getString('key1')).toBe('value1');
  });

  it('delete removes key', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    storage.setString('key1', 'value1');
    storage.delete('key1');
    // After delete, getString should return undefined or null
    const result = storage.getString('key1');
    expect(result == null || result === undefined).toBe(true);
  });

  it('getAllKeys returns all stored keys', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    storage.setString('a', '1');
    storage.setString('b', '2');
    storage.setString('c', '3');
    const keys = storage.getAllKeys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
  });

  it('clearAll empties storage', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    storage.setString('x', '1');
    storage.setString('y', '2');
    storage.clearAll();
    expect(storage.getAllKeys()).toHaveLength(0);
  });

  it('isInitialized returns true after creation', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.isInitialized()).toBe(true);
  });

  it('getString for non-existent key returns undefined or null', () => {
    const storage = createPlatformStorage({ id: 'test-store' });
    const result = storage.getString('nonexistent');
    expect(result == null || result === undefined).toBe(true);
  });

  it('falls back to InMemoryStorage when MMKV unavailable', () => {
    // In test environment MMKV is not available, so factory always falls back
    const storage = createPlatformStorage({ id: 'fallback-test' });
    storage.setString('test', 'works');
    expect(storage.getString('test')).toBe('works');
  });
});
