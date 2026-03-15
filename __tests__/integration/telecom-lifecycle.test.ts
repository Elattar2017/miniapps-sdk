/**
 * Telecom Lifecycle Integration Tests
 *
 * Tests telecom subsystem integration: AccountIdentifierManager, SubscriptionProvider,
 * AttestationTokenManager with mocked dependencies.
 */

jest.mock('react-native');

import { AccountIdentifierManager } from '../../src/kernel/identity/AccountIdentifierManager';
import { SubscriptionProvider } from '../../src/kernel/policy/SubscriptionProvider';
import { AttestationTokenManager } from '../../src/kernel/identity/AttestationTokenManager';
import { DataBus } from '../../src/kernel/communication/DataBus';
import type { ICryptoAdapter } from '../../src/types';

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
// Shared helpers
// ---------------------------------------------------------------------------

function createMockCryptoAdapter(stored: Record<string, string> = {}): ICryptoAdapter {
  const storage: Record<string, string> = { ...stored };
  return {
    hash: jest.fn().mockResolvedValue('hashed'),
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('decrypted'),
    generateKey: jest.fn().mockResolvedValue('unique-nonce'),
    verifySignature: jest.fn().mockResolvedValue(true),
    secureStore: jest.fn(async (key: string, value: string) => { storage[key] = value; }),
    secureRetrieve: jest.fn(async (key: string) => storage[key] ?? null),
    secureDelete: jest.fn(async (key: string) => { delete storage[key]; }),
  };
}

const GOLD_TIER = {
  tierId: 'gold',
  name: 'Gold Plan',
  tier: 3,
  modules: ['mod-billing', 'mod-usage', 'mod-support'],
  featureFlags: { premium: true, offline: true, beta: false },
  quotas: { apiCallsPerHour: 1000, storageBytes: 1048576, maxModules: 10 },
};

const PREPAID_TIER = {
  tierId: 'prepaid',
  name: 'Prepaid Plan',
  tier: 1,
  modules: ['mod-balance'],
  featureFlags: { premium: false, offline: false, beta: false },
  quotas: { apiCallsPerHour: 100, storageBytes: 102400, maxModules: 3 },
};

function createMockAPIProxy(tierData: unknown = GOLD_TIER) {
  return {
    request: jest.fn().mockImplementation(async (path: string) => {
      if (path.includes('/accounts/validate')) {
        return {
          ok: true, status: 200,
          data: { valid: true, active: true, tier: 'gold', isPrimary: true },
          headers: {}, latencyMs: 50,
        };
      }
      if (path.includes('/subscription/tiers/')) {
        return { ok: true, status: 200, data: tierData, headers: {}, latencyMs: 50 };
      }
      if (path.includes('/accounts/identifiers')) {
        return {
          ok: true, status: 200,
          data: [
            { identifier: '0501234567', isPrimary: true, tier: 'gold', active: true },
            { identifier: '0559876543', isPrimary: false, tier: 'prepaid', active: true },
          ],
          headers: {}, latencyMs: 50,
        };
      }
      if (path.includes('/attestation')) {
        return {
          ok: true, status: 200,
          data: { token: 'ext-api-token-xyz', expiresIn: 3600 },
          headers: {}, latencyMs: 150,
        };
      }
      return { ok: true, status: 200, data: null, headers: {}, latencyMs: 50 };
    }),
    updateAuthToken: jest.fn(),
  };
}

