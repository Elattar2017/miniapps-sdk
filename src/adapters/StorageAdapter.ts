/**
 * StorageAdapter - Native Bridge Stability Layer for persistent storage
 *
 * Implements IStorageAdapter from types. Wraps MMKV for key-value storage
 * and provides a SQLite stub for structured queries.
 *
 * All keys are auto-prefixed with `{tenantId}:{moduleId}:` to enforce
 * tenant/module isolation at the storage level.
 *
 * Phase 4: Adds MMKVStorageBackend with InMemoryStorage fallback,
 * createPlatformStorage factory, and executeSql method.
 *
 * @module adapters/StorageAdapter
 */

import { logger } from '../utils/logger';
import type { IStorageAdapter, IStorageBackend } from '../types';

const storageLogger = logger.child({ component: 'StorageAdapter' });

// ---------------------------------------------------------------------------
// In-memory storage backend (MMKV fallback)
// ---------------------------------------------------------------------------

/**
 * Shared backing stores keyed by storage ID.
 * Mimics MMKV's file-backed behavior: all instances with the same ID
 * share the same underlying data (important when ScreenRenderer remounts).
 */
const sharedInMemoryStores = new Map<string, Map<string, string | number | boolean>>();

/**
 * In-memory storage that mimics MMKV's synchronous API.
 * Used as fallback when react-native-mmkv is not available.
 * Instances with the same ID share state via sharedInMemoryStores.
 */
class InMemoryStorage implements IStorageBackend {
  private store: Map<string, string | number | boolean>;

  constructor(id?: string) {
    if (id) {
      let existing = sharedInMemoryStores.get(id);
      if (!existing) {
        existing = new Map();
        sharedInMemoryStores.set(id, existing);
      }
      this.store = existing;
    } else {
      this.store = new Map();
    }
  }

