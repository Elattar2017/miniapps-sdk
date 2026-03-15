/**
 * ConflictResolver Test Suite
 *
 * Tests strategy-based conflict resolution: server-wins, client-wins,
 * latest-timestamp, manual-resolution, field overrides, DataBus events,
 * and queue management.
 */

import { ConflictResolver } from '../../../src/kernel/sync/ConflictResolver';
import type { SyncConflict, SyncEntry, ConflictResolutionConfig } from '../../../src/types';

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
// Helpers
// ---------------------------------------------------------------------------

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

function makeEntry<T>(overrides: Partial<SyncEntry<T>> = {}): SyncEntry<T> {
  return {
    id: 'entry-1',
    data: 'default' as T,
    vectorClock: { 'node-A': 1 },
    timestamp: Date.now(),
    nodeId: 'node-A',
    dirty: true,
    ...overrides,
  };
}

function makeConflict<T>(overrides: Partial<SyncConflict<T>> = {}): SyncConflict<T> {
  return {
    id: 'conflict-1',
    local: makeEntry<T>({ nodeId: 'client', timestamp: Date.now() }),
    remote: makeEntry<T>({ nodeId: 'server', timestamp: Date.now() + 1000, data: 'remote-data' as T }),
    ...overrides,
  };
}

function createConfig(overrides: Partial<ConflictResolutionConfig> = {}): ConflictResolutionConfig {
  return {
    defaultStrategy: 'server-wins',
    maxConflictQueueSize: 100,
    conflictTTL: 3600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConflictResolver', () => {
  describe('server-wins strategy', () => {
    it('returns remote entry', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'server-wins' }));
      const conflict = makeConflict();
      const result = resolver.resolve(conflict);
      expect(result.nodeId).toBe('server');
      expect(result.data).toBe('remote-data');
      expect(result.dirty).toBe(false);
    });
  });

  describe('client-wins strategy', () => {
    it('returns local entry', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'client-wins' }));
      const conflict = makeConflict();
      const result = resolver.resolve(conflict);
      expect(result.nodeId).toBe('client');
      expect(result.dirty).toBe(false);
    });
  });

  describe('latest-timestamp strategy', () => {
    it('returns the newer entry', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'latest-timestamp' }));
      const now = Date.now();
      const conflict = makeConflict({
        local: makeEntry({ nodeId: 'client', timestamp: now + 1000, data: 'local-newer' }),
        remote: makeEntry({ nodeId: 'server', timestamp: now, data: 'remote-older' }),
      });
      const result = resolver.resolve(conflict);
      expect(result.data).toBe('local-newer');
    });

    it('tie-breaks to server (remote)', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'latest-timestamp' }));
      const now = Date.now();
      const conflict = makeConflict({
        local: makeEntry({ nodeId: 'client', timestamp: now, data: 'local' }),
        remote: makeEntry({ nodeId: 'server', timestamp: now, data: 'remote' }),
      });
      const result = resolver.resolve(conflict);
      expect(result.data).toBe('remote');
    });
  });

  describe('manual-resolution strategy', () => {
    it('queues conflict and returns local temporarily', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'manual-resolution' }));
      const conflict = makeConflict();
      const result = resolver.resolve(conflict);

      // Returns local entry (temporarily)
      expect(result.nodeId).toBe('client');
      // Should still be dirty (not resolved)
      expect(result.dirty).toBe(true);
      // Conflict should be queued
      expect(resolver.getConflictCount()).toBe(1);
    });
  });

  describe('getPendingConflicts()', () => {
    it('returns queued conflicts', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'manual-resolution' }));
      resolver.resolve(makeConflict({ id: 'c1' }));
      resolver.resolve(makeConflict({ id: 'c2' }));

      const pending = resolver.getPendingConflicts();
      expect(pending).toHaveLength(2);
      expect(pending.map(c => c.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
    });
  });

  describe('resolveManually()', () => {
    it('resolves queued conflict and returns chosen entry', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'manual-resolution' }));
      resolver.resolve(makeConflict({ id: 'c1' }));

      const result = resolver.resolveManually('c1', 'remote');
      expect(result).not.toBeNull();
      expect(result!.nodeId).toBe('server');
      expect(result!.dirty).toBe(false);
      expect(resolver.getConflictCount()).toBe(0);
    });

    it('returns null for unknown conflictId', () => {
      const resolver = new ConflictResolver(createConfig());
      const result = resolver.resolveManually('nonexistent', 'local');
      expect(result).toBeNull();
    });
  });

  describe('field-specific strategy overrides', () => {
    it('overrides default strategy for specified field', () => {
      const resolver = new ConflictResolver(
        createConfig({
          defaultStrategy: 'server-wins',
          fieldOverrides: { title: 'client-wins' },
        }),
      );

      const conflict = makeConflict({
        field: 'title',
        local: makeEntry({ nodeId: 'client', data: 'local-title' }),
        remote: makeEntry({ nodeId: 'server', data: 'remote-title' }),
      });

      const result = resolver.resolve(conflict);
      // Field override is client-wins
      expect(result.data).toBe('local-title');
    });
  });

  describe('getConflictCount()', () => {
    it('returns correct count', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'manual-resolution' }));
      expect(resolver.getConflictCount()).toBe(0);
      resolver.resolve(makeConflict({ id: 'c1' }));
      expect(resolver.getConflictCount()).toBe(1);
      resolver.resolve(makeConflict({ id: 'c2' }));
      expect(resolver.getConflictCount()).toBe(2);
    });
  });

  describe('DataBus events', () => {
    it('publishes sdk:sync:conflict:detected event', () => {
      const dataBus = createMockDataBus();
      const resolver = new ConflictResolver(createConfig(), dataBus as unknown as import('../../../src/kernel/communication/DataBus').DataBus);
      resolver.resolve(makeConflict());

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:sync:conflict:detected',
        expect.objectContaining({ id: 'conflict-1' }),
      );
    });

    it('publishes sdk:sync:conflict:resolved event', () => {
      const dataBus = createMockDataBus();
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'server-wins' }), dataBus as unknown as import('../../../src/kernel/communication/DataBus').DataBus);
      resolver.resolve(makeConflict());

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:sync:conflict:resolved',
        expect.objectContaining({ id: 'conflict-1', strategy: 'server-wins' }),
      );
    });
  });

  describe('max queue size', () => {
    it('drops oldest conflict when queue exceeds max size', () => {
      const resolver = new ConflictResolver(
        createConfig({ defaultStrategy: 'manual-resolution', maxConflictQueueSize: 2 }),
      );

      resolver.resolve(makeConflict({ id: 'c1' }));
      resolver.resolve(makeConflict({ id: 'c2' }));
      resolver.resolve(makeConflict({ id: 'c3' }));

      expect(resolver.getConflictCount()).toBe(2);
      const ids = resolver.getPendingConflicts().map(c => c.id);
      expect(ids).not.toContain('c1');
      expect(ids).toContain('c2');
      expect(ids).toContain('c3');
    });
  });

  describe('works without DataBus', () => {
    it('resolves conflicts without DataBus (undefined)', () => {
      const resolver = new ConflictResolver(createConfig({ defaultStrategy: 'server-wins' }));
      const result = resolver.resolve(makeConflict());
      expect(result.nodeId).toBe('server');
    });
  });
});
