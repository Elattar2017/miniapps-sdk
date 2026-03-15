/**
 * Module Loader - Fetches, verifies, and caches module manifests and screens
 * @module modules/ModuleLoader
 *
 * Workflow:
 * 1. Check cache for manifest
 * 2. If not cached, fetch from API (apiBaseUrl/api/modules/:id/manifest)
 * 3. Verify PKI signature (Phase 1: mock pass-through)
 * 4. Cache the manifest
 * 5. Fetch individual screens on demand
 *
 * All network requests flow through an optional CircuitBreaker to prevent
 * cascading failures when the module server is unavailable. Performance is
 * tracked against the budgets defined in constants/performance-budgets.
 */

import { logger } from '../utils/logger';
import { timer } from '../utils/timer';
import { isValidModuleId } from '../utils/validation';
import { DEFAULT_TIMEOUTS } from '../constants/defaults';
import { SDKError } from '../kernel/errors/SDKError';
import { PKIVerifier } from '../kernel/identity/PKIVerifier';
import type { PKIVerifierConfig } from '../kernel/identity/PKIVerifier';
import { ModuleCache } from './ModuleCache';
import type { CircuitBreaker } from '../kernel/errors/CircuitBreaker';
import type { ModuleManifest, ModuleSummary, ScreenSchema } from '../types';
import type { ModuleTokenManager } from '../kernel/identity/ModuleTokenManager';
import type { AssetResolver } from './AssetResolver';

/** Default manifest cache TTL: 4 hours in seconds */
const MANIFEST_CACHE_TTL_BASE = 4 * 60 * 60;
/** Maximum jitter added to manifest cache TTL: 60 minutes in seconds */
const MANIFEST_CACHE_TTL_JITTER_MAX = 60 * 60;

export class ModuleLoader {
  private readonly log = logger.child({ component: 'ModuleLoader' });
  private readonly apiBaseUrl: string;
  private readonly cache: ModuleCache;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly moduleTokenManager?: ModuleTokenManager;
  private readonly pkiConfig?: PKIVerifierConfig;
  private readonly assetResolver?: AssetResolver;

  /**
   * @param apiBaseUrl     Base URL of the module API server (no trailing slash)
   * @param cache          ModuleCache instance for manifest / screen caching
   * @param circuitBreaker Optional CircuitBreaker to wrap network calls
   * @param moduleTokenManager Optional ModuleTokenManager for per-module tokens
   * @param pkiConfig      Optional PKI config with CryptoAdapter + public key for real signature verification
   */
  constructor(apiBaseUrl: string, cache: ModuleCache, circuitBreaker?: CircuitBreaker, moduleTokenManager?: ModuleTokenManager, pkiConfig?: PKIVerifierConfig, assetResolver?: AssetResolver) {
    // Strip trailing slash for consistent URL construction
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.cache = cache;
    this.circuitBreaker = circuitBreaker;
    this.moduleTokenManager = moduleTokenManager;
    this.pkiConfig = pkiConfig;
    this.assetResolver = assetResolver;
    this.log.info('ModuleLoader initialized', {
      apiBaseUrl: this.apiBaseUrl,
      hasPKI: !!(pkiConfig?.cryptoAdapter && pkiConfig?.publicKey),
    });
  }

