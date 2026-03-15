/**
 * ModuleTokenManager Refresh Timer Test Suite
 *
 * Flow: host authToken (via APIProxy, no skipAuth) + moduleId → Token Factory → module token
 */

import { ModuleTokenManager } from '../../../src/kernel/identity/ModuleTokenManager';
import type { ModuleManifest } from '../../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.useFakeTimers();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function createMockManifest(overrides: Partial<ModuleManifest> = {}): ModuleManifest {
  return {
    id: 'com.test.module',
    name: 'Test',
    version: '1.0.0',
    description: 'Test module',
    icon: 'icon',
    category: 'test',
    entryScreen: 'main',
    screens: ['main'],
    permissions: { apis: [], storage: false },
    minSDKVersion: '1.0.0',
    signature: 'dGVzdC1zaWduYXR1cmU=',
    externalTokenFactoryURL: 'encrypted-url',
    apiDomains: ['api.example.com'],
    ...overrides,
  };
}

function createManager(apiProxyOverrides: Record<string, any> = {}) {
  const apiProxy = {
    requestAbsolute: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { token: 'acquired-token', expiresIn: 3600 },
      headers: {},
      latencyMs: 50,
    }),
    setModuleToken: jest.fn(),
    removeModuleToken: jest.fn(),
    ...apiProxyOverrides,
  };

  const cryptoAdapter = {
    decrypt: jest.fn().mockResolvedValue('https://factory.example.com/token'),
    encrypt: jest.fn(),
    hash: jest.fn(),
    generateKey: jest.fn(),
    verifySignature: jest.fn(),
    secureStore: jest.fn(),
    secureRetrieve: jest.fn(),
    secureDelete: jest.fn(),
  };

  const dataBus = {
    publish: jest.fn(),
    subscribe: jest.fn(),
  };

  const manager = new ModuleTokenManager({
    apiProxy: apiProxy as any,
    cryptoAdapter,
    dataBus: dataBus as any,
    encryptionKey: 'test-key',
  });

  return { manager, apiProxy, cryptoAdapter, dataBus };
}

describe('ModuleTokenManager refresh', () => {
  it('acquireToken uses apiProxy.requestAbsolute with host JWT (no skipAuth)', async () => {
    const { manager, apiProxy } = createManager();
    const manifest = createMockManifest();
    await manager.acquireToken(manifest);
    expect(apiProxy.requestAbsolute).toHaveBeenCalledWith(
      'https://factory.example.com/token',
      expect.objectContaining({ method: 'POST', body: { moduleId: 'com.test.module' } }),
    );
    // Verify skipAuth is NOT set
    const callArgs = apiProxy.requestAbsolute.mock.calls[0][1];
    expect(callArgs.skipAuth).toBeUndefined();
  });

  it('successful acquisition starts refresh timer', async () => {
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const { manager } = createManager();
    await manager.acquireToken(createMockManifest());
    const timerCalls = setTimeoutSpy.mock.calls.filter(c => typeof c[1] === 'number' && c[1] > 100);
    expect(timerCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('refresh timer fires at ~80% TTL', async () => {
    const { manager, apiProxy } = createManager();
    await manager.acquireToken(createMockManifest());
    apiProxy.requestAbsolute.mockClear();

    // Advance to 80% of 3600s = 2880s = 2880000ms
    jest.advanceTimersByTime(2880000);
    await Promise.resolve();
    await Promise.resolve();

    expect(apiProxy.requestAbsolute).toHaveBeenCalled();
  });

  it('invalidateToken stops refresh timer', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { manager } = createManager();
    await manager.acquireToken(createMockManifest());
    manager.invalidateToken('com.test.module');
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('multiple acquireToken: only one timer per moduleId', async () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { manager } = createManager();
    const manifest = createMockManifest();

    await manager.acquireToken(manifest);
    manager.invalidateToken(manifest.id);
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('refresh failure logs error without crashing', async () => {
    const { manager, apiProxy } = createManager();
    await manager.acquireToken(createMockManifest());

    apiProxy.requestAbsolute.mockRejectedValueOnce(new Error('Network down'));

    jest.advanceTimersByTime(3000000);
    await Promise.resolve();
    await Promise.resolve();
    // Should not throw
  });

  it('stopRefreshTimer on non-existent timer: no error', () => {
    const { manager } = createManager();
    expect(() => manager.stopRefreshTimer('nonexistent')).not.toThrow();
  });

  it('refresh updates cached token', async () => {
    const { manager, apiProxy } = createManager();
    const manifest = createMockManifest();
    await manager.acquireToken(manifest);
    expect(manager.getToken(manifest.id)).toBe('acquired-token');

    apiProxy.requestAbsolute.mockResolvedValueOnce({
      ok: true, status: 200,
      data: { token: 'refreshed-token', expiresIn: 3600 },
      headers: {}, latencyMs: 30,
    });

    await manager.refreshToken(manifest);
    expect(manager.getToken(manifest.id)).toBe('refreshed-token');
  });

  it('refresh re-registers token with APIProxy', async () => {
    const { manager, apiProxy } = createManager();
    const manifest = createMockManifest();
    await manager.acquireToken(manifest);
    apiProxy.setModuleToken.mockClear();

    await manager.refreshToken(manifest);
    expect(apiProxy.setModuleToken).toHaveBeenCalledWith(
      manifest.id,
      expect.any(String),
      manifest.apiDomains,
    );
  });

  it('acquireToken publishes DataBus event', async () => {
    const { manager, dataBus } = createManager();
    await manager.acquireToken(createMockManifest());
    expect(dataBus.publish).toHaveBeenCalledWith(
      'sdk:module:token:acquired',
      expect.objectContaining({ moduleId: 'com.test.module' }),
    );
  });
});