function createMockBridgeAdapter() {
  const mockDeviceIntegrity = {
    attestDevice: jest.fn().mockResolvedValue('mock-attestation-blob'),
    verifyAttestation: jest.fn().mockResolvedValue(true),
  };
  return {
    getNativeModule: jest.fn().mockReturnValue(mockDeviceIntegrity),
    _deviceIntegrity: mockDeviceIntegrity,
  };
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('Telecom Lifecycle Integration', () => {
  it('AccountIdentifierManager + SubscriptionProvider: set identifier, check tier access', async () => {
    const dataBus = new DataBus();
    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();

    const identifierManager = new AccountIdentifierManager(
      crypto,
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      dataBus,
    );
    const subscriptionProvider = new SubscriptionProvider(
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      dataBus,
    );

    // Set identifier
    await identifierManager.updateIdentifier('0501234567');
    const activeId = await identifierManager.getActiveIdentifier();
    expect(activeId).toBe('0501234567');

    // Check tier access for gold tier
    const hasBilling = await subscriptionProvider.getModuleAccess('gold', 'mod-billing');
    expect(hasBilling).toBe(true);

    const hasAdmin = await subscriptionProvider.getModuleAccess('gold', 'mod-admin');
    expect(hasAdmin).toBe(false);
  });

  it('AttestationTokenManager with mocked BridgeAdapter: full attestation flow', async () => {
    const dataBus = new DataBus();
    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();
    const bridgeAdapter = createMockBridgeAdapter();

    const attestation = new AttestationTokenManager({
      bridgeAdapter: bridgeAdapter as unknown as Parameters<typeof AttestationTokenManager.prototype.getExternalAPIToken>[0] extends never ? never : unknown as never,
      apiProxy: apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      cryptoAdapter: crypto,
      dataBus,
      attestation: { apiUrl: '/api/attestation/token' },
    });

    const token = await attestation.getExternalAPIToken({ scope: 'billing-api' });

    expect(token).toBe('ext-api-token-xyz');
    expect(crypto.generateKey).toHaveBeenCalled();
    expect(bridgeAdapter._deviceIntegrity.attestDevice).toHaveBeenCalled();
    expect(apiProxy.request).toHaveBeenCalledWith(
      '/api/attestation/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('tier-based filtering: subscription checks module access based on tier', async () => {
    const apiProxy = createMockAPIProxy();
    // Override for prepaid tier
    apiProxy.request.mockImplementation(async (path: string) => {
      if (path.includes('/subscription/tiers/prepaid')) {
        return { ok: true, status: 200, data: PREPAID_TIER, headers: {}, latencyMs: 50 };
      }
      if (path.includes('/subscription/tiers/gold')) {
        return { ok: true, status: 200, data: GOLD_TIER, headers: {}, latencyMs: 50 };
      }
      return { ok: true, status: 200, data: null, headers: {}, latencyMs: 50 };
    });

    const subscriptionProvider = new SubscriptionProvider(
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
    );

    // Gold tier has mod-billing
    expect(await subscriptionProvider.getModuleAccess('gold', 'mod-billing')).toBe(true);
    // Prepaid tier does NOT have mod-billing
    expect(await subscriptionProvider.getModuleAccess('prepaid', 'mod-billing')).toBe(false);
    // Prepaid tier has mod-balance
    expect(await subscriptionProvider.getModuleAccess('prepaid', 'mod-balance')).toBe(true);
  });

  it('identifier change triggers DataBus event', async () => {
    const dataBus = new DataBus();
    const events: unknown[] = [];
    dataBus.subscribe('sdk:account:identifier:changed', (data) => {
      events.push(data);
    });

    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();
    const identifierManager = new AccountIdentifierManager(
      crypto,
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      dataBus,
    );

    await identifierManager.updateIdentifier('0501234567');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      newIdentifier: expect.any(String),
    }));
  });

  it('token cache hit: second getExternalAPIToken call returns cached', async () => {
    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();
    const bridgeAdapter = createMockBridgeAdapter();

    const attestation = new AttestationTokenManager({
      bridgeAdapter: bridgeAdapter as unknown as never,
      apiProxy: apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      cryptoAdapter: crypto,
      attestation: { apiUrl: '/api/attestation/token' },
    });

    const token1 = await attestation.getExternalAPIToken({ scope: 'billing-api' });
    const token2 = await attestation.getExternalAPIToken({ scope: 'billing-api' });

    expect(token1).toBe(token2);
    // generateKey called only once (second call is cached)
    expect(crypto.generateKey).toHaveBeenCalledTimes(1);
  });

  it('subscription tier cache: second access check uses cached result', async () => {
    const apiProxy = createMockAPIProxy();
    const subscriptionProvider = new SubscriptionProvider(
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
    );

    await subscriptionProvider.getModuleAccess('gold', 'mod-billing');
    await subscriptionProvider.getModuleAccess('gold', 'mod-usage');

    // Only one API call for the tier config (second call uses cache)
    const tierCalls = apiProxy.request.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('/subscription/tiers/'),
    );
    expect(tierCalls).toHaveLength(1);
  });

  it('masked identifier in DataBus events (middle digits masked)', async () => {
    const dataBus = new DataBus();
    const events: unknown[] = [];
    dataBus.subscribe('sdk:account:identifier:changed', (data) => {
      events.push(data);
    });

    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();
    const identifierManager = new AccountIdentifierManager(
      crypto,
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
      dataBus,
    );

    await identifierManager.updateIdentifier('0501234567');

    const event = events[0] as { newIdentifier: string };
    // The masked identifier should contain asterisks
    expect(event.newIdentifier).toContain('*');
    // The last 3 digits should be visible
    expect(event.newIdentifier).toMatch(/567$/);
  });

  it('multiple identifiers: getAllIdentifiers returns array', async () => {
    const crypto = createMockCryptoAdapter();
    const apiProxy = createMockAPIProxy();
    const identifierManager = new AccountIdentifierManager(
      crypto,
      apiProxy as unknown as import('../../src/kernel/network/APIProxy').APIProxy,
    );

    const identifiers = await identifierManager.getAllIdentifiers();
    expect(identifiers).toHaveLength(2);
    expect(identifiers[0].identifier).toBe('0501234567');
    expect(identifiers[1].identifier).toBe('0559876543');
  });
});