  getString(key: string): string | undefined {
    const value = this.store.get(key);
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  setString(key: string, value: string): void {
    this.store.set(key, value);
  }

  getNumber(key: string): number | undefined {
    const value = this.store.get(key);
    if (typeof value === 'number') {
      return value;
    }
    return undefined;
  }

  setNumber(key: string, value: number): void {
    this.store.set(key, value);
  }

  getBoolean(key: string): boolean | undefined {
    const value = this.store.get(key);
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  setBoolean(key: string, value: boolean): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  contains(key: string): boolean {
    return this.store.has(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  clearAll(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// MMKV storage backend (Phase 4)
// ---------------------------------------------------------------------------

/** Typed interface for a react-native-mmkv instance */
interface MMKVInstance {
  getString(key: string): string | undefined;
  set(key: string, value: string | number | boolean): void;
  delete(key: string): void;
  getAllKeys(): string[];
  contains(key: string): boolean;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  clearAll(): void;
}

/**
 * MMKV-backed storage backend. Delegates to react-native-mmkv.
 * Throws if MMKV is not available at runtime.
 */
class MMKVStorageBackend implements IStorageBackend {
  private mmkv: MMKVInstance;

  constructor(opts: { id: string; encryptionKey?: string }) {
    try {
      // Dynamic import to detect MMKV availability at runtime
      const { MMKV } = require('react-native-mmkv');
      this.mmkv = new MMKV({ id: opts.id, encryptionKey: opts.encryptionKey });
    } catch {
      throw new Error('react-native-mmkv is not available');
    }
  }

  getString(key: string): string | undefined {
    return this.mmkv.getString(key) ?? undefined;
  }

  setString(key: string, value: string): void {
    this.mmkv.set(key, value);
  }

  delete(key: string): void {
    this.mmkv.delete(key);
  }

  getAllKeys(): string[] {
    return this.mmkv.getAllKeys();
  }

  contains(key: string): boolean {
    return this.mmkv.contains(key);
  }

  getNumber(key: string): number | undefined {
    return this.mmkv.getNumber(key);
  }

  getBoolean(key: string): boolean | undefined {
    return this.mmkv.getBoolean(key);
  }

  setNumber(key: string, value: number): void {
    this.mmkv.set(key, value);
  }

  setBoolean(key: string, value: boolean): void {
    this.mmkv.set(key, value);
  }

  clearAll(): void {
    this.mmkv.clearAll();
  }
}

// ---------------------------------------------------------------------------
// Platform storage factory
// ---------------------------------------------------------------------------

/**
 * Creates the best available storage backend.
 * Prefers MMKV when available, falls back to in-memory storage.
 */
function createPlatformStorage(opts: { id: string; encryptionKey?: string }): IStorageBackend {
  try {
    return new MMKVStorageBackend(opts);
  } catch {
    // MMKV not available, fall back to in-memory (shared by ID)
    return new InMemoryStorage(opts.id);
  }
}

// ---------------------------------------------------------------------------
// In-memory SQLite implementation
// ---------------------------------------------------------------------------

/** Parsed WHERE condition */
interface WhereCondition {
  column: string;
  operator: '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IS NULL' | 'IS NOT NULL';
  /** Param index into the params array (undefined for IS NULL / IS NOT NULL) */
  paramIndex?: number;
}

/** Parsed WHERE clause: groups of AND conditions joined by OR */
type WhereClause = WhereCondition[][];

/**
 * In-memory row store that implements common SQLite operations.
 *
 * Supports:
 * - CREATE TABLE, DROP TABLE
 * - INSERT INTO, INSERT OR REPLACE
 * - UPDATE with SET + WHERE
 * - DELETE with WHERE or without
 * - SELECT with WHERE (=, !=, <>, >, <, >=, <=, LIKE, IS NULL, IS NOT NULL)
 * - Multiple WHERE conditions with AND / OR
 * - ORDER BY (ASC/DESC), LIMIT, OFFSET
 * - COUNT(*)
 * - BEGIN / COMMIT / ROLLBACK transactions with snapshot-based rollback
 *
 * Production deployment should use encrypted SQLite (e.g. react-native-quick-sqlite).
 */
class InMemorySQLiteStub {
  private tables: Map<string, Array<Record<string, unknown>>> = new Map();
  /** Transaction snapshot: null when no transaction is active */
  private transactionSnapshot: Map<string, Array<Record<string, unknown>>> | null = null;
  private inTransaction = false;

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const trimmed = sql.trim().toUpperCase();

    // Transaction control
    if (trimmed === 'BEGIN' || trimmed === 'BEGIN TRANSACTION') {
      this.beginTransaction();
      return;
    }
    if (trimmed === 'COMMIT' || trimmed === 'END TRANSACTION') {
      this.commitTransaction();
      return;
    }
    if (trimmed === 'ROLLBACK') {
      this.rollbackTransaction();
      return;
    }

    if (trimmed.startsWith('CREATE TABLE')) {
      const tableNameMatch = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (tableNameMatch) {
        const tableName = tableNameMatch[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
      return;
    }

    if (trimmed.startsWith('DROP TABLE')) {
      const tableNameMatch = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
      if (tableNameMatch) {
        this.tables.delete(tableNameMatch[1]);
      }
      return;
    }

    if (trimmed.startsWith('INSERT OR REPLACE') || trimmed.startsWith('INSERT INTO')) {
      this.executeInsert(sql, params, trimmed.startsWith('INSERT OR REPLACE'));
      return;
    }

    if (trimmed.startsWith('UPDATE')) {
      this.executeUpdate(sql, params);
      return;
    }

    if (trimmed.startsWith('DELETE FROM')) {
      this.executeDelete(sql, params);
      return;
    }

    storageLogger.warn('SQLite stub: unsupported execute statement', { sql: trimmed.slice(0, 50) });
  }

  private executeInsert(sql: string, params: unknown[] | undefined, isReplace: boolean): void {
    const insertMatch = sql.match(
      /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
    );
    if (!insertMatch) return;

    const [, tableName, colsStr] = insertMatch;
    const columns = colsStr.split(',').map(c => c.trim());
    const values = params ?? [];
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });

    if (!this.tables.has(tableName)) this.tables.set(tableName, []);

    if (isReplace) {
      // UPSERT: replace row with matching first column (primary key convention)
      const pkCol = columns[0];
      const pkVal = values[0];
      const tableRows = this.tables.get(tableName)!;
      const existingIdx = tableRows.findIndex(r => r[pkCol] === pkVal);
      if (existingIdx >= 0) {
        tableRows[existingIdx] = row;
      } else {
        tableRows.push(row);
      }
    } else {
      this.tables.get(tableName)!.push(row);
    }
  }

  private executeUpdate(sql: string, params: unknown[] | undefined): void {
    // Parse: UPDATE table SET col1 = ?, col2 = ? WHERE ...
    const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (!updateMatch) return;

    const [, tableName, setClause, whereClause] = updateMatch;
    const rows = this.tables.get(tableName);
    if (!rows) return;

    const setCols = setClause.split(',').map(s => s.trim().split(/\s*=\s*\?/)[0].trim());
    const setParamCount = setCols.length;
    const allParams = params ?? [];

    if (whereClause) {
      // WHERE params come after SET params
      const { conditions } = this.parseWhereClause(whereClause);
      const whereParams = allParams.slice(setParamCount);

      for (const row of rows) {
        if (this.evaluateWhere(row, conditions, whereParams)) {
          setCols.forEach((col, i) => {
            row[col] = allParams[i];
          });
        }
      }
    } else {
      // No WHERE — update all rows
      for (const row of rows) {
        setCols.forEach((col, i) => {
          row[col] = allParams[i];
        });
      }
    }
  }

  private executeDelete(sql: string, params: unknown[] | undefined): void {
    // DELETE FROM table WHERE ...
    const deleteMatch = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!deleteMatch) return;

    const [, tableName, whereClause] = deleteMatch;
    const rows = this.tables.get(tableName);
    if (!rows) return;

    if (whereClause) {
      const { conditions } = this.parseWhereClause(whereClause);
      const whereParams = params ?? [];
      this.tables.set(tableName, rows.filter(row => !this.evaluateWhere(row, conditions, whereParams)));
    } else {
      this.tables.set(tableName, []);
    }
  }

  // -----------------------------------------------------------------------
  // WHERE clause parsing and evaluation
  // -----------------------------------------------------------------------

  /**
   * Parse a WHERE clause string into structured conditions.
   * Supports AND/OR, comparison operators, LIKE, IS NULL, IS NOT NULL.
   * Returns the conditions (with 0-based paramIndex) and total number of params consumed.
   */
  private parseWhereClause(
    whereStr: string,
    _paramOffset?: number,
  ): { conditions: WhereClause; paramCount: number } {
    // Split by OR first (lower precedence)
    const orGroups = whereStr.split(/\s+OR\s+/i);
    const conditions: WhereClause = [];
    let paramIndex = 0;

    for (const orGroup of orGroups) {
      // Split each OR group by AND
      const andConditions = orGroup.split(/\s+AND\s+/i);
      const group: WhereCondition[] = [];

      for (const condStr of andConditions) {
        const trimmed = condStr.trim();

        // IS NOT NULL
        const isNotNullMatch = trimmed.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
        if (isNotNullMatch) {
          group.push({ column: isNotNullMatch[1], operator: 'IS NOT NULL' });
          continue;
        }

        // IS NULL
        const isNullMatch = trimmed.match(/^(\w+)\s+IS\s+NULL$/i);
        if (isNullMatch) {
          group.push({ column: isNullMatch[1], operator: 'IS NULL' });
          continue;
        }

        // LIKE
        const likeMatch = trimmed.match(/^(\w+)\s+LIKE\s+\?$/i);
        if (likeMatch) {
          group.push({ column: likeMatch[1], operator: 'LIKE', paramIndex });
          paramIndex++;
          continue;
        }

        // Comparison operators: >=, <=, !=, <>, >, <, =
        const compMatch = trimmed.match(/^(\w+)\s*(>=|<=|!=|<>|>|<|=)\s*\?$/);
        if (compMatch) {
          const op = compMatch[2] as WhereCondition['operator'];
          group.push({ column: compMatch[1], operator: op, paramIndex });
          paramIndex++;
          continue;
        }

        storageLogger.warn('SQLite stub: unparseable WHERE condition', { condition: trimmed });
      }

      conditions.push(group);
    }

    return { conditions, paramCount: paramIndex };
  }

  /**
   * Evaluate a WHERE clause against a single row.
   * conditions is an array of OR-groups, each containing AND-conditions.
   * Returns true if any OR-group fully matches (all ANDs true).
   */
  private evaluateWhere(
    row: Record<string, unknown>,
    conditions: WhereClause,
    params: unknown[],
  ): boolean {
    // Any OR group matching = true
    return conditions.some(andGroup =>
      andGroup.every(cond => this.evaluateCondition(row, cond, params)),
    );
  }

  private evaluateCondition(
    row: Record<string, unknown>,
    cond: WhereCondition,
    params: unknown[],
  ): boolean {
    const value = row[cond.column];

    switch (cond.operator) {
      case 'IS NULL':
        return value == null;
      case 'IS NOT NULL':
        return value != null;
      case '=':
        return value === params[cond.paramIndex!];
      case '!=':
      case '<>':
        // SQL: NULL != x is NULL (falsy), but for practical purposes treat as not-equal
        if (value == null) return true;
        return value !== params[cond.paramIndex!];
      case '>':
      case '<':
      case '>=':
      case '<=': {
        // SQL: any comparison with NULL returns NULL (falsy)
        const param = params[cond.paramIndex!];
        if (value == null || param == null) return false;
        if (typeof value === 'number' && typeof param === 'number') {
          if (cond.operator === '>') return value > param;
          if (cond.operator === '<') return value < param;
          if (cond.operator === '>=') return value >= param;
          return value <= param;
        }
        const a = String(value);
        const b = String(param);
        if (cond.operator === '>') return a > b;
        if (cond.operator === '<') return a < b;
        if (cond.operator === '>=') return a >= b;
        return a <= b;
      }
      case 'LIKE': {
        if (value == null) return false;
        const pattern = String(params[cond.paramIndex!]);
        const regex = new RegExp(
          '^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$',
          'i',
        );
        return regex.test(String(value));
      }
      default:
        return false;
    }
  }

  // -----------------------------------------------------------------------
  // Transaction support
  // -----------------------------------------------------------------------

  private beginTransaction(): void {
    if (this.inTransaction) {
      storageLogger.warn('SQLite stub: nested transactions not supported, ignoring BEGIN');
      return;
    }
    // Snapshot current state for rollback
    this.transactionSnapshot = new Map();
    for (const [name, rows] of this.tables) {
      this.transactionSnapshot.set(name, rows.map(r => ({ ...r })));
    }
    this.inTransaction = true;
    storageLogger.debug('SQLite stub: transaction started');
  }

  private commitTransaction(): void {
    if (!this.inTransaction) {
      storageLogger.warn('SQLite stub: COMMIT without BEGIN');
      return;
    }
    this.transactionSnapshot = null;
    this.inTransaction = false;
    storageLogger.debug('SQLite stub: transaction committed');
  }

  private rollbackTransaction(): void {
    if (!this.inTransaction || !this.transactionSnapshot) {
      storageLogger.warn('SQLite stub: ROLLBACK without BEGIN');
      return;
    }
    // Restore snapshot
    this.tables = this.transactionSnapshot;
    this.transactionSnapshot = null;
    this.inTransaction = false;
    storageLogger.debug('SQLite stub: transaction rolled back');
  }

  /** Check if a transaction is currently active */
  isInTransaction(): boolean {
    return this.inTransaction;
  }

  // -----------------------------------------------------------------------
  // Direct row access (for tests / debugging)
  // -----------------------------------------------------------------------

  insertRow(tableName: string, row: Record<string, unknown>): void {
    if (!this.tables.has(tableName)) this.tables.set(tableName, []);
    this.tables.get(tableName)!.push(row);
  }

  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  getTable(name: string): Array<Record<string, unknown>> | undefined {
    return this.tables.get(name);
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const trimmed = sql.trim().toUpperCase();

    if (!trimmed.startsWith('SELECT')) {
      storageLogger.warn('SQLite stub: unsupported query statement', { sql: trimmed.slice(0, 50) });
      return [];
    }

    // COUNT(*)
    if (trimmed.includes('COUNT(*)')) {
      const tableNameMatch = sql.match(/FROM\s+(\w+)/i);
      if (tableNameMatch) {
        let rows = this.tables.get(tableNameMatch[1]) ?? [];
        // Apply WHERE to COUNT if present
        const whereStrMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
        if (whereStrMatch) {
          const { conditions, paramCount } = this.parseWhereClause(whereStrMatch[1], 0);
          const whereParams = (params ?? []).slice(0, paramCount);
          rows = rows.filter(row => this.evaluateWhere(row, conditions, whereParams));
        }
        return [{ 'COUNT(*)': rows.length } as unknown as T];
      }
      return [{ 'COUNT(*)': 0 } as unknown as T];
    }

    // Extract table name
    const tableNameMatch = sql.match(/FROM\s+(\w+)/i);
    if (!tableNameMatch) return [];
    const tableName = tableNameMatch[1];
    let rows = this.tables.get(tableName);
    if (!rows) return [];

    // Make a copy to avoid mutating stored data
    rows = rows.map(r => ({ ...r }));

    // WHERE clause — extract everything between WHERE and ORDER BY/LIMIT/end
    const whereStrMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
    if (whereStrMatch) {
      const { conditions, paramCount } = this.parseWhereClause(whereStrMatch[1], 0);
      const whereParams = (params ?? []).slice(0, paramCount);
      rows = rows.filter(row => this.evaluateWhere(row, conditions, whereParams));
    }

    // ORDER BY clause
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const orderDir = (orderMatch[2] ?? 'ASC').toUpperCase();
      rows = [...rows].sort((a, b) => {
        const aVal = a[orderCol];
        const bVal = b[orderCol];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return orderDir === 'ASC' ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal);
        const bStr = String(bVal);
        return orderDir === 'ASC' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    // LIMIT and OFFSET
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch) {
      rows = rows.slice(Number(offsetMatch[1]));
    }
    if (limitMatch) {
      rows = rows.slice(0, Number(limitMatch[1]));
    }

    // Column projection (SELECT col1, col2 FROM ... vs SELECT * FROM ...)
    const selectClause = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (selectClause && selectClause[1].trim() !== '*') {
      const columns = selectClause[1].split(',').map(c => c.trim());
      rows = rows.map(row => {
        const projected: Record<string, unknown> = {};
        for (const col of columns) {
          projected[col] = row[col];
        }
        return projected;
      });
    }

    return rows as T[];
  }
}

// ---------------------------------------------------------------------------
// StorageAdapter implementation
// ---------------------------------------------------------------------------

/**
 * Configuration for creating a StorageAdapter.
 */
export interface StorageAdapterConfig {
  tenantId: string;
  moduleId: string;
  encryptionKey?: string;
}

/**
 * StorageAdapter implements IStorageAdapter with automatic key prefixing.
 *
 * Every key is transparently prefixed with `{tenantId}:{moduleId}:` to
 * enforce storage isolation between tenants and modules.
 */
class StorageAdapter implements IStorageAdapter {
  private readonly kvStore: IStorageBackend;
  private readonly sqlStore: InMemorySQLiteStub;
  private readonly prefix: string;

  constructor(config: StorageAdapterConfig) {
    this.kvStore = createPlatformStorage({ id: `${config.tenantId}:${config.moduleId}`, encryptionKey: config.encryptionKey });
    this.sqlStore = new InMemorySQLiteStub();
    this.prefix = `${config.tenantId}:${config.moduleId}:`;

    storageLogger.debug('StorageAdapter created', {
      tenantId: config.tenantId,
      moduleId: config.moduleId,
      prefix: this.prefix,
    });
  }

  // -----------------------------------------------------------------------
  // Key prefixing helper
  // -----------------------------------------------------------------------

  private prefixKey(key: string): string {
    // If the key already has the correct prefix, do not double-prefix
    if (key.startsWith(this.prefix)) {
      return key;
    }
    return `${this.prefix}${key}`;
  }

  private stripPrefix(prefixedKey: string): string {
    if (prefixedKey.startsWith(this.prefix)) {
      return prefixedKey.slice(this.prefix.length);
    }
    return prefixedKey;
  }

  // -----------------------------------------------------------------------
  // IStorageAdapter - Key-Value (MMKV)
  // -----------------------------------------------------------------------

  getString(key: string): string | undefined {
    return this.kvStore.getString(this.prefixKey(key));
  }

  setString(key: string, value: string): void {
    this.kvStore.setString(this.prefixKey(key), value);
  }

  getNumber(key: string): number | undefined {
    return this.kvStore.getNumber(this.prefixKey(key));
  }

  setNumber(key: string, value: number): void {
    this.kvStore.setNumber(this.prefixKey(key), value);
  }

  getBoolean(key: string): boolean | undefined {
    return this.kvStore.getBoolean(this.prefixKey(key));
  }

  setBoolean(key: string, value: boolean): void {
    this.kvStore.setBoolean(this.prefixKey(key), value);
  }

  delete(key: string): void {
    this.kvStore.delete(this.prefixKey(key));
  }

  contains(key: string): boolean {
    return this.kvStore.contains(this.prefixKey(key));
  }

  getAllKeys(): string[] {
    return this.kvStore
      .getAllKeys()
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => this.stripPrefix(k));
  }

  clearAll(): void {
    // Only clear keys belonging to this tenant:module
    const ownKeys = this.kvStore.getAllKeys().filter((k) => k.startsWith(this.prefix));
    for (const key of ownKeys) {
      this.kvStore.delete(key);
    }
    storageLogger.debug('Storage cleared for prefix', { prefix: this.prefix });
  }

  // -----------------------------------------------------------------------
  // IStorageAdapter - Structured (SQLite)
  // -----------------------------------------------------------------------

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.sqlStore.query<T>(sql, params);
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    return this.sqlStore.execute(sql, params);
  }

  // -----------------------------------------------------------------------
  // Synchronous SQL (executeSql) - Phase 4
  // -----------------------------------------------------------------------

  /**
   * Synchronous SQL execution for simple INSERT operations.
   * Supports INSERT INTO tableName (col1, col2) VALUES (?, ?)
   */
  executeSql(sql: string, params?: unknown[]): { rows: Array<Record<string, unknown>> } {
    const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const [, tableName, colsStr] = insertMatch;
      const columns = colsStr.split(',').map((c) => c.trim());
      const values = params ?? [];
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      this.sqlStore.insertRow(tableName, row);
      return { rows: [] };
    }
    throw new Error(`Unsupported SQL operation: ${sql.substring(0, 50)}`);
  }

  /**
   * Returns the in-memory table rows for testing/debugging.
   */
  getTable(name: string): Array<Record<string, unknown>> | undefined {
    return this.sqlStore.getTable(name);
  }

  /**
   * Returns all table names tracked by the SQL store.
   */
  getTableNames(): string[] {
    return this.sqlStore.getTableNames();
  }

  /**
   * Check if storage is initialized and ready.
   */
  isInitialized(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a new StorageAdapter instance scoped to the given tenant and module.
 */
function createStorageAdapter(config: StorageAdapterConfig): IStorageAdapter {
  return new StorageAdapter(config);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** Reset all shared in-memory stores. For testing only. */
function _resetSharedInMemoryStores(): void {
  sharedInMemoryStores.clear();
}

export { StorageAdapter, createStorageAdapter, InMemoryStorage, MMKVStorageBackend, createPlatformStorage, _resetSharedInMemoryStores };
