/**
 * TelemetryCollector Test Suite
 *
 * Tests for in-memory event buffering, remote flush with retry,
 * enable/disable toggling, and buffer overflow handling.
 */

import { TelemetryCollector } from '../../src/kernel/telemetry/TelemetryCollector';
import type { SDKEvent } from '../../src/types';

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
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

/** Build a mock Response object */
function mockResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

/** Create a valid SDKEvent */
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

describe('TelemetryCollector', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    mockFetch.mockReset();
    collector = new TelemetryCollector();
  });

  // ---------------------------------------------------------------------------
  // track()
  // ---------------------------------------------------------------------------

  describe('track()', () => {
    it('adds event to buffer', () => {
      const event = createEvent();
      collector.track(event);

      expect(collector.getBufferSize()).toBe(1);
      expect(collector.getEvents()[0]).toEqual(event);
    });

    it('does nothing when disabled', () => {
      collector.setEnabled(false);
      collector.track(createEvent());

      expect(collector.getBufferSize()).toBe(0);
    });

    it('drops oldest events when buffer exceeds MAX_BUFFER_SIZE (1000)', () => {
      // Add 1001 events
      for (let i = 0; i < 1001; i++) {
        collector.track(createEvent({ data: { index: i } }));
      }

      expect(collector.getBufferSize()).toBe(1000);

      // The first event (index 0) should have been dropped
      const events = collector.getEvents();
      expect((events[0].data as any).index).toBe(1);
      expect((events[999].data as any).index).toBe(1000);
    });

    it('buffer at exactly MAX_BUFFER_SIZE keeps all events', () => {
      for (let i = 0; i < 1000; i++) {
        collector.track(createEvent({ data: { index: i } }));
      }

      expect(collector.getBufferSize()).toBe(1000);

      const events = collector.getEvents();
      expect((events[0].data as any).index).toBe(0);
      expect((events[999].data as any).index).toBe(999);
    });
  });

  // ---------------------------------------------------------------------------
  // flush() - no endpoint
  // ---------------------------------------------------------------------------

  describe('flush() without endpoint', () => {
    it('clears buffer', async () => {
      collector.track(createEvent());
      collector.track(createEvent());
      expect(collector.getBufferSize()).toBe(2);

      await collector.flush();

      expect(collector.getBufferSize()).toBe(0);
    });

    it('no-op on empty buffer', async () => {
      expect(collector.getBufferSize()).toBe(0);
      await collector.flush();
      expect(collector.getBufferSize()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // flush() - with endpoint
  // ---------------------------------------------------------------------------

  describe('flush() with endpoint', () => {
    const endpointUrl = 'https://telemetry.example.com/v1/events';
    const authToken = 'secret-token-123';

    beforeEach(() => {
      collector.setEndpoint(endpointUrl, authToken);
    });

    it('POSTs events to endpoint URL', async () => {
      const event = createEvent();
      collector.track(event);
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        endpointUrl,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ events: [event] }),
        }),
      );
    });

    it('sends Authorization header', async () => {
      collector.track(createEvent());
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${authToken}`,
          }),
        }),
      );
    });

    it('clears buffer on 200 response', async () => {
      collector.track(createEvent());
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(collector.getBufferSize()).toBe(0);
    });

    it('retries once on non-200 response', async () => {
      collector.track(createEvent());
      mockFetch
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('clears buffer on successful retry', async () => {
      collector.track(createEvent());
      mockFetch
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(collector.getBufferSize()).toBe(0);
    });

    it('preserves buffer when both attempts fail', async () => {
      collector.track(createEvent());
      mockFetch
        .mockResolvedValueOnce(mockResponse(500))
        .mockResolvedValueOnce(mockResponse(503));

      await collector.flush();

      expect(collector.getBufferSize()).toBe(1);
    });

    it('preserves buffer on network error (fetch throws)', async () => {
      collector.track(createEvent());
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await collector.flush();

      expect(collector.getBufferSize()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // setEndpoint()
  // ---------------------------------------------------------------------------

  describe('setEndpoint()', () => {
    it('stores url and authToken for use in flush', async () => {
      const url = 'https://telemetry.example.com/v1/events';
      const token = 'my-token';
      collector.setEndpoint(url, token);

      collector.track(createEvent());
      mockFetch.mockResolvedValueOnce(mockResponse(200));

      await collector.flush();

      expect(mockFetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // setEnabled()
  // ---------------------------------------------------------------------------

  describe('setEnabled()', () => {
    it('disables tracking when set to false', () => {
      collector.setEnabled(false);
      collector.track(createEvent());

      expect(collector.getBufferSize()).toBe(0);
      expect(collector.isEnabled()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getEvents()
  // ---------------------------------------------------------------------------

  describe('getEvents()', () => {
    it('returns shallow copy (mutations do not affect internal buffer)', () => {
      collector.track(createEvent());
      const events = collector.getEvents();

      // Mutate the returned array
      events.push(createEvent());

      // Internal buffer should be unchanged
      expect(collector.getBufferSize()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getBufferSize()
  // ---------------------------------------------------------------------------

  describe('getBufferSize()', () => {
    it('returns correct event count', () => {
      expect(collector.getBufferSize()).toBe(0);
      collector.track(createEvent());
      expect(collector.getBufferSize()).toBe(1);
      collector.track(createEvent());
      expect(collector.getBufferSize()).toBe(2);
    });
  });
});
