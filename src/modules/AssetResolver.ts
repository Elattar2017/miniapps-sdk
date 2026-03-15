/**
 * AssetResolver - Resolves asset:// protocol references to full URLs
 * and manages asset prefetching for offline use.
 * @module modules/AssetResolver
 *
 * Handles three reference formats:
 * - "asset://banner" → looks up in module's asset map → prepends apiBaseUrl
 * - "https://..." → returned as-is (external URL passthrough)
 * - "/uploads/..." → prepends apiBaseUrl
 */

import { logger } from '../utils/logger';
import type { ModuleCache } from './ModuleCache';

const ASSET_PROTOCOL = 'asset://';

export class AssetResolver {
  private readonly log = logger.child({ component: 'AssetResolver' });
  private readonly apiBaseUrl: string;
  private readonly cache: ModuleCache;
  /** moduleId → { logicalName → relative URL } */
  private readonly assetMaps = new Map<string, Record<string, string>>();

  constructor(apiBaseUrl: string, cache: ModuleCache) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.cache = cache;
    this.log.info('AssetResolver initialized', { apiBaseUrl: this.apiBaseUrl });
  }

  /**
   * Register a module's asset map (called when manifest is loaded).
   * @param moduleId Module identifier
   * @param assets Map of logicalName → relative URL from manifest.assets
   */
  registerModuleAssets(moduleId: string, assets: Record<string, string>): void {
    this.assetMaps.set(moduleId, { ...assets });
    this.log.debug('Registered module assets', {
      moduleId,
      count: Object.keys(assets).length,
    });
  }

  /**
   * Unregister a module's assets (called when module is unloaded).
   */
  unregisterModuleAssets(moduleId: string): void {
    this.assetMaps.delete(moduleId);
  }

  /**
   * Resolve an asset reference to a full URL.
   *
   * @param moduleId The module context for asset:// resolution
   * @param reference The reference string from the schema
   * @returns Full URL or null if unresolvable
   */
  resolveAssetUrl(moduleId: string, reference: string): string | null {
    if (!reference) return null;

    // asset://logicalName → lookup in module's asset map
    if (reference.startsWith(ASSET_PROTOCOL)) {
      const logicalName = reference.substring(ASSET_PROTOCOL.length);
      const assetMap = this.assetMaps.get(moduleId);
      if (!assetMap) {
        this.log.warn('No asset map for module', { moduleId, reference });
        return null;
      }
      const relativeUrl = assetMap[logicalName];
      if (!relativeUrl) {
        this.log.warn('Asset not found in module map', { moduleId, logicalName });
        return null;
      }
      return `${this.apiBaseUrl}${relativeUrl}`;
    }

    // Absolute URL — passthrough
    if (reference.startsWith('http://') || reference.startsWith('https://')) {
      return reference;
    }

    // Relative /uploads/ path — prepend base URL
    if (reference.startsWith('/uploads/')) {
      return `${this.apiBaseUrl}${reference}`;
    }

    // Unknown format — return as-is
    return reference;
  }

  /**
   * Check if a module has registered assets.
   */
  hasModuleAssets(moduleId: string): boolean {
    return this.assetMaps.has(moduleId);
  }

  /**
   * Get all logical names for a module's assets.
   */
  getAssetNames(moduleId: string): string[] {
    const map = this.assetMaps.get(moduleId);
    return map ? Object.keys(map) : [];
  }

  /**
   * Pre-fetch all assets for a module into the cache for offline use.
   * Uses the ModuleCache 'asset' tier.
   * Non-blocking — failures are logged but don't throw.
   */
  async prefetchModuleAssets(moduleId: string): Promise<void> {
    const assetMap = this.assetMaps.get(moduleId);
    if (!assetMap) return;

    const entries = Object.entries(assetMap);
    if (entries.length === 0) return;

    this.log.info('Prefetching module assets', { moduleId, count: entries.length });

    const results = await Promise.allSettled(
      entries.map(async ([logicalName, relativeUrl]) => {
        const cacheKey = `asset:${moduleId}:${logicalName}`;

        // Skip if already cached
        const cached = this.cache.get(cacheKey, 'asset');
        if (cached) return;

        const fullUrl = `${this.apiBaseUrl}${relativeUrl}`;
        try {
          const response = await fetch(fullUrl);
          if (response.ok) {
            // Cache the URL as resolved — the actual binary caching
            // is handled by the platform's image caching (RN Image)
            this.cache.set(cacheKey, { url: fullUrl, prefetched: true }, 'asset');
          }
        } catch (err) {
          this.log.debug('Asset prefetch failed', {
            moduleId,
            logicalName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    this.log.info('Asset prefetch complete', { moduleId, succeeded, total: entries.length });
  }
}
