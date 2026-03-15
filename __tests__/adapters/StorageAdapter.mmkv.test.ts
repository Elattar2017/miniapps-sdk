/**
 * StorageAdapter MMKV Test Suite
 *
 * Tests for MMKVStorageBackend, createPlatformStorage factory,
 * StorageAdapter.executeSql, and StorageAdapter.getTable.
 */

import {
  StorageAdapter,
  InMemoryStorage,
} from '../../src/adapters/StorageAdapter';

// ---------------------------------------------------------------------------
// Shared MMKV mock — hoisted by Jest so it's always available
// ---------------------------------------------------------------------------

const mockMMKVInstance: Record<string, jest.Mock> = {
  getString: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  getAllKeys: jest.fn().mockReturnValue([]),
  contains: jest.fn().mockReturnValue(false),
  getNumber: jest.fn(),
  getBoolean: jest.fn(),
  clearAll: jest.fn(),
};

const MockMMKV = jest.fn().mockImplementation(() => mockMMKVInstance);

jest.mock('react-native-mmkv', () => ({ MMKV: MockMMKV }), { virtual: true });

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// MMKVStorageBackend - unavailable scenario
// ---------------------------------------------------------------------------

describe('MMKVStorageBackend', () => {
  it('throws when MMKV constructor fails', () => {
    // Temporarily make the MMKV constructor throw to simulate unavailability
    MockMMKV.mockImplementationOnce(() => {
      throw new Error('MMKV init failed');
    });

    jest.resetModules();
    const { MMKVStorageBackend } = require('../../src/adapters/StorageAdapter');
    expect(() => new MMKVStorageBackend({ id: 'test' })).toThrow(
      'react-native-mmkv is not available',
    );
  });
});

// ---------------------------------------------------------------------------
// MMKVStorageBackend - with mocked MMKV
// ---------------------------------------------------------------------------

