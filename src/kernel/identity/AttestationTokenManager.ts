/**
 * Attestation Token Manager - External API token acquisition via device attestation
 * @module kernel/identity/AttestationTokenManager
 *
 * Manages tokens for external API access using platform attestation:
 * iOS: App Attest, Android: Play Integrity
 *
 * Flow: Generate nonce -> Device attestation -> Backend token exchange -> Cache
 * Target: >90% cache hit rate to minimize attestation overhead
 *
 * Performance budget: <500ms for full attestation flow (ADR-011)
 */

import { logger } from '../../utils/logger';
import type { ICryptoAdapter, DeviceAttestationConfig, ExternalAPITokenParams } from '../../types';
import type { APIProxy } from '../network/APIProxy';
import type { DataBus } from '../communication/DataBus';

// ---------------------------------------------------------------------------
// Native module interface (matches BridgeAdapter DeviceIntegrityModule)
// ---------------------------------------------------------------------------

interface DeviceIntegrityModule {
  attestDevice(challenge: string): Promise<string>;
  verifyAttestation(token: string): Promise<boolean>;
}

interface BridgeAdapterLike {
  getNativeModule(name: string): DeviceIntegrityModule;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOKEN_TTL = 3600; // 1 hour in seconds
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT = 5000; // 5 seconds
// ---------------------------------------------------------------------------
// AttestationTokenManager
// ---------------------------------------------------------------------------

export class AttestationTokenManager {
  private readonly log = logger.child({ component: 'AttestationTokenManager' });
  private readonly bridgeAdapter: BridgeAdapterLike;
  private readonly apiProxy: APIProxy;
  private readonly cryptoAdapter: ICryptoAdapter;
  private readonly dataBus: DataBus | undefined;
  private readonly tokenTTL: number;
  private readonly retryAttempts: number;
  private readonly timeout: number;
  private readonly attestationApiUrl: string;

  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private cacheHits = 0;
  private cacheMisses = 0;
  constructor(config: {
    bridgeAdapter: BridgeAdapterLike;
    apiProxy: APIProxy;
    cryptoAdapter: ICryptoAdapter;
    dataBus?: DataBus;
    attestation: DeviceAttestationConfig;
  }) {
    this.bridgeAdapter = config.bridgeAdapter;
    this.apiProxy = config.apiProxy;
    this.cryptoAdapter = config.cryptoAdapter;
    this.dataBus = config.dataBus;
    this.attestationApiUrl = config.attestation.apiUrl;
    this.tokenTTL = (config.attestation.tokenTTL ?? DEFAULT_TOKEN_TTL) * 1000;
    this.retryAttempts = config.attestation.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.timeout = config.attestation.timeout ?? DEFAULT_TIMEOUT;

    this.log.info('AttestationTokenManager initialized', {
      attestationApiUrl: this.attestationApiUrl,
      tokenTTL: this.tokenTTL,
    });
  }
  async getExternalAPIToken(params: ExternalAPITokenParams): Promise<string> {
    const { scope, forceRefresh } = params;

    // Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = this.tokenCache.get(scope);
      if (cached && cached.expiresAt > Date.now()) {
        this.cacheHits++;
        this.log.debug('Attestation token cache hit', { scope });
        return cached.token;
      }
    }

    this.cacheMisses++;

    // Perform attestation flow with retries
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const token = await this.performAttestationFlow(scope, params.moduleId);
        return token;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));        this.log.warn('Attestation attempt failed', {
          scope,
          attempt: attempt + 1,
          maxAttempts: this.retryAttempts,
          error: lastError.message,
        });

        if (attempt < this.retryAttempts - 1) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, Math.pow(2, attempt) * 500),
          );
        }
      }
    }

    this.dataBus?.publish('sdk:attestation:failed', {
      scope,
      error: lastError?.message,
    });

    throw lastError ?? new Error('Attestation failed after retries');
  }
  invalidateToken(scope: string): void {
    this.tokenCache.delete(scope);
    this.log.debug('Token invalidated', { scope });
  }

  invalidateAllTokens(): void {
    this.tokenCache.clear();
    this.log.info('All attestation tokens invalidated');
  }

  getCacheStats(): { totalTokens: number; hitRate: number; oldestToken: number | null } {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;

    let oldestToken: number | null = null;
    for (const entry of this.tokenCache.values()) {
      if (oldestToken === null || entry.expiresAt < oldestToken) {
        oldestToken = entry.expiresAt;
      }
    }

    return {
      totalTokens: this.tokenCache.size,
      hitRate,
      oldestToken,
    };
  }
  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  private async performAttestationFlow(scope: string, moduleId?: string): Promise<string> {
    // 1. Generate nonce
    const nonce = await this.cryptoAdapter.generateKey();
    this.log.debug('Nonce generated for attestation', { scope });

    // 2. Device attestation via native module
    const deviceIntegrity = this.bridgeAdapter.getNativeModule('DeviceIntegrityModule');
    const attestation = await deviceIntegrity.attestDevice(nonce);
    this.log.debug('Device attestation completed', { scope });

    // 3. Exchange attestation with backend for API token
    const response = await this.apiProxy.request(this.attestationApiUrl, {
      method: 'POST',
      body: {
        attestation,
        nonce,
        scope,
        moduleId,
      },
      timeout: this.timeout,
    });
    if (!response.ok) {
      throw new Error(`Token exchange failed: HTTP ${response.status}`);
    }

    const tokenData = response.data as { token: string; expiresIn?: number };
    if (!tokenData?.token) {
      throw new Error('Invalid token response: missing token field');
    }

    const expiresAt = Date.now() + (tokenData.expiresIn
      ? tokenData.expiresIn * 1000
      : this.tokenTTL);

    // 4. Cache the token
    this.tokenCache.set(scope, { token: tokenData.token, expiresAt });

    this.dataBus?.publish('sdk:attestation:success', { scope, moduleId });
    this.log.info('Attestation token acquired', { scope });

    return tokenData.token;
  }
}
