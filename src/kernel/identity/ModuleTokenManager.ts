/**
 * Module Token Manager - Acquires, caches, and manages per-module API tokens
 * @module kernel/identity/ModuleTokenManager
 *
 * Handles the module token factory flow:
 * 1. Module manifest declares externalTokenFactoryURL + apiDomains
 * 2. SDK decrypts the factory URL using CryptoAdapter
 * 3. SDK sends the host authToken (user JWT) + moduleId to the factory
 * 4. Factory validates the user, returns a module-scoped API token
 * 5. SDK caches the token and injects it for requests matching apiDomains
 * 6. Proactive refresh at 80% TTL
 *
 * The host authToken is the ONLY credential sent to the factory — it identifies
 * the user. The factory decides whether to issue a module token based on the
 * user's identity and entitlements. Module access visibility is separately
 * controlled client-side via subscription.tier + manifest.requiredTiers.
 *
 * Performance budget: Token acquisition should not block module load.
 */

import { logger } from "../../utils/logger";
import type { ICryptoAdapter, ModuleManifest, ModuleTokenResult } from "../../types";
import type { APIProxy } from "../network/APIProxy";
import type { DataBus } from "../communication/DataBus";

const DEFAULT_TOKEN_TTL = 3600; // 1 hour in seconds

export class ModuleTokenManager {
  private readonly log = logger.child({ component: "ModuleTokenManager" });
  private readonly apiProxy: APIProxy;
  private readonly cryptoAdapter: ICryptoAdapter;
  private readonly dataBus: DataBus | undefined;
  private readonly encryptionKey: string;

  // In-memory cache mirrors what is in secure storage for fast access
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number; domains: string[] }>();
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(config: {
    apiProxy: APIProxy;
    cryptoAdapter: ICryptoAdapter;
    dataBus?: DataBus;
    encryptionKey: string;
  }) {
    this.apiProxy = config.apiProxy;
    this.cryptoAdapter = config.cryptoAdapter;
    this.dataBus = config.dataBus;
    this.encryptionKey = config.encryptionKey;
    this.log.info("ModuleTokenManager initialized");
  }

  async acquireToken(manifest: ModuleManifest): Promise<ModuleTokenResult> {
    // 1. Only acquire if manifest declares a factory URL and API domains
    if (!manifest.externalTokenFactoryURL) {
      return { acquired: false };
    }

    if (!manifest.apiDomains || manifest.apiDomains.length === 0) {
      this.log.warn("Module has factory URL but no apiDomains declared", { moduleId: manifest.id });
      return { acquired: false, error: "No apiDomains declared" };
    }

    // 2. Check cache (in-memory first)
    const cached = this.getCachedToken(manifest.id);
    if (cached) {
      // Re-register with APIProxy (in case app restarted)
      this.apiProxy.setModuleToken(manifest.id, cached.token, manifest.apiDomains);
      return { acquired: true, token: cached.token, expiresAt: cached.expiresAt };
    }

    // 3. Decrypt the factory URL (or use as-is if plain text in dev)
    let factoryUrl: string;
    try {
      factoryUrl = await this.cryptoAdapter.decrypt(manifest.externalTokenFactoryURL, this.encryptionKey);
    } catch {
      // Decryption failed — URL may be plain text (common in dev environments)
      if (manifest.externalTokenFactoryURL.startsWith('http://') || manifest.externalTokenFactoryURL.startsWith('https://')) {
        this.log.warn("Factory URL appears to be plain text (not encrypted)", { moduleId: manifest.id });
        factoryUrl = manifest.externalTokenFactoryURL;
      } else {
        this.log.error("Failed to decrypt factory URL — ensure crypto provider is available", { moduleId: manifest.id });
        return { acquired: false, error: "URL decryption failed" };
      }
    }

    // 4. Call factory URL with the host authToken (identifies the user) + moduleId
    //    The host JWT is sent as Authorization header — the factory validates the
    //    user's identity and returns a module-scoped token for the declared apiDomains.
    try {
      const response = await this.apiProxy.requestAbsolute(factoryUrl, {
        method: "POST",
        body: { moduleId: manifest.id },
        // skipAuth is NOT set — host authToken is sent as Authorization: Bearer header
      });

      if (!response.ok) {
        return { acquired: false, error: "Factory returned HTTP " + response.status };
      }

      const data = response.data as { token: string; expiresIn?: number } | null;
      if (!data?.token) {
        return { acquired: false, error: "Factory response missing token field" };
      }

      // 5. Compute expiry
      const expiresIn = data.expiresIn ?? DEFAULT_TOKEN_TTL;
      const expiresAt = Date.now() + expiresIn * 1000;
      const domains = manifest.apiDomains;

      // 6. Store in cache
      this.storeToken(manifest.id, data.token, expiresAt, domains);

      // 7. Register with APIProxy — future requests matching apiDomains use this token
      this.apiProxy.setModuleToken(manifest.id, data.token, domains);

      // 8. Publish DataBus event
      this.dataBus?.publish("sdk:module:token:acquired", { moduleId: manifest.id, expiresAt });

      // 9. Start proactive refresh timer at 80% TTL
      this.startRefreshTimer(manifest.id, manifest, expiresAt);

      this.log.info("Module token acquired", { moduleId: manifest.id, expiresAt });
      return { acquired: true, token: data.token, expiresAt };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error("Token factory call failed", { moduleId: manifest.id, error: message });
      return { acquired: false, error: "Factory call failed: " + message };
    }
  }

  invalidateToken(moduleId: string): void {
    this.stopRefreshTimer(moduleId);
    this.tokenCache.delete(moduleId);
    this.apiProxy.removeModuleToken(moduleId);
    this.log.debug("Token invalidated", { moduleId });
  }

  getToken(moduleId: string): string | null {
    const cached = this.tokenCache.get(moduleId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }
    return null;
  }

  async refreshToken(manifest: ModuleManifest): Promise<ModuleTokenResult> {
    this.invalidateToken(manifest.id);
    return this.acquireToken(manifest);
  }

  startRefreshTimer(moduleId: string, manifest: ModuleManifest, expiresAt: number): void {
    this.stopRefreshTimer(moduleId);
    const ttl = expiresAt - Date.now();
    const refreshDelay = Math.max(ttl * 0.8, 1000); // Refresh at 80% TTL, min 1s
    const timer = setTimeout(async () => {
      try {
        this.log.debug("Proactive token refresh triggered", { moduleId });
        await this.refreshToken(manifest);
      } catch (err) {
        this.log.error("Proactive token refresh failed", {
          moduleId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, refreshDelay);
    this.refreshTimers.set(moduleId, timer);
  }

  stopRefreshTimer(moduleId: string): void {
    const timer = this.refreshTimers.get(moduleId);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(moduleId);
    }
  }

  private getCachedToken(moduleId: string): { token: string; expiresAt: number } | null {
    const cached = this.tokenCache.get(moduleId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
    // Expired or not found - clean up
    if (cached) {
      this.tokenCache.delete(moduleId);
    }
    return null;
  }

  private storeToken(moduleId: string, token: string, expiresAt: number, domains: string[]): void {
    this.tokenCache.set(moduleId, { token, expiresAt, domains });
  }
}
