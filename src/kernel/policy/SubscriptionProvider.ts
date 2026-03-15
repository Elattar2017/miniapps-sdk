/**
 * Subscription Provider - Tier-based module access control
 * @module kernel/policy/SubscriptionProvider
 */

import { logger } from '../../utils/logger';
import { applyResponseMapping } from '../../utils/responseMapping';
import type { APIProxy } from '../network/APIProxy';
import type { DataBus } from '../communication/DataBus';
import type { TierConfig } from '../../types';

const CACHE_TTL = 300_000; // 5 minutes

export class SubscriptionProvider {
  private readonly log = logger.child({ component: 'SubscriptionProvider' });
  private readonly apiProxy: APIProxy;
  private readonly dataBus: DataBus | undefined;
  private readonly tierApiPath: string;
  private readonly responseMapping: Record<string, string> | undefined;
  private readonly cache = new Map<string, { config: TierConfig; loadedAt: number }>();

  constructor(
    apiProxy: APIProxy,
    dataBus?: DataBus,
    tierApiPath?: string,
    responseMapping?: Record<string, string>,
  ) {
    this.apiProxy = apiProxy;
    this.dataBus = dataBus;
    this.tierApiPath = tierApiPath ?? '/api/subscription/tiers/{tierId}';
    this.responseMapping = responseMapping;
  }

  async loadTierConfig(tierId: string): Promise<TierConfig> {
    const cached = this.cache.get(tierId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
      return cached.config;
    }

    try {
      const response = await this.apiProxy.request(
        this.tierApiPath.replace('{tierId}', tierId),
        {
          method: 'GET',
        },
      );

      if (response.ok && response.data) {
        const config = applyResponseMapping<TierConfig>(
          response.data as Record<string, unknown>,
          this.responseMapping,
        );
        this.cache.set(tierId, { config, loadedAt: Date.now() });

        this.dataBus?.publish('sdk:subscription:tier:loaded', { tierId });
        this.log.info('Tier config loaded', { tierId });
        return config;
      }

      throw new Error(`Failed to load tier config: ${response.status}`);
    } catch (err) {
      this.log.error('Failed to load tier config', {
        tierId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getModuleAccess(tierId: string, moduleId: string): Promise<boolean> {
    try {
      const config = await this.loadTierConfig(tierId);
      const allowed = config.modules.includes(moduleId) || config.modules.includes('*');

      if (!allowed) {
        this.dataBus?.publish('sdk:subscription:tier:accessDenied', { tierId, moduleId });
      }

      return allowed;
    } catch {
      return true;
    }
  }

  async getAccessibleModules(tierId: string): Promise<string[]> {
    try {
      const config = await this.loadTierConfig(tierId);
      return config.modules;
    } catch {
      return [];
    }
  }

  async checkFeatureFlag(tierId: string, flag: string): Promise<boolean> {
    try {
      const config = await this.loadTierConfig(tierId);
      return config.featureFlags[flag] ?? false;
    } catch {
      return false;
    }
  }

  async getQuota(tierId: string, quotaKey: string): Promise<number> {
    try {
      const config = await this.loadTierConfig(tierId);
      return (config.quotas as unknown as Record<string, number>)[quotaKey] ?? 0;
    } catch {
      return 0;
    }
  }

  async isTierUpgradeRequired(currentTier: string, moduleId: string): Promise<boolean> {
    try {
      const config = await this.loadTierConfig(currentTier);
      return !config.modules.includes(moduleId) && !config.modules.includes('*');
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
