/**
 * TelemetryCollector Offline Persistence Tests
 *
 * Tests for event persistence via StorageAdapter, restoration on flush,
 * and persistence-on-failure behavior.
 */

import { TelemetryCollector } from '../../src/kernel/telemetry/TelemetryCollector';
import type { SDKEvent } from '../../src/types';
import type { IStorageAdapter } from '../../src/types/storage.types';

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
// Mock fetch & storage
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function mockResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

function createEvent(overrides?: Partial<SDKEvent>): SDKEvent {
  return {
    type: 'module_loaded',
    timestamp: Date.now(),
    tenantId: 'tenant-1',
    userId: 'user-1',
    data: { key: 'value' },
    ...overrides,
  };
}

/** Simple in-memory mock of IStorageAdapter */
function createMockStorage(): IStorageAdapter {
  const store = new Map<string, string>();
  return {
    getString: (key: string) => store.get(key),
    setString: (key: string, value: string) => { store.set(key, value); },
    getNumber: () => undefined,
    setNumber: () => {},
    getBoolean: () => undefined,
    setBoolean: () => {},
    delete: (key: string) => { store.delete(key); },
    contains: (key: string) => store.has(key),
    getAllKeys: () => Array.from(store.keys()),
    clearAll: () => store.clear(),
    query: async () => [],
    execute: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TelemetryCollector — offline persistence', () => {
  let collector: TelemetryCollector;
  let storage: IStorageAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    collector = new TelemetryCollector();
    storage = createMockStorage();
  });

  describe('flush without endpoint, with storage', () => {
    it('persists events to storage instead of dropping them', async () => {
      collector.setStorage(storage);
      collector.track(createEvent({ data: { idx: 1 } }));
      collector.track(createEvent({ data: { idx: 2 } }));

      await collector.flush();

      // Buffer should be cleared
      expect(collector.getBufferSize()).toBe(0);

      // Events should be in storage
      const raw = storage.getString('__telemetry_persisted_events');
      expect(raw).toBeDefined();
      const persisted = JSON.parse(raw!);
      expect(persisted).toHaveLength(2);
      expect(persisted[0].data.idx).toBe(1);
    });
  });

  describe('flush with endpoint restores persisted events', () => {
    it('includes persisted events in the flush payload', async () => {
      collector.setStorage(storage);

      // Simulate previously persisted events
      const oldEvents = [createEvent({ data: { old: true } })];
      storage.setString('__telemetry_persisted_events', JSON.stringify(oldEvents));

      // Add a new event
      collector.track(createEvent({ data: { new: true } }));

      collector.setEndpoint('https://telemetry.test/events', 'token');
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      // Should have sent both old + new events
      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.events).toHaveLength(2);
      expect(sentBody.events[0].data.old).toBe(true);
      expect(sentBody.events[1].data.new).toBe(true);

      // Buffer cleared, persisted events cleared
      expect(collector.getBufferSize()).toBe(0);
      expect(storage.getString('__telemetry_persisted_events')).toBeUndefined();
    });
  });

  describe('flush failure persists events to storage', () => {
    it('persists events when remote flush fails with endpoint + storage', async () => {
      collector.setStorage(storage);
      collector.setEndpoint('https://telemetry.test/events', 'token');
      collector.track(createEvent({ data: { idx: 1 } }));

      mockFetch
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(503));

      await collector.flush();

      // Events preserved in buffer
      expect(collector.getBufferSize()).toBe(1);

      // Also persisted to storage
      const raw = storage.getString('__telemetry_persisted_events');
      expect(raw).toBeDefined();
      const persisted = JSON.parse(raw!);
      expect(persisted).toHaveLength(1);
    });

    it('persists events on network error', async () => {
      collector.setStorage(storage);
      collector.setEndpoint('https://telemetry.test/events', 'token');
      collector.track(createEvent());

      mockFetch.mockRejectedValueOnce(new Error('Network down'));

      await collector.flush();

      const raw = storage.getString('__telemetry_persisted_events');
      expect(raw).toBeDefined();
    });
  });

  describe('getPersistedCount()', () => {
    it('returns 0 when no storage configured', () => {
      expect(collector.getPersistedCount()).toBe(0);
    });

    it('returns 0 when no persisted events', () => {
      collector.setStorage(storage);
      expect(collector.getPersistedCount()).toBe(0);
    });

    it('returns count of persisted events', () => {
      collector.setStorage(storage);
      const events = [createEvent(), createEvent(), createEvent()];
      storage.setString('__telemetry_persisted_events', JSON.stringify(events));

      expect(collector.getPersistedCount()).toBe(3);
    });
  });

  describe('resilience', () => {
    it('handles corrupted persisted JSON gracefully', async () => {
      collector.setStorage(storage);
      storage.setString('__telemetry_persisted_events', '{invalid json!!!');

      collector.track(createEvent());
      // Should not throw
      await expect(collector.flush()).resolves.toBeUndefined();
      expect(collector.getBufferSize()).toBe(0);
    });

    it('handles storage write failure gracefully', async () => {
      const failingStorage = createMockStorage();
      failingStorage.setString = () => { throw new Error('Storage full'); };
      collector.setStorage(failingStorage);

      collector.track(createEvent());
      // Should not throw even if persistence fails
      await expect(collector.flush()).resolves.toBeUndefined();
    });
  });
});
