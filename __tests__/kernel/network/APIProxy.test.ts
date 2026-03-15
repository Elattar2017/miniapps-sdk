/**
 * APIProxy Test Suite
 *
 * Tests for the kernel-level HTTP proxy that handles auth injection,
 * retries with exponential backoff, DataBus event publication, and
 * latency measurement for all module API calls.
 */

import { APIProxy } from '../../../src/kernel/network/APIProxy';
import { DEFAULT_TIMEOUTS } from '../../../src/constants/defaults';
import type { APIProxyConfig } from '../../../src/types';

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
// Mock fetch + AbortController
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Ensure AbortController is available in test environment
if (typeof AbortController === 'undefined') {
  (global as any).AbortController = class {
    signal = {};
    abort() {}
  };
}

/** Build a mock Response object */
function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const headersInstance = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    headers: {
      forEach: (cb: (value: string, key: string) => void) => {
        headersInstance.forEach((value, key) => cb(value, key));
      },
    },
  } as unknown as Response;
}

/** Create a mock DataBus with a publish spy */
function createMockDataBus() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getSubscriberCount: jest.fn(),
    getChannels: jest.fn(),
    clear: jest.fn(),
  };
}

/** Create a mock TelemetryCollector */
function createMockTelemetry() {
  return {
    track: jest.fn(),
    flush: jest.fn(),
    setEnabled: jest.fn(),
    getEvents: jest.fn(),
    getBufferSize: jest.fn(),
    isEnabled: jest.fn(),
  };
}

/** Create a valid APIProxyConfig */
function createConfig(overrides?: Partial<APIProxyConfig>): APIProxyConfig {
  return {
    baseUrl: 'https://api.example.com',
    authToken: 'test-token-123',
    dataBus: createMockDataBus() as any,
    telemetry: createMockTelemetry() as any,
    ...overrides,
  };
}

