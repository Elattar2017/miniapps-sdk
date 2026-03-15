/**
 * SQLite Adapter Coherence Test Suite
 *
 * Tests that executeSql and execute share the same table tracking,
 * so tables are visible regardless of which method created them.
 */

import { StorageAdapter, createStorageAdapter } from '../../src/adapters/StorageAdapter';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SQLite adapter coherence', () => {
  function createAdapter(): StorageAdapter {
    return new StorageAdapter({ tenantId: 't1', moduleId: 'mod1' });
  }

  it('execute creates table → getTableNames includes it', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT, title TEXT)');
    expect(adapter.getTableNames()).toContain('tasks');
  });

  it('executeSql inserts row → getTable returns it', () => {
    const adapter = createAdapter();
    // executeSql with INSERT creates table implicitly
    adapter.executeSql('INSERT INTO items (id, name) VALUES (?, ?)', ['1', 'Item A']);
    const rows = adapter.getTable('items');
    expect(rows).toBeDefined();
    expect(rows).toHaveLength(1);
    expect(rows![0]).toEqual({ id: '1', name: 'Item A' });
  });

  it('both methods on same table: no duplicates in getTableNames', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE IF NOT EXISTS orders (id TEXT)');
    adapter.executeSql('INSERT INTO orders (id) VALUES (?)', ['ord-1']);
    const names = adapter.getTableNames();
    const count = names.filter(n => n === 'orders').length;
    expect(count).toBe(1);
  });

  it('executeSql insert → execute select (query): data accessible', async () => {
    const adapter = createAdapter();
    adapter.executeSql('INSERT INTO records (id, value) VALUES (?, ?)', ['r1', 'v1']);
    const rows = await adapter.query<{ id: string; value: string }>('SELECT * FROM records');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('r1');
  });

  it('execute create + executeSql insert: data accessible via getTable', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE IF NOT EXISTS notes (id TEXT, body TEXT)');
    adapter.executeSql('INSERT INTO notes (id, body) VALUES (?, ?)', ['n1', 'Hello']);
    const rows = adapter.getTable('notes');
    expect(rows).toHaveLength(1);
    expect(rows![0].body).toBe('Hello');
  });

  it('drop table via execute: removed from getTableNames', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE IF NOT EXISTS temp (id TEXT)');
    expect(adapter.getTableNames()).toContain('temp');
    await adapter.execute('DROP TABLE IF EXISTS temp');
    expect(adapter.getTableNames()).not.toContain('temp');
  });

  it('getTableNames after mixed operations: consistent list', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE IF NOT EXISTS alpha (id TEXT)');
    adapter.executeSql('INSERT INTO beta (id) VALUES (?)', ['b1']);
    await adapter.execute('CREATE TABLE IF NOT EXISTS gamma (id TEXT)');

    const names = adapter.getTableNames();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
    expect(names).toContain('gamma');
    expect(names).toHaveLength(3);
  });

  it('delete from table clears rows but keeps table', async () => {
    const adapter = createAdapter();
    adapter.executeSql('INSERT INTO logs (id, msg) VALUES (?, ?)', ['1', 'first']);
    adapter.executeSql('INSERT INTO logs (id, msg) VALUES (?, ?)', ['2', 'second']);
    await adapter.execute('DELETE FROM logs');
    expect(adapter.getTableNames()).toContain('logs');
    const rows = adapter.getTable('logs');
    expect(rows).toHaveLength(0);
  });
});
