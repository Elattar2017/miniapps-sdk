/**
 * APIProxy.requestAbsolute() Test Suite
 */

import { APIProxy } from '../../../src/kernel/network/APIProxy';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

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

function createProxy(dataBus?: ReturnType<typeof createMockDataBus>) {
  return new APIProxy({
    baseUrl: 'https://api.example.com',
    authToken: 'default-token',
    dataBus: dataBus as any,
  });
}

describe('APIProxy.requestAbsolute', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok' }),
      headers: new Map([['content-type', 'application/json']]),
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends to full URL without prepending baseUrl', async () => {
    const proxy = createProxy();
    await proxy.requestAbsolute('https://external.api.com/token', { method: 'POST' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://external.api.com/token',
      expect.anything(),
    );
  });

  it('with skipAuth: no Authorization header', async () => {
    const proxy = createProxy();
    await proxy.requestAbsolute('https://ext.com/api', { skipAuth: true });
    const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['Authorization']).toBeUndefined();
  });

  it('without skipAuth: Authorization header present', async () => {
    const proxy = createProxy();
    await proxy.requestAbsolute('https://ext.com/api', {});
    const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['Authorization']).toBe('Bearer default-token');
  });

  it('returns APIResponse shape', async () => {
    const proxy = createProxy();
    const response = await proxy.requestAbsolute('https://ext.com/api');
    expect(response).toHaveProperty('ok');
    expect(response).toHaveProperty('status');
    expect(response).toHaveProperty('data');
    expect(response).toHaveProperty('latencyMs');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it('skipAuth skips module tokens too', async () => {
    const proxy = createProxy();
    proxy.setModuleToken('mod1', 'module-tok', ['ext.com']);
    await proxy.requestAbsolute('https://ext.com/api', { skipAuth: true });
    const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].headers['Authorization']).toBeUndefined();
  });

  it('publishes DataBus request event', async () => {
    const dataBus = createMockDataBus();
    const proxy = createProxy(dataBus);
    await proxy.requestAbsolute('https://ext.com/api');
    expect(dataBus.publish).toHaveBeenCalledWith(
      'sdk:api:request',
      expect.objectContaining({ url: 'https://ext.com/api' }),
    );
  });

  it('POST body sent correctly', async () => {
    const proxy = createProxy();
    await proxy.requestAbsolute('https://ext.com/api', {
      method: 'POST',
      body: { foo: 'bar' },
    });
    const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[1].body).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('request() still prepends baseUrl', async () => {
    const proxy = createProxy();
    await proxy.request('/test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/test',
      expect.anything(),
    );
  });
});
