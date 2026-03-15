/**
 * RevocationChecker - CRL/OCSP certificate revocation verification
 * @module kernel/identity/RevocationChecker
 *
 * Checks whether a module's signing certificate has been revoked
 * via CRL (Certificate Revocation List) or OCSP (Online Certificate
 * Status Protocol). Caches results for 1 hour by default.
 *
 * CRL: Fetches the revocation list, parses revoked serial numbers,
 *      and checks the module's signing certificate fingerprint.
 *
 * OCSP: Posts a status request to the responder and parses the response
 *       for the certificate status (good/revoked/unknown).
 */

import { logger } from '../../utils/logger';
import type { ModuleManifest } from '../../types';

/** Revocation check result */
export interface RevocationResult {
  revoked: boolean;
  reason?: string;
  checkedVia?: 'CRL' | 'OCSP' | 'cache' | 'skipped';
}

/** Configuration for RevocationChecker */
export interface RevocationCheckerConfig {
  /** CRL distribution point URL */
  crlEndpoint?: string;
  /** OCSP responder URL */
  ocspEndpoint?: string;
  /** Cache TTL in milliseconds (default: 3600000 = 1 hour) */
  cacheTTL?: number;
  /** Whether to allow module loading when revocation check fails/unavailable (default: true) */
  allowOnFailure?: boolean;
  /** Request timeout in milliseconds (default: 10000) */
  requestTimeout?: number;
}

const DEFAULT_CACHE_TTL = 3_600_000; // 1 hour
const DEFAULT_REQUEST_TIMEOUT = 10_000; // 10 seconds

/** OCSP response status codes (RFC 6960) */
const OCSP_STATUS = {
  GOOD: 0,
  REVOKED: 1,
  UNKNOWN: 2,
} as const;

export class RevocationChecker {
  private readonly log = logger.child({ component: 'RevocationChecker' });
  private readonly config: RevocationCheckerConfig;
  private readonly cache: Map<string, { result: RevocationResult; cachedAt: number }> = new Map();
  /** Cached CRL entries: set of revoked serial/fingerprint strings */
  private crlEntries: Set<string> | null = null;
  private crlFetchedAt = 0;

  constructor(config?: RevocationCheckerConfig) {
    this.config = config ?? {};
    this.log.debug('RevocationChecker initialized', {
      hasCRL: !!this.config.crlEndpoint,
      hasOCSP: !!this.config.ocspEndpoint,
      allowOnFailure: this.config.allowOnFailure !== false,
    });
  }