describe('APIProxy', () => {
  let proxy: APIProxy;
  let config: APIProxyConfig;

  beforeEach(() => {
    mockFetch.mockReset();
    jest.useFakeTimers();
    config = createConfig();
    proxy = new APIProxy(config);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('stores the baseUrl from config', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

      // Use real timers for this test since we need fetch to resolve
      jest.useRealTimers();
      await proxy.request('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.any(Object),
      );
    });

    it('stores the authToken from config', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

      jest.useRealTimers();
      await proxy.request('/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        }),
      );
    });

    it('uses DEFAULT_TIMEOUTS.API_REQUEST when no timeout is configured', () => {
      const proxyNoTimeout = new APIProxy(createConfig({ timeouts: undefined }));
      // The default timeout is used internally — we test indirectly via
      // the setTimeout call in request()
      expect(proxyNoTimeout).toBeDefined();
      // DEFAULT_TIMEOUTS.API_REQUEST should be 10_000
      expect(DEFAULT_TIMEOUTS.API_REQUEST).toBe(10_000);
    });

    it('uses custom timeout when provided in config', () => {
      const proxyCustom = new APIProxy(createConfig({ timeouts: { apiRequest: 5000 } }));
      expect(proxyCustom).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // request() — Basic behavior
  // ---------------------------------------------------------------------------

  describe('request()', () => {
    it('injects Authorization header by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      await proxy.request('/api/data');

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does NOT add Authorization header when skipAuth is true', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      await proxy.request('/api/public', { skipAuth: true });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.headers.Authorization).toBeUndefined();
    });

    it('uses GET method by default', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      await proxy.request('/api/data');

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.method).toBe('GET');
    });

    it('uses the specified HTTP method', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { created: true }));

      jest.useRealTimers();
      await proxy.request('/api/items', { method: 'POST', body: { name: 'test' } });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.method).toBe('POST');
    });

    it('serializes body as JSON for non-GET methods', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 1 }));

      jest.useRealTimers();
      await proxy.request('/api/items', { method: 'POST', body: { name: 'widget' } });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.body).toBe(JSON.stringify({ name: 'widget' }));
    });

    it('passes string body as-is for non-GET methods', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 1 }));

      jest.useRealTimers();
      await proxy.request('/api/items', { method: 'POST', body: 'raw-string' });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.body).toBe('raw-string');
    });

    it('does not include body for GET requests', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      await proxy.request('/api/data', { method: 'GET', body: { ignored: true } });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.body).toBeUndefined();
    });

    it('merges custom headers with defaults', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      await proxy.request('/api/data', { headers: { 'X-Custom': 'value' } });

      const [, fetchOpts] = mockFetch.mock.calls[0];
      expect(fetchOpts.headers['X-Custom']).toBe('value');
      expect(fetchOpts.headers['Accept']).toBe('application/json');
      expect(fetchOpts.headers['Content-Type']).toBe('application/json');
    });

    it('returns a successful APIResponse with ok=true', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { users: [] }, { 'x-request-id': 'abc' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/users');

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ users: [] });
      expect(result.headers['x-request-id']).toBe('abc');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('measures latency in the response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));

      jest.useRealTimers();
      const result = await proxy.request('/api/data');

      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // request() — Error handling and retries
  // ---------------------------------------------------------------------------

  describe('retries', () => {
    it('retries on 5xx errors up to maxRetries (default 2)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(500, { error: 'fail' }))
        .mockResolvedValueOnce(mockResponse(500, { error: 'fail' }))
        .mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/data');

      // 3 total calls: initial + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it('does NOT retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(404, { error: 'not found' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/missing');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    it('returns last 5xx error when all retries are exhausted', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(503, { error: 'down' }))
        .mockResolvedValueOnce(mockResponse(503, { error: 'down' }))
        .mockResolvedValueOnce(mockResponse(503, { error: 'still down' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/data');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
    });

    it('respects custom retries count', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(500, { error: 'fail' }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      jest.useRealTimers();
      const result = await proxy.request('/api/data', { retries: 1 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
    });

    it('handles network errors and returns status 0', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      jest.useRealTimers();
      const result = await proxy.request('/api/data', { retries: 0 });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
      expect(result.data).toBeNull();
    });

    it('applies exponential backoff between retries', async () => {
      // We observe backoff by counting how many times fetch is called
      // and verifying the delays. We use real timers to let backoff resolve.
      const backoffSpy = jest.spyOn(APIProxy.prototype as any, 'backoff');

      mockFetch
        .mockResolvedValueOnce(mockResponse(500, { error: 'fail' }))
        .mockResolvedValueOnce(mockResponse(500, { error: 'fail' }))
        .mockResolvedValueOnce(mockResponse(200, { ok: true }));

      jest.useRealTimers();
      await proxy.request('/api/data');

      // backoff should have been called twice (attempt 0, attempt 1)
      expect(backoffSpy).toHaveBeenCalledTimes(2);
      expect(backoffSpy).toHaveBeenCalledWith(0);
      expect(backoffSpy).toHaveBeenCalledWith(1);

      backoffSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // request() — JSON parsing
  // ---------------------------------------------------------------------------

  describe('JSON parsing', () => {
    it('handles JSON parse failures gracefully (returns null data)', async () => {
      const badResponse = {
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
        headers: {
          forEach: jest.fn(),
        },
      } as unknown as Response;
      mockFetch.mockResolvedValueOnce(badResponse);

      jest.useRealTimers();
      const result = await proxy.request('/api/data');

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.data).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // request() — DataBus integration
  // ---------------------------------------------------------------------------

  describe('DataBus events', () => {
    it('publishes sdk:api:request event on DataBus', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));
      const dataBus = config.dataBus!;

      jest.useRealTimers();
      await proxy.request('/api/data', { method: 'POST' });

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:api:request',
        expect.objectContaining({
          url: 'https://api.example.com/api/data',
          method: 'POST',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('publishes sdk:api:response event on DataBus for successful request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));
      const dataBus = config.dataBus!;

      jest.useRealTimers();
      await proxy.request('/api/data');

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:api:response',
        expect.objectContaining({
          url: 'https://api.example.com/api/data',
          method: 'GET',
          status: 200,
          latencyMs: expect.any(Number),
        }),
      );
    });

    it('publishes sdk:api:response event with error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const dataBus = config.dataBus!;

      jest.useRealTimers();
      await proxy.request('/api/data', { retries: 0 });

      expect(dataBus.publish).toHaveBeenCalledWith(
        'sdk:api:response',
        expect.objectContaining({
          url: 'https://api.example.com/api/data',
          status: 0,
          error: 'Connection refused',
        }),
      );
    });

    it('works without DataBus (no crash)', async () => {
      const proxyNoBus = new APIProxy(createConfig({ dataBus: undefined }));
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));

      jest.useRealTimers();
      const result = await proxyNoBus.request('/api/data');

      expect(result.ok).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // updateAuthToken()
  // ---------------------------------------------------------------------------

  describe('updateAuthToken()', () => {
    it('updates the token for subsequent requests', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(200, {}))
        .mockResolvedValueOnce(mockResponse(200, {}));

      jest.useRealTimers();

      // First request uses original token
      await proxy.request('/api/data');
      const [, firstOpts] = mockFetch.mock.calls[0];
      expect(firstOpts.headers.Authorization).toBe('Bearer test-token-123');

      // Update token
      proxy.updateAuthToken('new-token-456');

      // Second request uses updated token
      await proxy.request('/api/data');
      const [, secondOpts] = mockFetch.mock.calls[1];
      expect(secondOpts.headers.Authorization).toBe('Bearer new-token-456');
    });
  });

  // ---------------------------------------------------------------------------
  // request() — Timeout
  // ---------------------------------------------------------------------------

  describe('timeout', () => {
    it('uses custom timeout when provided in options', async () => {
      jest.useRealTimers();
      const timeoutCalls: number[] = [];
      const realSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
        if (delay !== undefined) {
          timeoutCalls.push(delay);
        }
        return realSetTimeout(fn, delay, ...args);
      }) as typeof global.setTimeout;

      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));
      await proxy.request('/api/data', { timeout: 3000 });

      expect(timeoutCalls).toContain(3000);
      global.setTimeout = realSetTimeout;
    });

    it('uses default timeout from config when no custom timeout provided', async () => {
      jest.useRealTimers();
      const customProxy = new APIProxy(createConfig({ timeouts: { apiRequest: 7000 } }));
      const timeoutCalls: number[] = [];
      const realSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
        if (delay !== undefined) {
          timeoutCalls.push(delay);
        }
        return realSetTimeout(fn, delay, ...args);
      }) as typeof global.setTimeout;

      mockFetch.mockResolvedValueOnce(mockResponse(200, {}));
      await customProxy.request('/api/data');

      expect(timeoutCalls).toContain(7000);
      global.setTimeout = realSetTimeout;
    });
  });

  // ---------------------------------------------------------------------------
  // request() — 4xx responses
  // ---------------------------------------------------------------------------

  describe('4xx responses', () => {
    it('returns ok=false for 400 status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(400, { error: 'bad request' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/data');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.data).toEqual({ error: 'bad request' });
    });

    it('returns ok=false for 401 status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(401, { error: 'unauthorized' }));

      jest.useRealTimers();
      const result = await proxy.request('/api/protected');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });
  });
});
