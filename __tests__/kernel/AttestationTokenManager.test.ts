/**
 * AttestationTokenManager Test Suite
 *
 * Tests device attestation token acquisition, caching, retry logic,
 * cache invalidation, and DataBus event publication.
 */

import { AttestationTokenManager } from '../../src/kernel/identity/AttestationTokenManager';

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
function createMocks() {
  const mockCryptoAdapter = {
    generateKey: jest.fn().mockResolvedValue('unique-nonce-123'),
    hash: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    verifySignature: jest.fn(),
    secureStore: jest.fn(),
    secureRetrieve: jest.fn(),
    secureDelete: jest.fn(),
  };

  const mockDeviceIntegrity = {
    attestDevice: jest.fn().mockResolvedValue('mock-attestation-blob'),
    verifyAttestation: jest.fn().mockResolvedValue(true),
  };

  const mockBridgeAdapter = {
    getNativeModule: jest.fn().mockReturnValue(mockDeviceIntegrity),
  };

  const mockApiProxy = {
    request: jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { token: 'external-api-token-xyz', expiresIn: 3600 },
      headers: {},
      latencyMs: 150,
    }),
  };

  const mockDataBus = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };

  return { mockCryptoAdapter, mockDeviceIntegrity, mockBridgeAdapter, mockApiProxy, mockDataBus };
}
function createManager(overrides: any = {}) {
  const mocks = createMocks();
  const attestationConfig = overrides.attestationConfig ?? {};
  const manager = new AttestationTokenManager({
    bridgeAdapter: overrides.bridgeAdapter ?? mocks.mockBridgeAdapter as any,
    apiProxy: overrides.apiProxy ?? mocks.mockApiProxy as any,
    cryptoAdapter: overrides.cryptoAdapter ?? mocks.mockCryptoAdapter as any,
    dataBus: overrides.dataBus ?? mocks.mockDataBus as any,
    attestation: {
      apiUrl: overrides.attestationApiUrl ?? '/api/attestation/token',
      ...attestationConfig,
    },
  });
  return { manager, ...mocks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttestationTokenManager', () => {
  describe('getExternalAPIToken', () => {
    it('full flow: nonce, attestDevice, exchange, returns token', async () => {
      const { manager, mockCryptoAdapter, mockDeviceIntegrity, mockApiProxy } = createManager();
      const token = await manager.getExternalAPIToken({ scope: 'billing-api' });
      expect(token).toBe('external-api-token-xyz');
      expect(mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(1);
      expect(mockDeviceIntegrity.attestDevice).toHaveBeenCalledWith('unique-nonce-123');
      expect(mockApiProxy.request).toHaveBeenCalledWith(
        '/api/attestation/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ scope: 'billing-api', nonce: 'unique-nonce-123' }),
        }),
      );
    });

    it('caches token and returns from cache on second call', async () => {
      const { manager, mockCryptoAdapter } = createManager();
      const token1 = await manager.getExternalAPIToken({ scope: 'billing-api' });
      const token2 = await manager.getExternalAPIToken({ scope: 'billing-api' });
      expect(token1).toBe(token2);
      expect(mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(1);
    });
    it('cache miss when expired - re-attests', async () => {
      const mocks = createMocks();
      // Return no expiresIn so tokenTTL is used
      mocks.mockApiProxy.request.mockResolvedValue({
        ok: true, status: 200,
        data: { token: 'tok' },
        headers: {}, latencyMs: 50,
      });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { tokenTTL: 0.001 },
      });
      await manager.getExternalAPIToken({ scope: 's1' });
      await new Promise(r => setTimeout(r, 10));
      await manager.getExternalAPIToken({ scope: 's1' });
      expect(mocks.mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(2);
    });

    it('forceRefresh bypasses cache', async () => {
      const { manager, mockCryptoAdapter } = createManager();
      await manager.getExternalAPIToken({ scope: 's1' });
      await manager.getExternalAPIToken({ scope: 's1', forceRefresh: true });
      expect(mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(2);
    });

    it('retries on attestation failure', async () => {
      const mocks = createMocks();
      mocks.mockDeviceIntegrity.attestDevice
        .mockRejectedValueOnce(new Error('attest fail'))
        .mockResolvedValue('mock-attestation-blob');
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 3, timeout: 100 },
      });
      const token = await manager.getExternalAPIToken({ scope: 's1' });
      expect(token).toBe('external-api-token-xyz');
      expect(mocks.mockDeviceIntegrity.attestDevice).toHaveBeenCalledTimes(2);
    });
    it('throws after all retries exhausted', async () => {
      const mocks = createMocks();
      mocks.mockDeviceIntegrity.attestDevice.mockRejectedValue(new Error('permanent fail'));
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 2, timeout: 100 },
      });
      await expect(manager.getExternalAPIToken({ scope: 's1' })).rejects.toThrow('permanent fail');
    });

    it('publishes attestation:failed on failure', async () => {
      const mocks = createMocks();
      mocks.mockDeviceIntegrity.attestDevice.mockRejectedValue(new Error('fail'));
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 1, timeout: 100 },
      });
      await expect(manager.getExternalAPIToken({ scope: 's1' })).rejects.toThrow();
      expect(mocks.mockDataBus.publish).toHaveBeenCalledWith(
        'sdk:attestation:failed',
        expect.objectContaining({ scope: 's1' }),
      );
    });
    it('publishes attestation:success on success', async () => {
      const { manager, mockDataBus } = createManager();
      await manager.getExternalAPIToken({ scope: 's1', moduleId: 'mod1' });
      expect(mockDataBus.publish).toHaveBeenCalledWith(
        'sdk:attestation:success',
        expect.objectContaining({ scope: 's1', moduleId: 'mod1' }),
      );
    });

    it('each attestation uses unique nonce', async () => {
      let counter = 0;
      const mocks = createMocks();
      mocks.mockCryptoAdapter.generateKey.mockImplementation(async () => 'nonce-' + (++counter));
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
      });
      await manager.getExternalAPIToken({ scope: 's1' });
      await manager.getExternalAPIToken({ scope: 's2' });
      expect(mocks.mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(2);
      expect(mocks.mockDeviceIntegrity.attestDevice).toHaveBeenCalledWith('nonce-1');
      expect(mocks.mockDeviceIntegrity.attestDevice).toHaveBeenCalledWith('nonce-2');
    });
    it('backend exchange failure throws error', async () => {
      const mocks = createMocks();
      mocks.mockApiProxy.request.mockResolvedValue({ ok: false, status: 403, data: null, headers: {}, latencyMs: 50 });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 1, timeout: 100 },
      });
      await expect(manager.getExternalAPIToken({ scope: 's1' })).rejects.toThrow('Token exchange failed');
    });

    it('invalid token response (missing token field) throws error', async () => {
      const mocks = createMocks();
      mocks.mockApiProxy.request.mockResolvedValue({ ok: true, status: 200, data: { noToken: true }, headers: {}, latencyMs: 50 });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 1, timeout: 100 },
      });
      await expect(manager.getExternalAPIToken({ scope: 's1' })).rejects.toThrow('missing token field');
    });
    it('custom tokenTTL is respected', async () => {
      const mocks = createMocks();
      mocks.mockApiProxy.request.mockResolvedValue({ ok: true, status: 200, data: { token: 'tok' }, headers: {}, latencyMs: 50 });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        attestationConfig: { tokenTTL: 60 },
      });
      await manager.getExternalAPIToken({ scope: 's1' });
      const stats = manager.getCacheStats();
      expect(stats.totalTokens).toBe(1);
      // Token should expire ~60s from now (60 * 1000 = 60000ms)
      const diff = stats.oldestToken! - Date.now();
      expect(diff).toBeLessThanOrEqual(60000);
      expect(diff).toBeGreaterThan(59000);
    });

    it('custom retryAttempts is respected', async () => {
      const mocks = createMocks();
      mocks.mockDeviceIntegrity.attestDevice.mockRejectedValue(new Error('fail'));
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
        dataBus: mocks.mockDataBus,
        attestationConfig: { retryAttempts: 2, timeout: 100 },
      });
      await expect(manager.getExternalAPIToken({ scope: 's1' })).rejects.toThrow();
      expect(mocks.mockDeviceIntegrity.attestDevice).toHaveBeenCalledTimes(2);
    });
    it('default config values work (no attestationConfig)', async () => {
      const { manager } = createManager();
      const token = await manager.getExternalAPIToken({ scope: 's1' });
      expect(token).toBe('external-api-token-xyz');
    });

    it('expiresIn from backend response overrides default TTL', async () => {
      const mocks = createMocks();
      mocks.mockApiProxy.request.mockResolvedValue({
        ok: true, status: 200,
        data: { token: 'tok', expiresIn: 120 },
        headers: {}, latencyMs: 50,
      });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
      });
      await manager.getExternalAPIToken({ scope: 's1' });
      const stats = manager.getCacheStats();
      // expiresIn=120 means 120*1000=120000ms from now
      const diff = stats.oldestToken! - Date.now();
      expect(diff).toBeLessThanOrEqual(120000);
      expect(diff).toBeGreaterThan(119000);
    });
  });
  describe('invalidateToken', () => {
    it('removes specific scope from cache', async () => {
      const { manager, mockCryptoAdapter } = createManager();
      await manager.getExternalAPIToken({ scope: 's1' });
      expect(manager.getCacheStats().totalTokens).toBe(1);
      manager.invalidateToken('s1');
      expect(manager.getCacheStats().totalTokens).toBe(0);
      // Next call should re-attest
      await manager.getExternalAPIToken({ scope: 's1' });
      expect(mockCryptoAdapter.generateKey).toHaveBeenCalledTimes(2);
    });

    it('non-existent scope is no-op', () => {
      const { manager } = createManager();
      expect(() => manager.invalidateToken('nonexistent')).not.toThrow();
    });
  });

  describe('invalidateAllTokens', () => {
    it('clears all cached tokens', async () => {
      const { manager } = createManager();
      await manager.getExternalAPIToken({ scope: 's1' });
      await manager.getExternalAPIToken({ scope: 's2' });
      expect(manager.getCacheStats().totalTokens).toBe(2);
      manager.invalidateAllTokens();
      expect(manager.getCacheStats().totalTokens).toBe(0);
    });
  });
  describe('getCacheStats', () => {
    it('returns correct totalTokens count', async () => {
      const { manager } = createManager();
      expect(manager.getCacheStats().totalTokens).toBe(0);
      await manager.getExternalAPIToken({ scope: 's1' });
      expect(manager.getCacheStats().totalTokens).toBe(1);
      await manager.getExternalAPIToken({ scope: 's2' });
      expect(manager.getCacheStats().totalTokens).toBe(2);
    });

    it('hitRate tracks correctly (hits / total)', async () => {
      const { manager } = createManager();
      // 1 miss (first call)
      await manager.getExternalAPIToken({ scope: 's1' });
      // 1 hit (cached)
      await manager.getExternalAPIToken({ scope: 's1' });
      // 1 hit (cached)
      await manager.getExternalAPIToken({ scope: 's1' });
      const stats = manager.getCacheStats();
      // 2 hits / 3 total = 0.666...
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('oldestToken returns earliest expiry', async () => {
      const mocks = createMocks();
      let callCount = 0;
      mocks.mockApiProxy.request.mockImplementation(async () => {
        callCount++;
        return {
          ok: true, status: 200,
          data: { token: 'tok' + callCount, expiresIn: callCount === 1 ? 60 : 3600 },
          headers: {}, latencyMs: 50,
        };
      });
      const { manager } = createManager({
        bridgeAdapter: mocks.mockBridgeAdapter,
        apiProxy: mocks.mockApiProxy,
        cryptoAdapter: mocks.mockCryptoAdapter,
      });
      await manager.getExternalAPIToken({ scope: 's1' });
      await manager.getExternalAPIToken({ scope: 's2' });
      const stats = manager.getCacheStats();
      // oldestToken should be the one with expiresIn=60 (earlier expiry)
      const diff = stats.oldestToken! - Date.now();
      expect(diff).toBeLessThanOrEqual(60000);
    });

    it('returns null oldestToken when cache empty', () => {
      const { manager } = createManager();
      expect(manager.getCacheStats().oldestToken).toBeNull();
    });

    it('hitRate is 0 when no calls made', () => {
      const { manager } = createManager();
      expect(manager.getCacheStats().hitRate).toBe(0);
    });
  });
});
