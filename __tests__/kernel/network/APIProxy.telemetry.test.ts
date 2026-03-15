/**
 * APIProxy Telemetry & Certificate Pins Test Suite
 *
 * Tests for telemetry tracking integration, certificate pin storage,
 * and pin lookup methods added in Phase 8 Track C.
 */

import { APIProxy } from '../../../src/kernel/network/APIProxy';
import type { APIProxyConfig, CertificatePinConfig } from '../../../src/types';

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
(global as Record<string, unknown>).fetch = mockFetch;

if (typeof AbortController === 'undefined') {
  (global as Record<string, unknown>).AbortController = class {
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

/** Create a mock TelemetryCollector */
function createMockTelemetry() {
  return {
    track: jest.fn(),
    flush: jest.fn(),
    setEnabled: jest.fn(),
    getEvents: jest.fn(),
    getBufferSize: jest.fn(),
    isEnabled: jest.fn(),
    setEndpoint: jest.fn(),
  };
}

/** Create a mock DataBus */
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

/** Create a valid APIProxyConfig */
function createConfig(overrides?: Partial<APIProxyConfig>): APIProxyConfig {
  return {
    baseUrl: 'https://api.example.com',
    authToken: 'test-token-123',
    dataBus: createMockDataBus() as never,
    telemetry: createMockTelemetry() as never,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Telemetry tracking
// ---------------------------------------------------------------------------

describe('APIProxy telemetry tracking', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('tracks request events via telemetry.track() when telemetry is provided', async () => {
    const telemetry = createMockTelemetry();
    const proxy = new APIProxy(createConfig({ telemetry: telemetry as never }));
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await proxy.request('/test');

    expect(telemetry.track).toHaveBeenCalledTimes(1);
    expect(telemetry.track).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'api_request',
        timestamp: expect.any(Number),
        data: expect.objectContaining({
          url: 'https://api.example.com/test',
          method: 'GET',
          status: 200,
          latencyMs: expect.any(Number),
        }),
      }),
    );
  });

  it('works without telemetry (undefined) - no crash', async () => {
    const proxy = new APIProxy(createConfig({ telemetry: undefined }));
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await proxy.request('/test');

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('telemetry track receives correct url, method, status, and latencyMs', async () => {
    const telemetry = createMockTelemetry();
    const proxy = new APIProxy(createConfig({ telemetry: telemetry as never }));
    mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 1 }));

    await proxy.request('/items', { method: 'POST', body: { name: 'test' } });

    expect(telemetry.track).toHaveBeenCalledTimes(1);
    const trackedEvent = telemetry.track.mock.calls[0][0];
    expect(trackedEvent.data.url).toBe('https://api.example.com/items');
    expect(trackedEvent.data.method).toBe('POST');
    expect(trackedEvent.data.status).toBe(201);
    expect(typeof trackedEvent.data.latencyMs).toBe('number');
    expect(trackedEvent.data.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks telemetry on 4xx error responses', async () => {
    const telemetry = createMockTelemetry();
    const proxy = new APIProxy(createConfig({ telemetry: telemetry as never }));
    mockFetch.mockResolvedValueOnce(mockResponse(404, { error: 'not found' }));

    await proxy.request('/missing');

    expect(telemetry.track).toHaveBeenCalledTimes(1);
    const trackedEvent = telemetry.track.mock.calls[0][0];
    expect(trackedEvent.data.status).toBe(404);
  });

  it('tracks telemetry on network failure (status 0)', async () => {
    const telemetry = createMockTelemetry();
    const proxy = new APIProxy(createConfig({ telemetry: telemetry as never }));
    mockFetch.mockRejectedValue(new Error('Network error'));

    await proxy.request('/fail', { retries: 0 });

    expect(telemetry.track).toHaveBeenCalledTimes(1);
    const trackedEvent = telemetry.track.mock.calls[0][0];
    expect(trackedEvent.data.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Certificate pin storage
// ---------------------------------------------------------------------------

describe('APIProxy certificate pins', () => {
  const samplePins: CertificatePinConfig[] = [
    {
      domain: 'api.example.com',
      pins: ['sha256/AAAA...', 'sha256/BBBB...'],
      includeSubdomains: true,
    },
    {
      domain: 'secure.other.com',
      pins: ['sha256/CCCC...'],
      includeSubdomains: false,
    },
  ];

  it('stores certificate pins from config', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));
    const pins = proxy.getCertificatePins();

    expect(pins).toHaveLength(2);
    expect(pins[0].domain).toBe('api.example.com');
    expect(pins[1].domain).toBe('secure.other.com');
  });

  it('logs warning when pins are configured', () => {
    const warnSpy = jest.spyOn(console, 'warn');
    new APIProxy(createConfig({ certificatePins: samplePins }));

    // The logger.warn call goes through console.warn internally
    // We just verify the proxy is created and the warning was triggered
    // by checking that console.warn was called (logger outputs via console)
    expect(warnSpy).toHaveBeenCalled();
  });

  it('getCertificatePins() returns a copy of stored pins', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));
    const pins1 = proxy.getCertificatePins();
    const pins2 = proxy.getCertificatePins();

    // Should be equal in content
    expect(pins1).toEqual(pins2);
    // But not the same array reference (defensive copy)
    expect(pins1).not.toBe(pins2);
  });

  it('hasCertificatePins returns true for exact domain match', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));

    expect(proxy.hasCertificatePins('api.example.com')).toBe(true);
    expect(proxy.hasCertificatePins('secure.other.com')).toBe(true);
  });

  it('hasCertificatePins returns false for non-matching domain', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));

    expect(proxy.hasCertificatePins('unknown.com')).toBe(false);
    expect(proxy.hasCertificatePins('example.com')).toBe(false);
  });

  it('hasCertificatePins returns true with includeSubdomains=true', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));

    // api.example.com has includeSubdomains: true
    expect(proxy.hasCertificatePins('sub.api.example.com')).toBe(true);
    expect(proxy.hasCertificatePins('deep.sub.api.example.com')).toBe(true);
  });

  it('hasCertificatePins returns false with includeSubdomains=false', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: samplePins }));

    // secure.other.com has includeSubdomains: false
    expect(proxy.hasCertificatePins('sub.secure.other.com')).toBe(false);
  });

  it('empty pins array: hasCertificatePins returns false for any domain', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: [] }));

    expect(proxy.hasCertificatePins('api.example.com')).toBe(false);
    expect(proxy.hasCertificatePins('anything.com')).toBe(false);
  });
});
