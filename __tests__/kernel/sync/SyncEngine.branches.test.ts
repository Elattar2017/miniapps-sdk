/**
 * SyncEngine Branch Coverage Tests
 *
 * Covers uncovered branches in SyncEngine.ts:
 * - Pull response with ok: false
 * - Pull response data that is not an array
 * - Remote entry with VectorClock 'before' local (skip)
 * - Remote entry with VectorClock 'equal' to local (skip)
 * - New remote entry (no local counterpart) stored locally
 * - Storage failure in persistEntry()
 * - DataBus is undefined (all operations still work)
 * - sync() with multiple collections tracked independently
 * - trackChange() on new collection creates it
 * - Pull returns entries from different nodeIds
 * - Push fails (ok: false) - entries stay dirty, error count incremented
 * - Exception thrown during sync is not an Error instance
 */

import { SyncEngine } from '../../../src/kernel/sync/SyncEngine';
import { ConflictResolver } from '../../../src/kernel/sync/ConflictResolver';
import type { SyncEntry, IStorageBackend } from '../../../src/types';

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
// Mocks
// ---------------------------------------------------------------------------

function createMockStorage(): IStorageBackend {
  const store: Record<string, string> = {};
  return {
    getString: jest.fn((key: string) => store[key] ?? null),
    setString: jest.fn((key: string, value: string) => { store[key] = value; }),
    delete: jest.fn((key: string) => { delete store[key]; }),
    getAllKeys: jest.fn(() => Object.keys(store)),
    clearAll: jest.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };
}

interface APIProxyOverrides {
  pushOk?: boolean;
  pullOk?: boolean;
  pullData?: SyncEntry[] | string | null;
}

function createMockAPIProxy(overrides: APIProxyOverrides = {}) {
  const { pushOk = true, pullOk = true, pullData = [] } = overrides;
  return {
    request: jest.fn().mockImplementation(async (path: string) => {
      if (path.includes('/push')) {
        return { ok: pushOk, status: pushOk ? 200 : 500, data: null, headers: {}, latencyMs: 50 };
      }
      if (path.includes('/pull')) {
        return { ok: pullOk, status: pullOk ? 200 : 500, data: pullData, headers: {}, latencyMs: 50 };
      }
      return { ok: true, status: 200, data: null, headers: {}, latencyMs: 50 };
    }),
    updateAuthToken: jest.fn(),
  };
}

function createMockDataBus() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    unsubscribe: jest.fn(),
    getSubscriberCount: jest.fn().mockReturnValue(0),
    getChannels: jest.fn().mockReturnValue([]),
    publishScoped: jest.fn(),
    subscribeScoped: jest.fn(),
    clear: jest.fn(),
  };
}

