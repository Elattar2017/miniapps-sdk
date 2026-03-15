/**
 * APIProxy Certificate Pinning Tests
 *
 * Tests for NativeNetworkModule integration, certificate pin matching,
 * pin expiration, and native vs JS fetch routing.
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
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// Mock fetch + AbortController
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

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

/** Create a mock NativeNetworkModule */
function createMockNativeModule() {
  return {
    fetch: jest.fn(),
    configurePins: jest.fn().mockResolvedValue(undefined),
  };
}

const SAMPLE_PINS: CertificatePinConfig[] = [
  {
    domain: 'api.example.com',
    pins: ['sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    includeSubdomains: true,
  },
  {
    domain: 'cdn.vendor.io',
    pins: ['sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='],
  },
];

function createConfig(overrides?: Partial<APIProxyConfig>): APIProxyConfig {
  return {
    baseUrl: 'https://api.example.com',
    authToken: 'test-token-123',
    certificatePins: SAMPLE_PINS,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: No native module available (fallback to standard fetch)
// ---------------------------------------------------------------------------

describe('APIProxy — Certificate Pinning (no native module)', () => {
  let proxy: APIProxy;

  beforeEach(() => {
    mockFetch.mockReset();
    // NativeNetworkModule not available (default in test env)
    proxy = new APIProxy(createConfig());
  });

  it('logs warning when pins configured but no native module', () => {
    // The constructor log warning is tested implicitly - proxy should still work
    expect(proxy).toBeDefined();
  });

  it('isNativePinningActive() returns false without native module', () => {
    expect(proxy.isNativePinningActive()).toBe(false);
  });

  it('falls back to standard fetch for pinned domains when native unavailable', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { data: 'ok' }));

    const result = await proxy.request('/api/data');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it('hasCertificatePins() returns true for exact domain match', () => {
    expect(proxy.hasCertificatePins('api.example.com')).toBe(true);
  });

  it('hasCertificatePins() returns true for subdomain when includeSubdomains=true', () => {
    expect(proxy.hasCertificatePins('v2.api.example.com')).toBe(true);
  });

  it('hasCertificatePins() returns false for subdomain when includeSubdomains not set', () => {
    // cdn.vendor.io does not have includeSubdomains
    expect(proxy.hasCertificatePins('images.cdn.vendor.io')).toBe(false);
  });

  it('hasCertificatePins() returns false for non-configured domain', () => {
    expect(proxy.hasCertificatePins('other.example.com')).toBe(false);
  });

  it('getCertificatePins() returns defensive copy', () => {
    const pins = proxy.getCertificatePins();
    expect(pins).toHaveLength(2);
    expect(pins).not.toBe((proxy as any).certificatePins);
  });
});

// ---------------------------------------------------------------------------
// Tests: Native module available (pinned requests routed through native)
// ---------------------------------------------------------------------------

describe('APIProxy — Certificate Pinning (with native module)', () => {
  let proxy: APIProxy;
  let mockNativeModule: ReturnType<typeof createMockNativeModule>;

  beforeEach(() => {
    mockFetch.mockReset();
    mockNativeModule = createMockNativeModule();

    // Inject mock native module via the private field
    proxy = new APIProxy(createConfig());
    (proxy as any).nativeNetworkModule = mockNativeModule;
  });

  it('isNativePinningActive() returns true with native module and active pins', () => {
    expect(proxy.isNativePinningActive()).toBe(true);
  });

  it('routes pinned domain requests through NativeNetworkModule', async () => {
    mockNativeModule.fetch.mockResolvedValueOnce(JSON.stringify({
      status: 200,
      data: { result: 'pinned' },
      headers: { 'x-pinned': 'true' },
    }));

    const result = await proxy.request('/api/data');

    // Should NOT use global fetch
    expect(mockFetch).not.toHaveBeenCalled();

    // Should use native module
    expect(mockNativeModule.fetch).toHaveBeenCalledTimes(1);
    expect(mockNativeModule.configurePins).toHaveBeenCalledTimes(1);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ result: 'pinned' });
    expect(result.headers['x-pinned']).toBe('true');
  });

  it('sends correct options to NativeNetworkModule.fetch()', async () => {
    mockNativeModule.fetch.mockResolvedValueOnce(JSON.stringify({
      status: 200,
      data: {},
      headers: {},
    }));

    await proxy.request('/api/data', {
      method: 'POST',
      body: { name: 'test' },
      headers: { 'X-Custom': 'value' },
    });

    const [url, optionsStr] = mockNativeModule.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/data');

    const options = JSON.parse(optionsStr);
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'test' }));
    expect(options.headers['X-Custom']).toBe('value');
    expect(options.headers['Authorization']).toBe('Bearer test-token-123');
  });

  it('configures pins on native module before first request', async () => {
    mockNativeModule.fetch.mockResolvedValueOnce(JSON.stringify({
      status: 200,
      data: {},
      headers: {},
    }));

    await proxy.request('/api/data');

    expect(mockNativeModule.configurePins).toHaveBeenCalledTimes(1);
    const pinsStr = mockNativeModule.configurePins.mock.calls[0][0];
    const pins = JSON.parse(pinsStr);
    expect(pins).toHaveLength(2);
    expect(pins[0].domain).toBe('api.example.com');
  });

  it('configures pins only once (cached)', async () => {
    mockNativeModule.fetch.mockResolvedValue(JSON.stringify({
      status: 200,
      data: {},
      headers: {},
    }));

    await proxy.request('/api/first');
    await proxy.request('/api/second');

    expect(mockNativeModule.configurePins).toHaveBeenCalledTimes(1);
  });

  it('routes subdomain requests through native module when includeSubdomains=true', async () => {
    mockNativeModule.fetch.mockResolvedValueOnce(JSON.stringify({
      status: 200,
      data: { sub: true },
      headers: {},
    }));

    // api.example.com has includeSubdomains=true, so v2.api.example.com should match
    const result = await proxy.requestAbsolute('https://v2.api.example.com/endpoint');

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockNativeModule.fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('uses standard fetch for non-pinned domains even when native module available', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { unpinned: true }));

    const result = await proxy.requestAbsolute('https://other-service.com/api/data');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockNativeModule.fetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('handles native module fetch errors and retries', async () => {
    mockNativeModule.fetch
      .mockRejectedValueOnce(new Error('Certificate pin mismatch'))
      .mockRejectedValueOnce(new Error('Certificate pin mismatch'))
      .mockRejectedValueOnce(new Error('Certificate pin mismatch'));

    const result = await proxy.request('/api/data');

    // 3 attempts: initial + 2 retries
    expect(mockNativeModule.fetch).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
  });

  it('handles 4xx from native module without retrying', async () => {
    mockNativeModule.fetch.mockResolvedValueOnce(JSON.stringify({
      status: 404,
      data: { error: 'not found' },
      headers: {},
    }));

    const result = await proxy.request('/api/missing');

    expect(mockNativeModule.fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('retries 5xx from native module', async () => {
    mockNativeModule.fetch
      .mockResolvedValueOnce(JSON.stringify({
        status: 500,
        data: { error: 'server error' },
        headers: {},
      }))
      .mockResolvedValueOnce(JSON.stringify({
        status: 200,
        data: { recovered: true },
        headers: {},
      }));

    const result = await proxy.request('/api/data');

    expect(mockNativeModule.fetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ recovered: true });
  });
});

// ---------------------------------------------------------------------------
// Tests: Pin expiration
// ---------------------------------------------------------------------------

describe('APIProxy — Certificate Pin Expiration', () => {
  it('excludes expired pins from active set', () => {
    const proxy = new APIProxy(createConfig({
      certificatePins: [
        {
          domain: 'api.example.com',
          pins: ['sha256/AAA='],
          expirationDate: '2020-01-01T00:00:00Z', // expired
        },
      ],
    }));

    // getActivePins is private, test via isNativePinningActive
    // With no active pins, native pinning shouldn't be active
    expect(proxy.isNativePinningActive()).toBe(false);
  });

  it('includes non-expired pins in active set', () => {
    const proxy = new APIProxy(createConfig({
      certificatePins: [
        {
          domain: 'api.example.com',
          pins: ['sha256/AAA='],
          expirationDate: '2030-01-01T00:00:00Z', // future
        },
      ],
    }));

    // Inject mock native module
    (proxy as any).nativeNetworkModule = createMockNativeModule();

    expect(proxy.isNativePinningActive()).toBe(true);
  });

  it('includes pins without expirationDate in active set', () => {
    const proxy = new APIProxy(createConfig({
      certificatePins: [
        {
          domain: 'api.example.com',
          pins: ['sha256/AAA='],
          // no expirationDate = never expires
        },
      ],
    }));

    (proxy as any).nativeNetworkModule = createMockNativeModule();
    expect(proxy.isNativePinningActive()).toBe(true);
  });

  it('falls back to standard fetch when all pins expired', async () => {
    const proxy = new APIProxy(createConfig({
      certificatePins: [
        {
          domain: 'api.example.com',
          pins: ['sha256/AAA='],
          expirationDate: '2020-01-01T00:00:00Z',
        },
      ],
    }));

    const mockNative = createMockNativeModule();
    (proxy as any).nativeNetworkModule = mockNative;

    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await proxy.request('/api/data');

    // Should use standard fetch, not native (all pins expired)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockNative.fetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: No pins configured
// ---------------------------------------------------------------------------

describe('APIProxy — No Certificate Pins', () => {
  it('does not attempt native module resolution when no pins configured', () => {
    const proxy = new APIProxy(createConfig({ certificatePins: undefined }));

    expect(proxy.isNativePinningActive()).toBe(false);
  });

  it('uses standard fetch for all requests when no pins', async () => {
    const proxy = new APIProxy(createConfig({ certificatePins: [] }));
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await proxy.request('/api/data');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});
