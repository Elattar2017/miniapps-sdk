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

async function seedProducts(adapter: StorageAdapter) {
  await adapter.execute('CREATE TABLE products (id, name, category, price, stock)');
  await adapter.execute('INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)', [1, 'Apple', 'food', 2.5, 100]);
  await adapter.execute('INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)', [2, 'Laptop', 'electronics', 999, 10]);
  await adapter.execute('INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)', [3, 'Bread', 'food', 3.0, 50]);
  await adapter.execute('INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)', [4, 'Phone', 'electronics', 599, 25]);
  await adapter.execute('INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)', [5, 'Milk', 'food', 4.0, null]);
}

// ---------------------------------------------------------------------------
// WHERE with multiple AND conditions
// ---------------------------------------------------------------------------

describe('WHERE with AND', () => {
  it('filters by two conditions', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ id: number }>(
      'SELECT * FROM products WHERE category = ? AND price > ?',
      ['food', 3],
    );
    // Milk (price=4.0) matches; Apple (2.5) and Bread (3.0) don't
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(5);
  });

  it('filters by three AND conditions', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ name: string }>(
      'SELECT * FROM products WHERE category = ? AND price >= ? AND stock > ?',
      ['food', 2.5, 10],
    );
    // Apple: 2.5 >= 2.5 AND 100 > 10 → yes; Bread: 3.0 >= 2.5 AND 50 > 10 → yes; Milk: stock is null → no
    expect(rows.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// WHERE with OR
// ---------------------------------------------------------------------------

describe('WHERE with OR', () => {
  it('matches either side of OR', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ id: number }>(
      'SELECT * FROM products WHERE category = ? OR price > ?',
      ['food', 500],
    );
    // food: Apple, Bread, Milk (3 items) + price > 500: Laptop (999), Phone (599) → 5 but Apple, Bread, Milk already counted
    // total: Apple(food), Bread(food), Milk(food), Laptop(>500), Phone(>500) = 5
    expect(rows.length).toBe(5);
  });

  it('works with AND and OR combined (AND has higher precedence)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    // category = food AND price < 3 → Apple(2.5)
    // OR category = electronics AND price < 700 → Phone(599)
    const rows = await adapter.query<{ id: number }>(
      'SELECT * FROM products WHERE category = ? AND price < ? OR category = ? AND price < ?',
      ['food', 3, 'electronics', 700],
    );
    expect(rows.length).toBe(2);
    const ids = rows.map(r => r.id).sort();
    expect(ids).toEqual([1, 4]); // Apple, Phone
  });
});

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

describe('Comparison operators', () => {
  it('> (greater than)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE price > ?', [100]);
    expect(rows.length).toBe(2); // Laptop (999), Phone (599)
  });

  it('< (less than)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE price < ?', [4]);
    expect(rows.length).toBe(2); // Apple (2.5), Bread (3.0)
  });

  it('>= (greater than or equal)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE price >= ?', [3]);
    expect(rows.length).toBe(4); // Bread (3), Laptop (999), Phone (599), Milk (4)
  });

  it('<= (less than or equal)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE price <= ?', [3]);
    expect(rows.length).toBe(2); // Apple (2.5), Bread (3.0)
  });

  it('!= (not equal)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE category != ?', ['food']);
    expect(rows.length).toBe(2); // Laptop, Phone
  });

  it('<> (not equal alternative)', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products WHERE category <> ?', ['electronics']);
    expect(rows.length).toBe(3); // Apple, Bread, Milk
  });
});

// ---------------------------------------------------------------------------
// LIKE
// ---------------------------------------------------------------------------

describe('LIKE operator', () => {
  it('matches with % wildcard prefix', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ name: string }>(
      'SELECT * FROM products WHERE name LIKE ?',
      ['%ad'],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Bread');
  });

  it('matches with % wildcard suffix', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ name: string }>(
      'SELECT * FROM products WHERE name LIKE ?',
      ['M%'],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Milk');
  });

  it('matches with % wildcard both sides', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query(
      'SELECT * FROM products WHERE name LIKE ?',
      ['%pp%'],
    );
    expect(rows.length).toBe(1); // Apple
  });

  it('matches with _ single-char wildcard', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query(
      'SELECT * FROM products WHERE name LIKE ?',
      ['_ilk'],
    );
    expect(rows.length).toBe(1); // Milk
  });

  it('is case-insensitive', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query(
      'SELECT * FROM products WHERE name LIKE ?',
      ['%APPLE%'],
    );
    expect(rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// IS NULL / IS NOT NULL
// ---------------------------------------------------------------------------

describe('IS NULL / IS NOT NULL', () => {
  it('IS NULL matches null values', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ name: string }>(
      'SELECT * FROM products WHERE stock IS NULL',
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Milk');
  });

  it('IS NOT NULL excludes null values', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query(
      'SELECT * FROM products WHERE stock IS NOT NULL',
    );
    expect(rows.length).toBe(4);
  });

  it('IS NULL combined with AND', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query(
      'SELECT * FROM products WHERE category = ? AND stock IS NULL',
      ['food'],
    );
    expect(rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// LIMIT and OFFSET
// ---------------------------------------------------------------------------

describe('LIMIT and OFFSET', () => {
  it('LIMIT restricts result count', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products LIMIT 2');
    expect(rows.length).toBe(2);
  });

  it('OFFSET skips rows', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ id: number }>(
      'SELECT * FROM products ORDER BY id LIMIT 2 OFFSET 2',
    );
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe(3);
    expect(rows[1].id).toBe(4);
  });

  it('LIMIT with ORDER BY', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query<{ name: string }>(
      'SELECT * FROM products ORDER BY price DESC LIMIT 1',
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Laptop');
  });

  it('OFFSET beyond data returns empty', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products LIMIT 10 OFFSET 100');
    expect(rows.length).toBe(0);
  });

  it('LIMIT 0 returns empty', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const rows = await adapter.query('SELECT * FROM products LIMIT 0');
    expect(rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// INSERT OR REPLACE
// ---------------------------------------------------------------------------

describe('INSERT OR REPLACE', () => {
  it('inserts when no existing row matches PK', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('INSERT OR REPLACE INTO items (id, name) VALUES (?, ?)', [1, 'First']);
    const rows = await adapter.query('SELECT * FROM items');
    expect(rows.length).toBe(1);
  });

  it('replaces existing row with matching PK (first column)', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'Original']);
    await adapter.execute('INSERT OR REPLACE INTO items (id, name) VALUES (?, ?)', [1, 'Replaced']);
    const rows = await adapter.query<{ name: string }>('SELECT * FROM items');
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Replaced');
  });

  it('handles mixed inserts and replaces', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('INSERT OR REPLACE INTO items (id, name) VALUES (?, ?)', [1, 'A']);
    await adapter.execute('INSERT OR REPLACE INTO items (id, name) VALUES (?, ?)', [2, 'B']);
    await adapter.execute('INSERT OR REPLACE INTO items (id, name) VALUES (?, ?)', [1, 'A-updated']);
    const rows = await adapter.query<{ id: number; name: string }>('SELECT * FROM items ORDER BY id');
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ id: 1, name: 'A-updated' });
    expect(rows[1]).toEqual({ id: 2, name: 'B' });
  });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

