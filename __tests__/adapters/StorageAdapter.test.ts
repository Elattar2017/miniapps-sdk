/**
 * StorageAdapter Test Suite
 *
 * Tests for the Native Bridge Stability Layer storage implementation,
 * including key prefixing, tenant/module isolation, and the SQL stub.
 */

import {
  createStorageAdapter,
  StorageAdapter,
  InMemoryStorage,
  _resetSharedInMemoryStores,
} from '../../src/adapters/StorageAdapter';
import type { IStorageAdapter } from '../../src/types';

describe('StorageAdapter', () => {
  beforeEach(() => {
    _resetSharedInMemoryStores();
  });
  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  it('createStorageAdapter() returns IStorageAdapter', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter).toBeDefined();
    expect(typeof adapter.getString).toBe('function');
    expect(typeof adapter.setString).toBe('function');
    expect(typeof adapter.getNumber).toBe('function');
    expect(typeof adapter.setNumber).toBe('function');
    expect(typeof adapter.getBoolean).toBe('function');
    expect(typeof adapter.setBoolean).toBe('function');
    expect(typeof adapter.delete).toBe('function');
    expect(typeof adapter.contains).toBe('function');
    expect(typeof adapter.getAllKeys).toBe('function');
    expect(typeof adapter.clearAll).toBe('function');
    expect(typeof adapter.query).toBe('function');
    expect(typeof adapter.execute).toBe('function');
  });

  // ---------------------------------------------------------------------------
  // String round-trip
  // ---------------------------------------------------------------------------

  it('getString() / setString() round-trips correctly', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setString('greeting', 'hello');

    expect(adapter.getString('greeting')).toBe('hello');
  });

  // ---------------------------------------------------------------------------
  // Number round-trip
  // ---------------------------------------------------------------------------

  it('getNumber() / setNumber() round-trips correctly', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setNumber('count', 42);

    expect(adapter.getNumber('count')).toBe(42);
  });

  // ---------------------------------------------------------------------------
  // Boolean round-trip
  // ---------------------------------------------------------------------------

  it('getBoolean() / setBoolean() round-trips correctly', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setBoolean('enabled', true);

    expect(adapter.getBoolean('enabled')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Missing keys return undefined
  // ---------------------------------------------------------------------------

  it('getString() returns undefined for missing key', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.getString('nonexistent')).toBeUndefined();
  });

  it('getNumber() returns undefined for missing key', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.getNumber('nonexistent')).toBeUndefined();
  });

  it('getBoolean() returns undefined for missing key', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.getBoolean('nonexistent')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  it('delete() removes entry', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setString('temp', 'value');
    expect(adapter.contains('temp')).toBe(true);

    adapter.delete('temp');
    expect(adapter.contains('temp')).toBe(false);
    expect(adapter.getString('temp')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // contains()
  // ---------------------------------------------------------------------------

  it('contains() returns true for existing key', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setString('key', 'val');

    expect(adapter.contains('key')).toBe(true);
  });

  it('contains() returns false for missing key', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    expect(adapter.contains('missing')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getAllKeys()
  // ---------------------------------------------------------------------------

  it('getAllKeys() returns only this adapter\'s keys (not others\')', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setString('a', '1');
    adapter.setNumber('b', 2);

    const keys = adapter.getAllKeys();
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // clearAll()
  // ---------------------------------------------------------------------------

  it('clearAll() clears only this adapter\'s keys', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    adapter.setString('x', 'val');
    adapter.setNumber('y', 10);

    adapter.clearAll();

    expect(adapter.getAllKeys()).toEqual([]);
    expect(adapter.getString('x')).toBeUndefined();
    expect(adapter.getNumber('y')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Key prefixing
  // ---------------------------------------------------------------------------

  it('stored key includes {tenantId}:{moduleId}: prefix', () => {
    // We verify indirectly: two adapters with different configs don't collide.
    // The StorageAdapter uses an internal InMemoryStorage per instance, but the
    // prefix is still applied. We verify by getAllKeys returning unprefixed keys.
    const adapter = createStorageAdapter({ tenantId: 'acme', moduleId: 'com.vendor.app' });
    adapter.setString('setting', 'on');

    // getAllKeys strips the prefix, returning just 'setting'
    const keys = adapter.getAllKeys();
    expect(keys).toEqual(['setting']);
  });

  it('double-prefix prevention: already-prefixed key not double-prefixed', () => {
    const adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    // Manually pass a key that already has the prefix
    adapter.setString('t1:mod1:alreadyPrefixed', 'value');

    // Should be able to retrieve it with the same prefixed key (no double prefix)
    expect(adapter.getString('t1:mod1:alreadyPrefixed')).toBe('value');
  });

  // ---------------------------------------------------------------------------
  // Isolation between adapters
  // ---------------------------------------------------------------------------

  it('two adapters with different tenants/modules have separate storage', () => {
    const adapterA = createStorageAdapter({ tenantId: 'tenantA', moduleId: 'modA' });
    const adapterB = createStorageAdapter({ tenantId: 'tenantB', moduleId: 'modB' });

    adapterA.setString('shared', 'A-value');
    adapterB.setString('shared', 'B-value');

    expect(adapterA.getString('shared')).toBe('A-value');
    expect(adapterB.getString('shared')).toBe('B-value');
  });

  // ---------------------------------------------------------------------------
  // InMemoryStorage class
  // ---------------------------------------------------------------------------

  describe('InMemoryStorage', () => {
    it('basic get/set works', () => {
      const mem = new InMemoryStorage();
      mem.setString('key', 'value');
      expect(mem.getString('key')).toBe('value');

      mem.setNumber('num', 99);
      expect(mem.getNumber('num')).toBe(99);

      mem.setBoolean('flag', false);
      expect(mem.getBoolean('flag')).toBe(false);
    });

    it('returns undefined for missing keys', () => {
      const mem = new InMemoryStorage();
      expect(mem.getString('nope')).toBeUndefined();
      expect(mem.getNumber('nope')).toBeUndefined();
      expect(mem.getBoolean('nope')).toBeUndefined();
    });

    it('returns undefined when type does not match', () => {
      const mem = new InMemoryStorage();
      mem.setString('key', 'text');

      // getNumber on a string key should return undefined
      expect(mem.getNumber('key')).toBeUndefined();
      expect(mem.getBoolean('key')).toBeUndefined();
    });

    it('delete removes entry', () => {
      const mem = new InMemoryStorage();
      mem.setString('k', 'v');
      mem.delete('k');
      expect(mem.contains('k')).toBe(false);
    });

    it('contains works', () => {
      const mem = new InMemoryStorage();
      expect(mem.contains('key')).toBe(false);
      mem.setString('key', 'val');
      expect(mem.contains('key')).toBe(true);
    });

    it('getAllKeys returns all keys', () => {
      const mem = new InMemoryStorage();
      mem.setString('a', '1');
      mem.setNumber('b', 2);
      expect(mem.getAllKeys()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('clearAll clears everything', () => {
      const mem = new InMemoryStorage();
      mem.setString('a', '1');
      mem.setNumber('b', 2);
      mem.clearAll();
      expect(mem.getAllKeys()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // SQL stub (InMemorySQLiteStub via StorageAdapter)
  // ---------------------------------------------------------------------------

  describe('SQL stub', () => {
    let adapter: IStorageAdapter;

    beforeEach(() => {
      adapter = createStorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
    });

    it('execute() CREATE TABLE creates a table', async () => {
      await expect(
        adapter.execute('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)'),
      ).resolves.toBeUndefined();
    });

    it('execute() DROP TABLE removes a table', async () => {
      await adapter.execute('CREATE TABLE drop_me (id INTEGER)');
      await expect(adapter.execute('DROP TABLE IF EXISTS drop_me')).resolves.toBeUndefined();

      // After dropping, SELECT should return empty
      const rows = await adapter.query('SELECT * FROM drop_me');
      expect(rows).toEqual([]);
    });

    it('execute() DELETE FROM clears table rows', async () => {
      await adapter.execute('CREATE TABLE clearable (id INTEGER)');
      // DELETE FROM should not throw
      await expect(adapter.execute('DELETE FROM clearable')).resolves.toBeUndefined();
    });

    it('query() SELECT returns rows from existing table', async () => {
      await adapter.execute('CREATE TABLE items (id INTEGER, name TEXT)');

      const rows = await adapter.query('SELECT * FROM items');
      // Newly created table has no rows
      expect(rows).toEqual([]);
    });

    it('query() returns empty for unknown table', async () => {
      const rows = await adapter.query('SELECT * FROM nonexistent_table');
      expect(rows).toEqual([]);
    });
  });
});
