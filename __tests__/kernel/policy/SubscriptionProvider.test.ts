/**
 * SubscriptionProvider Test Suite
 */

jest.mock('react-native');

import { SubscriptionProvider } from '../../../src/kernel/policy/SubscriptionProvider';

const GOLD_TIER = {
  tierId: 'gold', name: 'Gold Plan', tier: 3,
  modules: ['mod-a', 'mod-b', 'mod-c'],
  featureFlags: { premium: true, offline: true, beta: false },
  quotas: { apiCallsPerHour: 1000, storageBytes: 1048576, maxModules: 10 },
};

const WILDCARD_TIER = {
  tierId: 'enterprise', name: 'Enterprise', tier: 4,
  modules: ['*'],
  featureFlags: { premium: true, offline: true, beta: true },
  quotas: { apiCallsPerHour: 10000, storageBytes: 10485760, maxModules: 100 },
};

function createMockAPIProxy(tierData: any = GOLD_TIER) {
  return {
    request: jest.fn().mockResolvedValue({
      ok: true, status: 200, data: tierData, headers: {}, latencyMs: 50,
    }),
    updateAuthToken: jest.fn(),
  };
}

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

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

describe('SubscriptionProvider', () => {
  describe('loadTierConfig', () => {
    it('fetches from backend and caches', async () => {
      const api = createMockAPIProxy();
      const provider = new SubscriptionProvider(api as any);
      const config = await provider.loadTierConfig('gold');
      expect(config.tierId).toBe('gold');
      expect(api.request).toHaveBeenCalledTimes(1);
    });

    it('returns cached without API call', async () => {
      const api = createMockAPIProxy();
      const provider = new SubscriptionProvider(api as any);
      await provider.loadTierConfig('gold');
      await provider.loadTierConfig('gold');
      expect(api.request).toHaveBeenCalledTimes(1);
    });

    it('re-fetches when cache expired', async () => {
      const api = createMockAPIProxy();
      const provider = new SubscriptionProvider(api as any);
      await provider.loadTierConfig('gold');
      // Simulate cache expiry by clearing
      provider.clearCache();
      await provider.loadTierConfig('gold');
      expect(api.request).toHaveBeenCalledTimes(2);
    });

    it('uses custom tierApiPath', async () => {
      const api = createMockAPIProxy();
      const provider = new SubscriptionProvider(api as any, undefined, '/api/telecom/plans/{tierId}');
      await provider.loadTierConfig('gold');
      expect(api.request).toHaveBeenCalledWith('/api/telecom/plans/gold', expect.any(Object));
    });

    it('applies responseMapping to API response', async () => {
      const api = createMockAPIProxy({ planId: 'gold', name: 'Gold', tier: 3, modules: ['*'], featureFlags: {}, quotas: { apiCallsPerHour: 100, storageBytes: 100, maxModules: 5 } });
      const provider = new SubscriptionProvider(api as any, undefined, undefined, { planId: 'tierId' });
      const config = await provider.loadTierConfig('gold');
      expect(config.tierId).toBe('gold');
    });
  });

  describe('getModuleAccess', () => {
    it('returns true for allowed module', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.getModuleAccess('gold', 'mod-a')).toBe(true);
    });

    it('returns false for denied module', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.getModuleAccess('gold', 'mod-x')).toBe(false);
    });

    it('returns true for wildcard modules', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy(WILDCARD_TIER) as any);
      expect(await provider.getModuleAccess('enterprise', 'anything')).toBe(true);
    });

    it('returns true on API error (fail open)', async () => {
      const api = createMockAPIProxy();
      api.request.mockRejectedValue(new Error('API down'));
      const provider = new SubscriptionProvider(api as any);
      expect(await provider.getModuleAccess('gold', 'mod-x')).toBe(true);
    });
  });

  describe('getAccessibleModules', () => {
    it('returns module list', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      const mods = await provider.getAccessibleModules('gold');
      expect(mods).toEqual(['mod-a', 'mod-b', 'mod-c']);
    });

    it('returns empty on error', async () => {
      const api = createMockAPIProxy();
      api.request.mockRejectedValue(new Error('fail'));
      const provider = new SubscriptionProvider(api as any);
      expect(await provider.getAccessibleModules('gold')).toEqual([]);
    });
  });

  describe('checkFeatureFlag', () => {
    it('returns true for enabled flag', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.checkFeatureFlag('gold', 'premium')).toBe(true);
    });

    it('returns false for disabled/missing flag', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.checkFeatureFlag('gold', 'beta')).toBe(false);
      expect(await provider.checkFeatureFlag('gold', 'nonexistent')).toBe(false);
    });
  });

  describe('getQuota', () => {
    it('returns quota value', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.getQuota('gold', 'apiCallsPerHour')).toBe(1000);
    });

    it('returns 0 for missing key', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.getQuota('gold', 'nonexistent')).toBe(0);
    });
  });

  describe('isTierUpgradeRequired', () => {
    it('returns true when module not in tier', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.isTierUpgradeRequired('gold', 'mod-x')).toBe(true);
    });

    it('returns false when module in tier', async () => {
      const provider = new SubscriptionProvider(createMockAPIProxy() as any);
      expect(await provider.isTierUpgradeRequired('gold', 'mod-a')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('clears the internal cache', async () => {
      const api = createMockAPIProxy();
      const provider = new SubscriptionProvider(api as any);
      await provider.loadTierConfig('gold');
      provider.clearCache();
      await provider.loadTierConfig('gold');
      expect(api.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('DataBus events', () => {
    it('publishes subscription:tier:loaded event', async () => {
      const dataBus = createMockDataBus();
      const provider = new SubscriptionProvider(createMockAPIProxy() as any, dataBus as any);
      await provider.loadTierConfig('gold');
      expect(dataBus.publish).toHaveBeenCalledWith('sdk:subscription:tier:loaded', { tierId: 'gold' });
    });

    it('publishes subscription:tier:accessDenied event', async () => {
      const dataBus = createMockDataBus();
      const provider = new SubscriptionProvider(createMockAPIProxy() as any, dataBus as any);
      await provider.getModuleAccess('gold', 'mod-x');
      expect(dataBus.publish).toHaveBeenCalledWith('sdk:subscription:tier:accessDenied', { tierId: 'gold', moduleId: 'mod-x' });
    });
  });
});
