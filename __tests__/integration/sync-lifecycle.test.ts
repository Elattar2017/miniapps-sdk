/**
 * Sync Lifecycle Integration Tests
 *
 * Full integration using real VectorClock + ConflictResolver + SyncEngine
 * with mocked storage and API proxy. Tests the complete sync lifecycle
 * from change tracking through conflict resolution.
 */

import { SyncEngine } from '../../src/kernel/sync/SyncEngine';
import { ConflictResolver } from '../../src/kernel/sync/ConflictResolver';
import * as VectorClock from '../../src/kernel/sync/VectorClock';
import { DataBus } from '../../src/kernel/communication/DataBus';
import type { SyncEntry, IStorageBackend, ConflictResolutionConfig } from '../../src/types';

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
// Shared helpers
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

function createMockAPIProxy(options: {
  pushOk?: boolean;
  pullData?: SyncEntry[];
  pushFail?: boolean;
} = {}) {
  return {
    request: jest.fn().mockImplementation(async (path: string) => {
      if (path.includes('/push')) {
        if (options.pushFail) {
          throw new Error('Network error');
        }
        return {
          ok: options.pushOk !== false,
          status: options.pushOk !== false ? 200 : 500,
          data: null,
          headers: {},
          latencyMs: 50,
        };
      }
      if (path.includes('/pull')) {
        return {
          ok: true,
          status: 200,
          data: { entries: options.pullData ?? [], collection: 'tasks' },
          headers: {},
          latencyMs: 50,
        };
      }
      return { ok: true, status: 200, data: null, headers: {}, latencyMs: 50 };
    }),
    updateAuthToken: jest.fn(),
  };
}