describe('MMKVStorageBackend with mocked MMKV', () => {
  let MMKVStorageBackendClass: any;

  beforeAll(() => {
    jest.resetModules();
    const mod = require('../../src/adapters/StorageAdapter');
    MMKVStorageBackendClass = mod.MMKVStorageBackend;
  });

  beforeEach(() => {
    // Clear call history but keep implementations
    Object.values(mockMMKVInstance).forEach((fn) => fn.mockClear());
    mockMMKVInstance.getString.mockReturnValue(undefined);
    mockMMKVInstance.getAllKeys.mockReturnValue([]);
    mockMMKVInstance.contains.mockReturnValue(false);
    MockMMKV.mockClear();
  });

  function createBackend(): any {
    return new MMKVStorageBackendClass({ id: 'test-store' });
  }

  it('getString delegates to MMKV instance', () => {
    const backend = createBackend();
    mockMMKVInstance.getString.mockReturnValue('hello');

    expect(backend.getString('key1')).toBe('hello');
    expect(mockMMKVInstance.getString).toHaveBeenCalledWith('key1');
  });

  it('getString returns undefined when MMKV returns undefined', () => {
    const backend = createBackend();
    mockMMKVInstance.getString.mockReturnValue(undefined);

    expect(backend.getString('missing')).toBeUndefined();
  });

  it('setString delegates to MMKV.set', () => {
    const backend = createBackend();
    backend.setString('k', 'v');

    expect(mockMMKVInstance.set).toHaveBeenCalledWith('k', 'v');
  });

  it('delete delegates to MMKV.delete', () => {
    const backend = createBackend();
    backend.delete('k');

    expect(mockMMKVInstance.delete).toHaveBeenCalledWith('k');
  });

  it('getAllKeys delegates to MMKV.getAllKeys', () => {
    const backend = createBackend();
    mockMMKVInstance.getAllKeys.mockReturnValue(['a', 'b', 'c']);

    expect(backend.getAllKeys()).toEqual(['a', 'b', 'c']);
  });

  it('clearAll delegates to MMKV.clearAll', () => {
    const backend = createBackend();
    backend.clearAll();

    expect(mockMMKVInstance.clearAll).toHaveBeenCalled();
  });

  it('contains returns true for existing key', () => {
    const backend = createBackend();
    mockMMKVInstance.contains.mockReturnValue(true);

    expect(backend.contains('existing-key')).toBe(true);
    expect(mockMMKVInstance.contains).toHaveBeenCalledWith('existing-key');
  });

  it('contains returns false for missing key', () => {
    const backend = createBackend();

    expect(backend.contains('missing-key')).toBe(false);
    expect(mockMMKVInstance.contains).toHaveBeenCalledWith('missing-key');
  });

  it('getNumber delegates to MMKV.getNumber', () => {
    const backend = createBackend();
    mockMMKVInstance.getNumber.mockReturnValue(42);

    expect(backend.getNumber('count')).toBe(42);
    expect(mockMMKVInstance.getNumber).toHaveBeenCalledWith('count');
  });

  it('getBoolean delegates to MMKV.getBoolean', () => {
    const backend = createBackend();
    mockMMKVInstance.getBoolean.mockReturnValue(true);

    expect(backend.getBoolean('flag')).toBe(true);
    expect(mockMMKVInstance.getBoolean).toHaveBeenCalledWith('flag');
  });

  it('MMKVInstance type replaces any (compile-time verification)', () => {
    const backend = createBackend();
    expect(backend).toBeDefined();
    expect(typeof backend.getString).toBe('function');
    expect(typeof backend.setString).toBe('function');
    expect(typeof backend.delete).toBe('function');
    expect(typeof backend.getAllKeys).toBe('function');
    expect(typeof backend.contains).toBe('function');
    expect(typeof backend.getNumber).toBe('function');
    expect(typeof backend.getBoolean).toBe('function');
    expect(typeof backend.clearAll).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// createPlatformStorage
// ---------------------------------------------------------------------------

describe('createPlatformStorage', () => {
  it('returns MMKV-backed storage when available', () => {
    jest.resetModules();
    const { createPlatformStorage } = require('../../src/adapters/StorageAdapter');
    const backend = createPlatformStorage({ id: 'test' });

    // Should use MMKV (not InMemoryStorage) — verify via MMKV mock interaction
    backend.setString('k', 'v');
    expect(mockMMKVInstance.set).toHaveBeenCalledWith('k', 'v');
  });

  it('falls back to InMemoryStorage when MMKV constructor fails', () => {
    MockMMKV.mockImplementationOnce(() => {
      throw new Error('MMKV init failed');
    });

    jest.resetModules();
    const { createPlatformStorage } = require('../../src/adapters/StorageAdapter');
    const backend = createPlatformStorage({ id: 'test' });

    // InMemoryStorage: setString + getString round-trip
    backend.setString('k', 'v');
    expect(backend.getString('k')).toBe('v');
  });
});

// ---------------------------------------------------------------------------
// StorageAdapter.executeSql
// ---------------------------------------------------------------------------

describe('StorageAdapter.executeSql', () => {
  it('INSERT creates a row in the table', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    const result = adapter.executeSql(
      'INSERT INTO users (name, age) VALUES (?, ?)',
      ['Alice', 30],
    );

    expect(result).toEqual({ rows: [] });
    expect(adapter.getTable('users')).toEqual([{ name: 'Alice', age: 30 }]);
  });

  it('INSERT creates table if it does not exist', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.executeSql(
      'INSERT INTO new_table (col1) VALUES (?)',
      ['value1'],
    );

    expect(adapter.getTable('new_table')).toEqual([{ col1: 'value1' }]);
  });

  it('INSERT appends multiple rows', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.executeSql('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'first']);
    adapter.executeSql('INSERT INTO items (id, name) VALUES (?, ?)', [2, 'second']);

    expect(adapter.getTable('items')).toEqual([
      { id: 1, name: 'first' },
      { id: 2, name: 'second' },
    ]);
  });

  it('INSERT with no params uses empty values', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.executeSql('INSERT INTO logs (msg) VALUES (?)');

    expect(adapter.getTable('logs')).toEqual([{ msg: undefined }]);
  });

  it('throws on unsupported SQL operations', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });

    expect(() => adapter.executeSql('UPDATE users SET name = ?', ['Bob'])).toThrow(
      /Unsupported SQL operation/,
    );
  });

  it('throws on SELECT (not supported by executeSql)', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });

    expect(() => adapter.executeSql('SELECT * FROM users')).toThrow(
      /Unsupported SQL operation/,
    );
  });
});

// ---------------------------------------------------------------------------
// StorageAdapter.getTable
// ---------------------------------------------------------------------------

describe('StorageAdapter.getTable', () => {
  it('returns inserted rows for existing table', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.executeSql('INSERT INTO products (sku, price) VALUES (?, ?)', ['ABC', 9.99]);

    const rows = adapter.getTable('products');
    expect(rows).toEqual([{ sku: 'ABC', price: 9.99 }]);
  });

  it('returns undefined for non-existent table', () => {
    const adapter = new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.getTable('nonexistent')).toBeUndefined();
  });
});