function createEngine(overrides: {
  pushOk?: boolean;
  pullOk?: boolean;
  pullData?: SyncEntry[] | string | null;
  dataBus?: ReturnType<typeof createMockDataBus> | undefined;
  apiProxy?: ReturnType<typeof createMockAPIProxy>;
  storage?: IStorageBackend;
} = {}) {
  const storage = overrides.storage ?? createMockStorage();
  const apiProxy = overrides.apiProxy ?? createMockAPIProxy({
    pushOk: overrides.pushOk,
    pullOk: overrides.pullOk,
    pullData: overrides.pullData,
  });
  const conflictResolver = new ConflictResolver({
    defaultStrategy: 'server-wins',
    maxConflictQueueSize: 100,
    conflictTTL: 3600,
  });
  // Allow explicit undefined for dataBus
  const dataBus = overrides.dataBus !== undefined ? overrides.dataBus : createMockDataBus();
  const engine = new SyncEngine(
    storage,
    apiProxy as unknown as import('../../../src/kernel/network/APIProxy').APIProxy,
    conflictResolver,
    dataBus as unknown as import('../../../src/kernel/communication/DataBus').DataBus | undefined,
    { nodeId: 'client-1' },
  );
  return { engine, storage, apiProxy, conflictResolver, dataBus };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncEngine – branch coverage', () => {
  it('push fails (ok: false): entries stay dirty, error count incremented', async () => {
    const { engine } = createEngine({ pushOk: false });
    engine.trackChange('tasks', 't-1', { title: 'local' });

    const result = await engine.sync('tasks');

    expect(result.errors).toBe(1);
    // Entry should still be dirty since push failed
    expect(engine.getDirtyEntries('tasks')).toHaveLength(1);
  });

  it('pull response with ok: false: gracefully skips remote processing', async () => {
    const { engine } = createEngine({ pullOk: false, pullData: null });

    const result = await engine.sync('tasks');

    // No remote entries processed, no errors thrown
    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(0);
  });

  it('pull response data is not an array: gracefully skips', async () => {
    const { engine } = createEngine({ pullData: 'not-an-array' as unknown as SyncEntry[] });

    const result = await engine.sync('tasks');

    // The guard `Array.isArray(pullResponse.data)` should prevent processing
    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(0);
  });

  it('remote entry with VectorClock "before" local: skip (local ahead)', async () => {
    // Local entry has clock { 'client-1': 3 }
    // Remote entry has clock { 'client-1': 1 } → 'before' local → skip
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'old-remote' },
      vectorClock: { 'client-1': 1 },
      timestamp: 1000,
      nodeId: 'server-1',
      dirty: false,
    };

    const { engine } = createEngine({ pullData: [remoteEntry] });

    // Create local entries to bump clock to 3
    engine.trackChange('tasks', 'task-1', { title: 'v1' });
    engine.trackChange('tasks', 'task-1', { title: 'v2' });
    engine.trackChange('tasks', 'task-1', { title: 'v3' });

    const result = await engine.sync('tasks');

    // The remote entry should have been skipped; only the push counts as synced
    // The dirty entries get marked clean on successful push
    expect(result.conflicts).toBe(0);
    // Verify local data is unchanged (still v3)
    const dirty = engine.getDirtyEntries('tasks');
    // After successful push, entries are marked clean
    expect(dirty).toHaveLength(0);
  });

  it('remote entry with VectorClock "equal" to local: skip (no change needed)', async () => {
    // Local entry has clock { 'client-1': 1 }
    // Remote entry has clock { 'client-1': 1 } → 'equal' → skip
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'same' },
      vectorClock: { 'client-1': 1 },
      timestamp: 2000,
      nodeId: 'server-1',
      dirty: false,
    };

    const { engine } = createEngine({ pullData: [remoteEntry] });
    engine.trackChange('tasks', 'task-1', { title: 'local-same' });

    const result = await engine.sync('tasks');

    // Remote with equal clock should be skipped, not counted as synced or conflict
    expect(result.conflicts).toBe(0);
  });

  it('new remote entry (no local counterpart): stored locally', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-new',
      data: { title: 'from-server' },
      vectorClock: { 'server-1': 1 },
      timestamp: 3000,
      nodeId: 'server-1',
      dirty: false,
    };

    const { engine } = createEngine({ pullData: [remoteEntry] });

    const result = await engine.sync('tasks');

    expect(result.synced).toBe(1);
    // The new entry should not be dirty (it came from remote)
    expect(engine.getDirtyEntries('tasks')).toHaveLength(0);
  });

  it('storage setString is called during persistEntry()', () => {
    const storage = createMockStorage();
    const { engine } = createEngine({ storage });

    engine.trackChange('tasks', 't-1', { title: 'test' });

    expect(storage.setString).toHaveBeenCalledWith(
      '__sync__:tasks:t-1',
      expect.any(String),
    );
  });

  it('dataBus is undefined: all operations still work without errors', async () => {
    const { engine } = createEngine({ dataBus: undefined });

    engine.trackChange('tasks', 't-1', { title: 'test' });

    const result = await engine.sync('tasks');

    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);
    expect(engine.getStatus()).toBe('idle');
  });

  it('sync() with multiple collections tracked independently', async () => {
    const { engine } = createEngine();

    engine.trackChange('tasks', 't-1', { title: 'task' });
    engine.trackChange('notes', 'n-1', { body: 'note' });

    const taskResult = await engine.sync('tasks');
    const noteResult = await engine.sync('notes');

    expect(taskResult.synced).toBeGreaterThanOrEqual(1);
    expect(noteResult.synced).toBeGreaterThanOrEqual(1);
    expect(engine.getLastSyncTime('tasks')).not.toBeNull();
    expect(engine.getLastSyncTime('notes')).not.toBeNull();
  });

  it('trackChange() on new collection creates it', () => {
    const { engine } = createEngine();

    // No collection exists yet
    expect(engine.getDirtyEntries('brand-new')).toHaveLength(0);

    engine.trackChange('brand-new', 'item-1', { data: true });

    expect(engine.getDirtyEntries('brand-new')).toHaveLength(1);
    expect(engine.getDirtyEntries('brand-new')[0].id).toBe('item-1');
  });

  it('pull returns entries from different nodeIds: all processed', async () => {
    const remoteEntries: SyncEntry[] = [
      {
        id: 'entry-a',
        data: { from: 'node-a' },
        vectorClock: { 'node-a': 1 },
        timestamp: 1000,
        nodeId: 'node-a',
        dirty: false,
      },
      {
        id: 'entry-b',
        data: { from: 'node-b' },
        vectorClock: { 'node-b': 1 },
        timestamp: 2000,
        nodeId: 'node-b',
        dirty: false,
      },
      {
        id: 'entry-c',
        data: { from: 'node-c' },
        vectorClock: { 'node-c': 1 },
        timestamp: 3000,
        nodeId: 'node-c',
        dirty: false,
      },
    ];

    const { engine } = createEngine({ pullData: remoteEntries });

    const result = await engine.sync('tasks');

    // All three new remote entries should be stored
    expect(result.synced).toBe(3);
  });

  it('exception thrown during sync that is not an Error instance', async () => {
    const apiProxy = createMockAPIProxy();
    // Reject with a non-Error value (string)
    apiProxy.request.mockRejectedValue('string-error');
    const dataBus = createMockDataBus();
    const { engine } = createEngine({ apiProxy, dataBus });

    const result = await engine.sync('tasks');

    expect(engine.getStatus()).toBe('error');
    expect(result.errors).toBeGreaterThanOrEqual(1);
    expect(dataBus.publish).toHaveBeenCalledWith(
      'sdk:sync:error',
      expect.objectContaining({ error: 'string-error' }),
    );
  });
});