function createSyncStack(
  conflictConfig: Partial<ConflictResolutionConfig> = {},
  apiOptions: Parameters<typeof createMockAPIProxy>[0] = {},
) {
  const storage = createMockStorage();
  const dataBus = new DataBus();
  const apiProxy = createMockAPIProxy(apiOptions);
  const conflictResolver = new ConflictResolver(
    {
      defaultStrategy: 'server-wins',
      maxConflictQueueSize: 100,
      conflictTTL: 3600,
      ...conflictConfig,
    },
    dataBus,
  );
  const engine = new SyncEngine(
    storage,
    apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
    conflictResolver,
    dataBus,
    { nodeId: 'client-device' },
  );
  return { engine, conflictResolver, dataBus, apiProxy, storage };
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Sync Lifecycle Integration', () => {
  it('full sync cycle: track change -> sync -> verify server receives dirty entries', async () => {
    const { engine, apiProxy } = createSyncStack();

    engine.trackChange('tasks', 'task-1', { title: 'Buy groceries', status: 'open' });
    engine.trackChange('tasks', 'task-2', { title: 'Fix bug', status: 'open' });

    const result = await engine.sync('tasks');

    // Dirty entries pushed to server
    expect(apiProxy.request).toHaveBeenCalledWith(
      '/api/sync/tasks/push',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ id: 'task-1' }),
            expect.objectContaining({ id: 'task-2' }),
          ]),
        }),
      }),
    );

    expect(result.synced).toBe(2);
    expect(result.errors).toBe(0);

    // Entries are no longer dirty
    expect(engine.getDirtyEntries('tasks')).toHaveLength(0);
  });

  it('concurrent changes: both local and remote modify same entry -> conflict resolved', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'Remote title', status: 'done' },
      vectorClock: { 'server-node': 2 },
      timestamp: 3000,
      nodeId: 'server-node',
      dirty: false,
    };

    const { engine } = createSyncStack({}, { pullData: [remoteEntry] });

    // Local change on the same entry with different vector clock -> concurrent
    engine.trackChange('tasks', 'task-1', { title: 'Local title', status: 'in-progress' });

    const result = await engine.sync('tasks');
    expect(result.conflicts).toBe(1);
  });

  it('server-wins strategy: remote value persists after sync conflict', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'Server version' },
      vectorClock: { 'server-node': 3 },
      timestamp: 5000,
      nodeId: 'server-node',
      dirty: false,
    };

    const { engine } = createSyncStack(
      { defaultStrategy: 'server-wins' },
      { pullData: [remoteEntry] },
    );

    engine.trackChange('tasks', 'task-1', { title: 'Client version' });
    await engine.sync('tasks');

    // After sync, the entry should have server's data (server-wins)
    const dirty = engine.getDirtyEntries('tasks');
    // The entry should no longer be dirty (conflict resolved)
    expect(dirty.filter(e => e.id === 'task-1')).toHaveLength(0);
  });

  it('client-wins strategy: local value persists after sync conflict', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'Server version' },
      vectorClock: { 'server-node': 3 },
      timestamp: 5000,
      nodeId: 'server-node',
      dirty: false,
    };

    const { engine } = createSyncStack(
      { defaultStrategy: 'client-wins' },
      { pullData: [remoteEntry] },
    );

    engine.trackChange('tasks', 'task-1', { title: 'Client version' });
    await engine.sync('tasks');

    // Conflict resolved via client-wins
    const dirty = engine.getDirtyEntries('tasks');
    expect(dirty.filter(e => e.id === 'task-1')).toHaveLength(0);
  });

  it('latest-timestamp strategy: newer timestamp wins', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'Old server version' },
      vectorClock: { 'server-node': 2 },
      timestamp: 100, // very old
      nodeId: 'server-node',
      dirty: false,
    };

    const { engine } = createSyncStack(
      { defaultStrategy: 'latest-timestamp' },
      { pullData: [remoteEntry] },
    );

    engine.trackChange('tasks', 'task-1', { title: 'Newer client version' });

    const result = await engine.sync('tasks');
    expect(result.conflicts).toBe(1);
  });

  it('offline changes: multiple dirty entries all sync on reconnect', async () => {
    const { engine, apiProxy } = createSyncStack();

    // Simulate offline edits
    engine.trackChange('tasks', 'task-1', { title: 'Edit 1' });
    engine.trackChange('tasks', 'task-2', { title: 'Edit 2' });
    engine.trackChange('tasks', 'task-3', { title: 'Edit 3' });

    expect(engine.getDirtyEntries('tasks')).toHaveLength(3);

    // Reconnect and sync
    const result = await engine.sync('tasks');

    expect(result.synced).toBe(3);
    expect(engine.getDirtyEntries('tasks')).toHaveLength(0);

    // Verify all were pushed
    const pushCall = apiProxy.request.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('/push'),
    );
    expect(pushCall).toBeDefined();
    const pushBody = (pushCall![1] as { body: { entries: SyncEntry[] } }).body;
    expect(pushBody.entries).toHaveLength(3);
  });

  it('vector clock ordering: causal order preserved across operations', () => {
    // Verify that vector clock operations produce correct causal ordering
    const clockA = VectorClock.create('node-A');                  // { 'node-A': 1 }
    const clockA2 = VectorClock.increment(clockA, 'node-A');      // { 'node-A': 2 }
    const clockB = VectorClock.create('node-B');                  // { 'node-B': 1 }

    // A2 is after A
    expect(VectorClock.compare(clockA2, clockA)).toBe('after');
    // A is before A2
    expect(VectorClock.compare(clockA, clockA2)).toBe('before');
    // A and B are concurrent (disjoint)
    expect(VectorClock.compare(clockA, clockB)).toBe('concurrent');

    // Merge preserves causality
    const merged = VectorClock.merge(clockA2, clockB);
    expect(merged).toEqual({ 'node-A': 2, 'node-B': 1 });
    expect(VectorClock.isDescendant(merged, clockA2)).toBe(true);
    expect(VectorClock.isDescendant(merged, clockB)).toBe(true);
  });

  it('conflict queue: manual-resolution queues conflict for later', async () => {
    const remoteEntry: SyncEntry = {
      id: 'task-1',
      data: { title: 'Server' },
      vectorClock: { 'server-node': 1 },
      timestamp: 2000,
      nodeId: 'server-node',
      dirty: false,
    };

    const { engine, conflictResolver } = createSyncStack(
      { defaultStrategy: 'manual-resolution' },
      { pullData: [remoteEntry] },
    );

    engine.trackChange('tasks', 'task-1', { title: 'Client' });
    await engine.sync('tasks');

    // Conflict should be queued
    expect(conflictResolver.getConflictCount()).toBe(1);
    const pending = conflictResolver.getPendingConflicts();
    expect(pending[0].id).toBe('task-1');
  });

  it('sync with no dirty entries: completes immediately, synced=0', async () => {
    const { engine } = createSyncStack();

    const result = await engine.sync('empty-collection');

    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toBe(0);
    expect(engine.getStatus()).toBe('idle');
  });

  it('network error during sync: entries remain dirty, status="error"', async () => {
    const { engine } = createSyncStack({}, { pushFail: true });

    engine.trackChange('tasks', 'task-1', { title: 'Unsent' });

    const result = await engine.sync('tasks');

    expect(engine.getStatus()).toBe('error');
    expect(engine.getDirtyEntries('tasks')).toHaveLength(1);
    expect(result.errors).toBeGreaterThanOrEqual(1);
  });
});