describe('Transactions', () => {
  it('COMMIT preserves changes', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('BEGIN');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'A']);
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [2, 'B']);
    await adapter.execute('COMMIT');
    const rows = await adapter.query('SELECT * FROM items');
    expect(rows.length).toBe(2);
  });

  it('ROLLBACK reverts to pre-transaction state', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'Before']);
    await adapter.execute('BEGIN');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [2, 'During']);
    await adapter.execute('DELETE FROM items WHERE id = ?', [1]);
    // At this point: items = [{id: 2, name: 'During'}]
    await adapter.execute('ROLLBACK');
    // After rollback: items = [{id: 1, name: 'Before'}]
    const rows = await adapter.query<{ id: number; name: string }>('SELECT * FROM items');
    expect(rows.length).toBe(1);
    expect(rows[0]).toEqual({ id: 1, name: 'Before' });
  });

  it('ROLLBACK reverts UPDATE changes', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'Original']);
    await adapter.execute('BEGIN');
    await adapter.execute('UPDATE items SET name = ? WHERE id = ?', ['Modified', 1]);
    await adapter.execute('ROLLBACK');
    const rows = await adapter.query<{ name: string }>('SELECT * FROM items');
    expect(rows[0].name).toBe('Original');
  });

  it('nested BEGIN is ignored (single-level transactions)', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('BEGIN');
    await adapter.execute('BEGIN'); // should warn and be ignored
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'A']);
    await adapter.execute('COMMIT');
    const rows = await adapter.query('SELECT * FROM items');
    expect(rows.length).toBe(1);
  });

  it('BEGIN TRANSACTION syntax is supported', async () => {
    const adapter = createAdapter();
    await adapter.execute('CREATE TABLE items (id, name)');
    await adapter.execute('BEGIN TRANSACTION');
    await adapter.execute('INSERT INTO items (id, name) VALUES (?, ?)', [1, 'TX']);
    await adapter.execute('COMMIT');
    const rows = await adapter.query('SELECT * FROM items');
    expect(rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// COUNT(*) with WHERE
// ---------------------------------------------------------------------------

describe('COUNT(*) with WHERE', () => {
  it('counts only matching rows', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const result = await adapter.query<{ 'COUNT(*)': number }>(
      'SELECT COUNT(*) FROM products WHERE category = ?',
      ['food'],
    );
    expect(result[0]['COUNT(*)']).toBe(3);
  });

  it('returns 0 when no rows match', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    const result = await adapter.query<{ 'COUNT(*)': number }>(
      'SELECT COUNT(*) FROM products WHERE category = ?',
      ['clothing'],
    );
    expect(result[0]['COUNT(*)']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE with complex WHERE
// ---------------------------------------------------------------------------

describe('DELETE with complex WHERE', () => {
  it('deletes rows matching multiple AND conditions', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    await adapter.execute(
      'DELETE FROM products WHERE category = ? AND price < ?',
      ['food', 3],
    );
    const rows = await adapter.query<{ name: string }>('SELECT * FROM products');
    // Deleted: Apple (food, 2.5). Remaining: Laptop, Bread, Phone, Milk
    expect(rows.length).toBe(4);
    expect(rows.find(r => r.name === 'Apple')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UPDATE with complex WHERE
// ---------------------------------------------------------------------------

describe('UPDATE with complex WHERE', () => {
  it('updates rows matching multiple conditions', async () => {
    const adapter = createAdapter();
    await seedProducts(adapter);
    await adapter.execute(
      'UPDATE products SET stock = ? WHERE category = ? AND price > ?',
      [0, 'electronics', 500],
    );
    const rows = await adapter.query<{ name: string; stock: number }>(
      'SELECT name, stock FROM products WHERE category = ?',
      ['electronics'],
    );
    // Both Laptop (999) and Phone (599) match > 500
    expect(rows.every(r => r.stock === 0)).toBe(true);
  });
});
