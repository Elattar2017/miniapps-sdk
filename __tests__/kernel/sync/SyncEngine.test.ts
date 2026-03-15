/**
 * SyncEngine Test Suite
 *
 * Tests change tracking, sync lifecycle, vector clock integration,
 * conflict delegation, DataBus events, and error handling.
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

function createMockAPIProxy(overrides: { pushOk?: boolean; pullData?: SyncEntry[] } = {}) {
  const { pushOk = true, pullData = [] } = overrides;
  return {
    request: jest.fn().mockImplementation(async (path: string) => {
      if (path.includes('/push')) {
        return { ok: pushOk, status: pushOk ? 200 : 500, data: null, headers: {}, latencyMs: 50 };
      }
      if (path.includes('/pull')) {
        return { ok: true, status: 200, data: { entries: pullData, collection: 'tasks' }, headers: {}, latencyMs: 50 };
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
  pullData?: SyncEntry[];
  dataBus?: ReturnType<typeof createMockDataBus>;
  apiProxy?: ReturnType<typeof createMockAPIProxy>;
} = {}) {
  const storage = createMockStorage();
  const apiProxy = overrides.apiProxy ?? createMockAPIProxy({
    pushOk: overrides.pushOk,
    pullData: overrides.pullData,
  });
  const conflictResolver = new ConflictResolver({
    defaultStrategy: 'server-wins',
    maxConflictQueueSize: 100,
    conflictTTL: 3600,
  });
  const dataBus = overrides.dataBus ?? createMockDataBus();
  const engine = new SyncEngine(
    storage,
    apiProxy as unknown as import('../../../src/kernel/network/APIProxy').APIProxy,
    conflictResolver,
    dataBus as unknown as import('../../../src/kernel/communication/DataBus').DataBus,
    { nodeId: 'client-1' },
  );
  return { engine, storage, apiProxy, conflictResolver, dataBus };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncEngine', () => {
  describe('trackChange()', () => {
    it('marks entry dirty and increments clock', () => {
      const { engine } = createEngine();
      engine.trackChange('tasks', 'task-1', { title: 'Do something' });

      const dirty = engine.getDirtyEntries('tasks');
      expect(dirty).toHaveLength(1);
      expect(dirty[0].id).toBe('task-1');
      expect(dirty[0].dirty).toBe(true);
      expect(dirty[0].vectorClock).toEqual({ 'client-1': 1 });
    });

    it('updates data and increments clock on existing entry', () => {
      const { engine } = createEngine();
      engine.trackChange('tasks', 'task-1', { title: 'v1' });
      engine.trackChange('tasks', 'task-1', { title: 'v2' });

      const dirty = engine.getDirtyEntries('tasks');
      expect(dirty).toHaveLength(1);
      expect(dirty[0].data).toEqual({ title: 'v2' });
      expect(dirty[0].vectorClock).toEqual({ 'client-1': 2 });
    });
  });

  describe('getDirtyEntries()', () => {
    it('returns only dirty entries', () => {
      const { engine } = createEngine();
      engine.trackChange('tasks', 'task-1', { title: 'dirty' });
      engine.trackChange('tasks', 'task-2', { title: 'also dirty' });
      engine.markClean('tasks', 'task-1');

      const dirty = engine.getDirtyEntries('tasks');
      expect(dirty).toHaveLength(1);
      expect(dirty[0].id).toBe('task-2');
    });
  });

  describe('sync()', () => {
    it('pushes dirty entries and pulls remote changes', async () => {
      const { engine, apiProxy } = createEngine();
      engine.trackChange('tasks', 'task-1', { title: 'local' });

      const result = await engine.sync('tasks');

      expect(apiProxy.request).toHaveBeenCalledWith(
        '/api/sync/tasks/push',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(apiProxy.request).toHaveBeenCalledWith(
        '/api/sync/tasks/pull',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.synced).toBeGreaterThanOrEqual(1);
    });

    it('calls conflictResolver for concurrent changes', async () => {
      const { engine, conflictResolver } = createEngine({
        pullData: [{
          id: 'task-1',
          data: { title: 'remote' },
          vectorClock: { 'server-1': 2 },
          timestamp: 2000,
          nodeId: 'server-1',
          dirty: false,
        }],
      });

      // Create a local entry with a different vector clock (concurrent)
      engine.trackChange('tasks', 'task-1', { title: 'local' });

      const resolveSpy = jest.spyOn(conflictResolver, 'resolve');
      await engine.sync('tasks');

      expect(resolveSpy).toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('returns "idle" initially', () => {
      const { engine } = createEngine();
      expect(engine.getStatus()).toBe('idle');
    });

    it('returns "idle" after successful sync', async () => {
      const { engine } = createEngine();
      await engine.sync('tasks');
      expect(engine.getStatus()).toBe('idle');
    });
  });

  describe('getLastSyncTime()', () => {
    it('returns null before first sync', () => {
      const { engine } = createEngine();
      expect(engine.getLastSyncTime('tasks')).toBeNull();
    });

    it('returns timestamp after sync', async () => {
      const { engine } = createEngine();
      const before = Date.now();
      await engine.sync('tasks');
      const after = Date.now();

      const lastSync = engine.getLastSyncTime('tasks');
      expect(lastSync).not.toBeNull();
      expect(lastSync).toBeGreaterThanOrEqual(before);
      expect(lastSync).toBeLessThanOrEqual(after);
    });
  });

  describe('markClean()', () => {
    it('clears dirty flag', () => {
      const { engine } = createEngine();
      engine.trackChange('tasks', 'task-1', { title: 'test' });
      expect(engine.getDirtyEntries('tasks')).toHaveLength(1);

      engine.markClean('tasks', 'task-1');
      expect(engine.getDirtyEntries('tasks')).toHaveLength(0);
    });
  });

  describe('DataBus events', () => {
    it('publishes sdk:sync:started event', async () => {
      const dataBus = createMockDataBus();
      const { engine } = createEngine({ dataBus });

      await engine.sync('tasks');

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:sync:started',
        expect.objectContaining({ collection: 'tasks' }),
      );
    });

    it('publishes sdk:sync:completed event', async () => {
      const dataBus = createMockDataBus();
      const { engine } = createEngine({ dataBus });

      await engine.sync('tasks');

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:sync:completed',
        expect.objectContaining({ collection: 'tasks' }),
      );
    });

    it('publishes sdk:sync:error event on failure', async () => {
      const dataBus = createMockDataBus();
      const apiProxy = createMockAPIProxy();
      apiProxy.request.mockRejectedValue(new Error('Network failure'));
      const { engine } = createEngine({ dataBus, apiProxy });

      await engine.sync('tasks');

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:sync:error',
        expect.objectContaining({ collection: 'tasks', error: 'Network failure' }),
      );
    });
  });

  describe('error handling', () => {
    it('network error during sync: status="error", preserves dirty entries', async () => {
      const apiProxy = createMockAPIProxy();
      apiProxy.request.mockRejectedValue(new Error('offline'));
      const { engine } = createEngine({ apiProxy });

      engine.trackChange('tasks', 'task-1', { title: 'unsent' });
      await engine.sync('tasks');

      expect(engine.getStatus()).toBe('error');
      expect(engine.getDirtyEntries('tasks')).toHaveLength(1);
    });
  });

  describe('empty sync', () => {
    it('completes quickly with synced=0', async () => {
      const { engine } = createEngine();
      const result = await engine.sync('empty-collection');
      expect(result.synced).toBe(0);
      expect(result.conflicts).toBe(0);
      expect(result.errors).toBe(0);
    });
  });

  describe('multiple collections', () => {
    it('tracked independently', () => {
      const { engine } = createEngine();
      engine.trackChange('tasks', 'id-1', { t: 1 });
      engine.trackChange('notes', 'id-2', { n: 2 });

      expect(engine.getDirtyEntries('tasks')).toHaveLength(1);
      expect(engine.getDirtyEntries('notes')).toHaveLength(1);
      expect(engine.getDirtyEntries('other')).toHaveLength(0);
    });
  });
});
