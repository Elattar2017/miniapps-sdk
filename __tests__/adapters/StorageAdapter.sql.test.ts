jest.mock("react-native");

import { StorageAdapter } from '../../src/adapters/StorageAdapter';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createAdapter() {
  return new StorageAdapter({ tenantId: 'test', moduleId: 'mod' });
}

describe('InMemorySQLiteStub Enhanced SQL', () => {
  describe('INSERT INTO with params', () => {
    it('inserts a row via execute with params', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name, age)');
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30]);
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows).toEqual([{ id: 1, name: 'Alice', age: 30 }]);
    });

    it('inserts multiple rows', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows.length).toBe(2);
    });

    it('auto-creates table on INSERT if not exists', async () => {
      const adapter = createAdapter();
      await adapter.execute('INSERT INTO newTable (id) VALUES (?)', [1]);
      const rows = await adapter.query('SELECT * FROM newTable');
      expect(rows.length).toBe(1);
    });
  });

  describe('SELECT with column projection', () => {
    it('returns only specified columns', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name, age)');
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30]);
      const rows = await adapter.query('SELECT name, age FROM users');
      expect(rows).toEqual([{ name: 'Alice', age: 30 }]);
    });

    it('SELECT * returns all columns', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
    });
  });

  describe('SELECT with WHERE', () => {
    it('filters rows by column value', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name, age)');
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30]);
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [2, 'Bob', 25]);
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [3, 'Charlie', 30]);
      const rows = await adapter.query('SELECT * FROM users WHERE age = ?', [30]);
      expect(rows.length).toBe(2);
      expect(rows[0]).toEqual(expect.objectContaining({ name: 'Alice' }));
      expect(rows[1]).toEqual(expect.objectContaining({ name: 'Charlie' }));
    });

    it('returns empty array when no matches', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      const rows = await adapter.query('SELECT * FROM users WHERE name = ?', ['Zoe']);
      expect(rows).toEqual([]);
    });
  });

  describe('UPDATE', () => {
    it('updates matching rows', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name, age)');
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [1, 'Alice', 30]);
      await adapter.execute('INSERT INTO users (id, name, age) VALUES (?, ?, ?)', [2, 'Bob', 25]);
      await adapter.execute('UPDATE users SET name = ? WHERE id = ?', ['Alicia', 1]);
      const rows = await adapter.query('SELECT * FROM users WHERE id = ?', [1]);
      expect(rows[0]).toEqual(expect.objectContaining({ name: 'Alicia' }));
    });

    it('does not modify non-matching rows', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      await adapter.execute('UPDATE users SET name = ? WHERE id = ?', ['Updated', 1]);
      const rows = await adapter.query('SELECT * FROM users WHERE id = ?', [2]);
      expect(rows[0]).toEqual(expect.objectContaining({ name: 'Bob' }));
    });

    it('does nothing when no rows match', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('UPDATE users SET name = ? WHERE id = ?', ['Ghost', 99]);
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows[0]).toEqual(expect.objectContaining({ name: 'Alice' }));
    });
  });

  describe('DELETE with WHERE', () => {
    it('removes only matching rows', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      await adapter.execute('DELETE FROM users WHERE id = ?', [1]);
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows.length).toBe(1);
      expect(rows[0]).toEqual(expect.objectContaining({ name: 'Bob' }));
    });

    it('DELETE FROM without WHERE clears all rows', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      await adapter.execute('DELETE FROM users');
      const rows = await adapter.query('SELECT * FROM users');
      expect(rows).toEqual([]);
    });
  });

  describe('ORDER BY', () => {
    it('sorts ascending by default', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      const rows = await adapter.query<{ id: number; name: string }>('SELECT * FROM users ORDER BY id');
      expect(rows[0].id).toBe(1);
      expect(rows[1].id).toBe(2);
      expect(rows[2].id).toBe(3);
    });

    it('sorts descending', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [3, 'Charlie']);
      const rows = await adapter.query<{ id: number }>('SELECT * FROM users ORDER BY id DESC');
      expect(rows[0].id).toBe(3);
      expect(rows[1].id).toBe(1);
    });
  });

  describe('WHERE + ORDER BY combined', () => {
    it('filters then sorts', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE products (id, category, price)');
      await adapter.execute('INSERT INTO products (id, category, price) VALUES (?, ?, ?)', [1, 'food', 10]);
      await adapter.execute('INSERT INTO products (id, category, price) VALUES (?, ?, ?)', [2, 'food', 5]);
      await adapter.execute('INSERT INTO products (id, category, price) VALUES (?, ?, ?)', [3, 'electronics', 100]);
      const rows = await adapter.query<{ id: number; price: number }>('SELECT * FROM products WHERE category = ? ORDER BY price ASC', ['food']);
      expect(rows.length).toBe(2);
      expect(rows[0].price).toBe(5);
      expect(rows[1].price).toBe(10);
    });
  });

  describe('COUNT(*)', () => {
    it('returns correct count', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE users (id, name)');
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
      await adapter.execute('INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
      const result = await adapter.query<{ 'COUNT(*)': number }>('SELECT COUNT(*) FROM users');
      expect(result[0]['COUNT(*)']).toBe(2);
    });

    it('returns 0 for empty table', async () => {
      const adapter = createAdapter();
      await adapter.execute('CREATE TABLE empty (id)');
      const result = await adapter.query<{ 'COUNT(*)': number }>('SELECT COUNT(*) FROM empty');
      expect(result[0]['COUNT(*)']).toBe(0);
    });

    it('returns 0 for non-existent table', async () => {
      const adapter = createAdapter();
      const result = await adapter.query<{ 'COUNT(*)': number }>('SELECT COUNT(*) FROM nonexistent');
      expect(result[0]['COUNT(*)']).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('query on non-existent table returns empty array', async () => {
      const adapter = createAdapter();
      const rows = await adapter.query('SELECT * FROM ghost');
      expect(rows).toEqual([]);
    });

    it('SQL keywords are case-insensitive', async () => {
      const adapter = createAdapter();
      await adapter.execute('create table items (id, name)');
      await adapter.execute('insert into items (id, name) values (?, ?)', [1, 'test']);
      const rows = await adapter.query('select * from items');
      expect(rows.length).toBe(1);
    });
  });
});