  /**
   * Compute a manifest cache TTL with jitter to prevent thundering herd.
   * Returns TTL in seconds: 4h base + random 0-60min jitter.
   */
  private getManifestCacheTTL(): number {
    return MANIFEST_CACHE_TTL_BASE + Math.floor(Math.random() * MANIFEST_CACHE_TTL_JITTER_MAX);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load a module manifest by ID.
   *
   * Returns the cached manifest when available. Otherwise fetches from the
   * API, verifies the PKI signature, caches the result, and returns it.
   * The operation is timed against MODULE_LOAD_CACHED_MS (cache hit) or
   * MODULE_LOAD_NETWORK_MS (network fetch).
   *
   * @param moduleId  Reverse-domain module identifier (e.g. "com.vendor.budget")
   * @returns The verified ModuleManifest
   * @throws SDKError on invalid ID, network failure, or signature failure
   */
  async loadManifest(moduleId: string): Promise<ModuleManifest> {
    if (!isValidModuleId(moduleId)) {
      throw SDKError.module(`Invalid module ID: ${moduleId}`, {
        context: { moduleId },
      });
    }

    const cacheKey = `manifest:${moduleId}`;
    const timerLabel = `loadManifest:${moduleId}`;

    // 1. Check cache
    timer.start(timerLabel);
    const cached = this.cache.get(cacheKey, 'manifest') as ModuleManifest | undefined;
    if (cached) {
      timer.endWithBudget(timerLabel, 'MODULE_LOAD_CACHED_MS');
      this.log.debug('Manifest loaded from cache', { moduleId });
      return cached;
    }

    // 2. Fetch from API
    this.log.info('Fetching manifest from network', { moduleId });
    const url = `${this.apiBaseUrl}/api/modules/${moduleId}/manifest`;

    try {
      const manifest = await this.executeWithCircuitBreaker<ModuleManifest>(async () => {
        const response = await this.fetchWithTimeout(url, DEFAULT_TIMEOUTS.MODULE_FETCH);

        if (response.status === 410) {
          throw SDKError.module(
            'Module blocked: signing certificate revoked for security reasons',
            { context: { moduleId, status: 410, url, reason: 'CERT_REVOKED' } },
          );
        }

        if (!response.ok) {
          throw SDKError.module(
            `Failed to fetch manifest: HTTP ${response.status}`,
            { context: { moduleId, status: response.status, url } },
          );
        }

        return response.json() as Promise<ModuleManifest>;
      });

      // 3. Check for server-side certificate status (OCSP stapling)
      if (manifest.certStatus) {
        this.log.info('Module certificate status (stapled)', {
          moduleId,
          certStatus: manifest.certStatus,
          signingCertFingerprint: manifest.signingCertFingerprint,
        });
      }

      // 4. Verify signature (Phase 1 mock)
      const signatureValid = await this.verifySignature(manifest);
      if (!signatureValid) {
        throw SDKError.module('Module signature verification failed', {
          context: { moduleId },
        });
      }

      // 5. Cache the manifest with TTL + jitter (prevents thundering herd)
      this.cache.set(cacheKey, manifest, 'manifest', this.getManifestCacheTTL());

      // Acquire module token if manifest declares a factory URL + API domains
      if (this.moduleTokenManager && manifest.externalTokenFactoryURL) {
        try {
          const tokenResult = await this.moduleTokenManager.acquireToken(manifest);
          if (!tokenResult.acquired) {
            this.log.warn('Module token acquisition failed', {
              moduleId,
              error: tokenResult.error,
            });
          }
        } catch (err) {
          this.log.warn('Module token acquisition error', {
            moduleId,
            error: err instanceof Error ? err.message : String(err),
          });
          // Non-fatal: module loads but will not have external API token
        }
      }

      // Register module assets for asset:// resolution and prefetch
      if (manifest.assets && this.assetResolver) {
        this.assetResolver.registerModuleAssets(moduleId, manifest.assets);
        this.assetResolver.prefetchModuleAssets(moduleId).catch(() => {});
      }

      const duration = timer.endWithBudget(timerLabel, 'MODULE_LOAD_NETWORK_MS');
      this.log.info('Manifest loaded from network', { moduleId, duration });

      return manifest;
    } catch (error) {
      // Ensure the timer is cleaned up on failure
      if (timer.isRunning(timerLabel)) {
        timer.end(timerLabel);
      }

      if (error instanceof SDKError) throw error;

      throw SDKError.network(
        `Failed to load manifest for module "${moduleId}"`,
        {
          context: { moduleId, url },
          cause: error instanceof Error ? error : undefined,
        },
      );
    }
  }

  /**
   * Load a single screen schema for a module.
   *
   * Returns the cached schema when available, otherwise fetches from the
   * API and caches it.
   *
   * @param moduleId  Module identifier
   * @param screenId  Screen identifier within the module
   * @returns The ScreenSchema
   * @throws SDKError on network failure
   */
  async loadScreen(moduleId: string, screenId: string): Promise<ScreenSchema> {
    const cacheKey = `screen:${moduleId}:${screenId}`;
    const timerLabel = `loadScreen:${moduleId}:${screenId}`;

    // 1. Check cache
    timer.start(timerLabel);
    const cached = this.cache.get(cacheKey, 'schema') as ScreenSchema | undefined;
    if (cached) {
      timer.endWithBudget(timerLabel, 'MODULE_LOAD_CACHED_MS');
      this.log.debug('Screen loaded from cache', { moduleId, screenId });
      return cached;
    }

    // 2. Fetch from API
    const url = `${this.apiBaseUrl}/api/modules/${moduleId}/screens/${screenId}`;
    this.log.info('Fetching screen from network', { moduleId, screenId });

    try {
      const screen = await this.executeWithCircuitBreaker<ScreenSchema>(async () => {
        const response = await this.fetchWithTimeout(url, DEFAULT_TIMEOUTS.MODULE_FETCH);

        if (!response.ok) {
          throw SDKError.module(
            `Failed to fetch screen: HTTP ${response.status}`,
            { context: { moduleId, screenId, status: response.status, url } },
          );
        }

        return response.json() as Promise<ScreenSchema>;
      });

      // 3. Cache the screen schema
      this.cache.set(cacheKey, screen, 'schema');

      const duration = timer.endWithBudget(timerLabel, 'MODULE_LOAD_NETWORK_MS');
      this.log.debug('Screen loaded from network', { moduleId, screenId, duration });

      return screen;
    } catch (error) {
      if (timer.isRunning(timerLabel)) {
        timer.end(timerLabel);
      }

      if (error instanceof SDKError) throw error;

      throw SDKError.network(
        `Failed to load screen "${screenId}" for module "${moduleId}"`,
        {
          context: { moduleId, screenId, url },
          cause: error instanceof Error ? error : undefined,
        },
      );
    }
  }

  /**
   * Load the list of available modules from the API.
   *
   * This endpoint does not use caching because the list is expected to
   * change based on user entitlements and is called infrequently.
   *
   * @returns Array of ModuleSummary items for display in ActionZone
   * @throws SDKError on network failure
   */
  async loadModuleList(): Promise<ModuleSummary[]> {
    const url = `${this.apiBaseUrl}/api/modules`;
    this.log.info('Fetching module list');

    try {
      const modules = await this.executeWithCircuitBreaker<ModuleSummary[]>(async () => {
        const response = await this.fetchWithTimeout(url, DEFAULT_TIMEOUTS.MODULE_FETCH);

        if (!response.ok) {
          throw SDKError.module(
            `Failed to fetch module list: HTTP ${response.status}`,
            { context: { status: response.status, url } },
          );
        }

        const json = await response.json();

        // Support both flat array (module-server) and { data: [...] } (sdk-backend)
        const items: Record<string, unknown>[] = Array.isArray(json) ? json : (json.data ?? []);

        // Filter to published modules only (sdk-backend returns drafts too)
        const published = items.filter((m) => !m.status || m.status === 'published');

        // Normalize: sdk-backend uses moduleId, module-server uses id
        // Resolve relative icon paths against the API base URL
        const baseUrl = this.apiBaseUrl;
        return published.map((m) => {
          let icon = (m.icon ?? '') as string;
          if (icon && icon.startsWith('/')) {
            icon = `${baseUrl}${icon}`;
          }
          return {
            id: (m.moduleId ?? m.id) as string,
            name: m.name as string,
            icon,
            category: (m.category ?? '') as string,
            version: (m.version ?? '0.0.0') as string,
            description: (m.description ?? '') as string,
            requiredTiers: m.requiredTiers as string[] | undefined,
          };
        });
      });

      // Invalidate stale caches when a module's published version has changed
      for (const m of modules) {
        const cached = this.cache.get(`manifest:${m.id}`, 'manifest') as ModuleManifest | undefined;
        if (cached && cached.version !== m.version) {
          this.log.info('Module version changed, evicting stale cache', {
            moduleId: m.id,
            cachedVersion: cached.version,
            serverVersion: m.version,
          });
          this.evictModule(m.id);
        }
      }

      this.log.info('Module list loaded', { count: modules.length });
      return modules;
    } catch (error) {
      if (error instanceof SDKError) throw error;

      throw SDKError.network('Failed to load module list', {
        context: { url },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Evict a module from cache.
   */
  evictModule(moduleId: string): void {
    // Read cached manifest to get its screen list before deleting
    const manifest = this.cache.get(`manifest:${moduleId}`, 'manifest') as ModuleManifest | undefined;
    this.cache.delete(`manifest:${moduleId}`);
    // Also evict all cached screens for this module
    if (manifest?.screens) {
      for (const screenId of manifest.screens) {
        this.cache.delete(`screen:${moduleId}:${screenId}`);
      }
    }
    this.log.info('Module evicted from cache', { moduleId, screensEvicted: manifest?.screens?.length ?? 0 });
  }

  /**
   * Verify the PKI signature on a module manifest.
   *
   * Delegates to PKIVerifier for base64 format, signature length,
   * manifest hash computation, and certificate expiry checking.
   *
   * @param manifest The module manifest to verify
   * @returns true if the signature is valid
   */
  private async verifySignature(manifest: ModuleManifest): Promise<boolean> {
    const pkiVerifier = new PKIVerifier(this.pkiConfig);
    const result = await pkiVerifier.verifyModuleSignature(manifest);
    if (!result.valid) {
      this.log.warn('Module signature verification failed', {
        moduleId: manifest.id,
        error: result.error,
      });
    }
    return result.valid;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch a URL with a timeout enforced via AbortController.
   *
   * @param url     The URL to fetch
   * @param timeout Timeout in milliseconds
   * @returns The Response object
   * @throws SDKError if the request times out
   */
  private async fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw SDKError.network(`Request timed out after ${timeout}ms`, {
          context: { url, timeout },
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute an async function through the circuit breaker if one is
   * configured, or directly if not.
   */
  private async executeWithCircuitBreaker<T>(fn: () => Promise<T>): Promise<T> {
    if (this.circuitBreaker) {
      return this.circuitBreaker.execute(fn);
    }
    return fn();
  }
}