  /**
   * Check if a module's signing certificate has been revoked.
   * Tries cache first, then CRL, then OCSP. Skips if offline/unavailable.
   */
  async checkRevocation(manifest: ModuleManifest): Promise<RevocationResult> {
    const cacheKey = this.buildCacheKey(manifest);

    // Check cache first
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Try CRL check
    if (this.config.crlEndpoint) {
      try {
        const result = await this.checkCRL(manifest);
        this.setCache(cacheKey, result);
        return result;
      } catch (err) {
        this.log.warn('CRL check failed, trying OCSP fallback', {
          moduleId: manifest.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback to OCSP
    if (this.config.ocspEndpoint) {
      try {
        const result = await this.checkOCSP(manifest);
        this.setCache(cacheKey, result);
        return result;
      } catch (err) {
        this.log.warn('OCSP check failed', {
          moduleId: manifest.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // No endpoints configured or both failed
    if (this.config.allowOnFailure !== false) {
      this.log.info('Revocation check skipped (no endpoints or offline)', {
        moduleId: manifest.id,
      });
      return { revoked: false, checkedVia: 'skipped' };
    }

    // allowOnFailure=false: deny loading
    return { revoked: true, reason: 'Revocation check required but unavailable' };
  }

  /**
   * Check certificate against CRL endpoint.
   *
   * Fetches the CRL (JSON format from the SDK backend) and checks whether
   * the module's signing certificate fingerprint appears in the revoked list.
   *
   * Expected CRL JSON format from backend:
   * {
   *   "issuer": "SDK CA",
   *   "updatedAt": "2026-01-01T00:00:00Z",
   *   "nextUpdate": "2026-01-02T00:00:00Z",
   *   "revoked": [
   *     { "fingerprint": "abc123...", "revokedAt": "...", "reason": "key_compromise" },
   *     ...
   *   ]
   * }
   */
  private async checkCRL(manifest: ModuleManifest): Promise<RevocationResult> {
    this.log.debug('CRL check for module', { moduleId: manifest.id, endpoint: this.config.crlEndpoint });

    const certFingerprint = manifest.signingCertFingerprint;
    if (!certFingerprint) {
      // No fingerprint on manifest — can't check against CRL, treat as not revoked
      this.log.debug('No signingCertFingerprint on manifest, skipping CRL check', { moduleId: manifest.id });
      return { revoked: false, checkedVia: 'CRL' };
    }

    // Fetch CRL if not cached or expired
    const cacheTTL = this.config.cacheTTL ?? DEFAULT_CACHE_TTL;
    if (!this.crlEntries || Date.now() - this.crlFetchedAt > cacheTTL) {
      await this.fetchCRL();
    }

    // Check if certificate is in the revoked set
    if (this.crlEntries && this.crlEntries.has(certFingerprint)) {
      this.log.warn('Certificate found in CRL', { moduleId: manifest.id, fingerprint: certFingerprint });
      return { revoked: true, reason: 'Certificate found in CRL', checkedVia: 'CRL' };
    }

    return { revoked: false, checkedVia: 'CRL' };
  }

  /**
   * Fetch and parse the CRL from the configured endpoint.
   */
  private async fetchCRL(): Promise<void> {
    const timeout = this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.config.crlEndpoint!, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`CRL endpoint returned HTTP ${response.status}`);
      }

      const data = await response.json() as {
        revoked?: Array<{ fingerprint?: string; serial?: string; reason?: string }>;
      };

      // Build set of revoked fingerprints/serials
      this.crlEntries = new Set<string>();
      if (Array.isArray(data.revoked)) {
        for (const entry of data.revoked) {
          if (entry.fingerprint) this.crlEntries.add(entry.fingerprint);
          if (entry.serial) this.crlEntries.add(entry.serial);
        }
      }
      this.crlFetchedAt = Date.now();
      this.log.info('CRL fetched', { revokedCount: this.crlEntries.size });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Check certificate via OCSP responder.
   *
   * Posts a JSON OCSP request to the responder endpoint and interprets
   * the response status.
   *
   * Request format:
   * POST { fingerprint: "abc123...", moduleId: "com.vendor.module" }
   *
   * Expected response format:
   * { status: 0|1|2, reason?: string }
   *   0 = good, 1 = revoked, 2 = unknown
   */
  private async checkOCSP(manifest: ModuleManifest): Promise<RevocationResult> {
    this.log.debug('OCSP check for module', { moduleId: manifest.id, endpoint: this.config.ocspEndpoint });

    const certFingerprint = manifest.signingCertFingerprint;
    if (!certFingerprint) {
      this.log.debug('No signingCertFingerprint on manifest, skipping OCSP check', { moduleId: manifest.id });
      return { revoked: false, checkedVia: 'OCSP' };
    }

    const timeout = this.config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.config.ocspEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          fingerprint: certFingerprint,
          moduleId: manifest.id,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OCSP responder returned HTTP ${response.status}`);
      }

      const data = await response.json() as {
        status: number;
        reason?: string;
      };

      if (data.status === OCSP_STATUS.REVOKED) {
        this.log.warn('OCSP reports certificate revoked', {
          moduleId: manifest.id,
          reason: data.reason,
        });
        return {
          revoked: true,
          reason: data.reason ?? 'Certificate revoked (OCSP)',
          checkedVia: 'OCSP',
        };
      }

      if (data.status === OCSP_STATUS.UNKNOWN) {
        this.log.warn('OCSP reports certificate status unknown', { moduleId: manifest.id });
        // Treat unknown as not revoked (allowOnFailure controls strict behavior)
        return { revoked: false, checkedVia: 'OCSP' };
      }

      // GOOD
      return { revoked: false, checkedVia: 'OCSP' };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildCacheKey(manifest: ModuleManifest): string {
    const sigPrefix = manifest.signature?.slice(0, 16) ?? 'nosig';
    return `${manifest.id}:${manifest.version}:${sigPrefix}`;
  }

  private getCached(key: string): RevocationResult | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const ttl = this.config.cacheTTL ?? DEFAULT_CACHE_TTL;
    if (Date.now() - entry.cachedAt > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return { ...entry.result, checkedVia: 'cache' };
  }

  private setCache(key: string, result: RevocationResult): void {
    this.cache.set(key, { result, cachedAt: Date.now() });
  }

  /** Clear all cached revocation results */
  clearCache(): void {
    this.cache.clear();
    this.crlEntries = null;
    this.crlFetchedAt = 0;
    this.log.debug('Revocation cache cleared');
  }

  /** Get the number of cached entries */
  getCacheSize(): number {
    return this.cache.size;
  }
}
