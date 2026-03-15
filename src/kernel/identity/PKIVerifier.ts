/**
 * PKI Verifier - Module signature verification
 * @module kernel/identity/PKIVerifier
 *
 * Supports structural validation (base64 format, length, expiry) and
 * optional cryptographic signature verification via CryptoAdapter.
 *
 * When no CryptoAdapter or publicKey is provided, falls back to
 * Phase 1 structural-only verification for backward compatibility.
 */

import { sha256 } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import type { ModuleManifest, SignatureVerification, ICryptoAdapter } from '../../types';
import { RevocationChecker } from './RevocationChecker';
import type { RevocationCheckerConfig } from './RevocationChecker';

/** Regex pattern for valid base64 strings (standard or URL-safe) */
const BASE64_PATTERN = /^[A-Za-z0-9+/\-_]+=*$/;

/** Signature validity period: 1 year in milliseconds */
const SIGNATURE_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;

/** Minimum decoded signature length in bytes */
const MIN_SIGNATURE_BYTES = 32;

/** Configuration for PKIVerifier */
export interface PKIVerifierConfig {
  /** CryptoAdapter instance for cryptographic signature verification */
  cryptoAdapter?: ICryptoAdapter;
  /** Public key for signature verification (PEM or base64-encoded) */
  publicKey?: string;
  /** Optional configuration for CRL/OCSP revocation checking */
  revocationConfig?: RevocationCheckerConfig;
}

export class PKIVerifier {
  private readonly log = logger.child({ component: 'PKIVerifier' });
  private readonly cryptoAdapter?: ICryptoAdapter;
  private readonly publicKey?: string;
  private readonly revocationChecker?: RevocationChecker;

  constructor(config?: PKIVerifierConfig) {
    this.cryptoAdapter = config?.cryptoAdapter;
    this.publicKey = config?.publicKey;
    if (config?.revocationConfig) {
      this.revocationChecker = new RevocationChecker(config.revocationConfig);
    }
  }

  /**
   * Verify a module's cryptographic signature.
   *
   * Performs structural checks (base64 format, minimum length, expiry) first.
   * If a CryptoAdapter and publicKey are configured, additionally performs
   * cryptographic verification of the signature against a content hash.
   *
   * Without CryptoAdapter, falls back to Phase 1 structural-only verification
   * (accepts any valid base64 string) for backward compatibility.
   *
   * @param manifest The module manifest containing the signature to verify
   * @returns SignatureVerification result with validity status
   */
  async verifyModuleSignature(manifest: ModuleManifest): Promise<SignatureVerification> {
    const { signature, id, version } = manifest;

    if (!signature || typeof signature !== 'string') {
      this.log.warn('Module has no signature', { moduleId: id, version });
      return {
        valid: false,
        error: 'Module signature is missing or not a string',
      };
    }

    if (!this.isValidBase64(signature)) {
      this.log.warn('Module has invalid base64 signature', {
        moduleId: id,
        version,
      });
      return {
        valid: false,
        error: 'Signature is not valid base64',
      };
    }

    // Signature length validation: decoded bytes must be >= 32
    try {
      const decoded = typeof atob === 'function'
        ? atob(signature.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(signature, 'base64').toString('binary');

      if (decoded.length < MIN_SIGNATURE_BYTES) {
        this.log.warn('Module signature too short', {
          moduleId: id,
          version,
          decodedLength: decoded.length,
        });
        return {
          valid: false,
          error: 'Signature too short: minimum 32 bytes required',
        };
      }
    } catch {
      this.log.warn('Failed to decode module signature', {
        moduleId: id,
        version,
      });
      return {
        valid: false,
        error: 'Failed to decode signature',
      };
    }

    // Certificate expiry checking
    if (typeof manifest.signedAt === 'number') {
      const age = Date.now() - manifest.signedAt;
      if (age > SIGNATURE_VALIDITY_MS) {
        this.log.warn('Module signature has expired', {
          moduleId: id,
          version,
          signedAt: manifest.signedAt,
          ageMs: age,
        });
        return {
          valid: false,
          error: 'Module signature has expired',
        };
      }
    }

    // Resolve which public key to use for verification:
    // 1. Per-module key stapled by server (manifest.signingPublicKey) — supports multi-developer
    // 2. Global operator key from PKI config (this.publicKey) — single-signer fallback
    const verifyPublicKey = manifest.signingPublicKey ?? this.publicKey;

    // If CryptoAdapter and a public key are available, perform cryptographic verification
    if (this.cryptoAdapter && verifyPublicKey) {
      try {
        // Build the signing payload (must match backend/CLI sign format)
        // The CryptoAdapter.verifySignature uses RSASSA-PKCS1-v1_5 with SHA-256,
        // which internally hashes the data — so pass the raw payload, not a hash.
        const signingPayload = JSON.stringify({
          id: manifest.id,
          version: manifest.version,
          screens: manifest.screens,
        });

        const isValid = await this.cryptoAdapter.verifySignature(
          signingPayload,
          signature,
          verifyPublicKey,
        );

        if (!isValid) {
          this.log.warn('Module signature cryptographic verification failed', {
            moduleId: id,
            version,
          });
          return {
            valid: false,
            error: 'Cryptographic signature verification failed',
          };
        }

        // Revocation check (if configured)
        if (this.revocationChecker) {
          const revocation = await this.revocationChecker.checkRevocation(manifest);
          if (revocation.revoked) {
            this.log.warn('Module certificate has been revoked', {
              moduleId: id,
              version,
              reason: revocation.reason,
            });
            return {
              valid: false,
              error: `Certificate revoked: ${revocation.reason ?? 'unknown reason'}`,
            };
          }
        }

        this.log.info('Module signature verified cryptographically', {
          moduleId: id,
          version,
        });

        return {
          valid: true,
          signer: manifest.author ?? 'unknown',
          algorithm: this.detectAlgorithm(),
          timestamp: Date.now(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error('Cryptographic verification error', {
          moduleId: id,
          version,
          error: message,
        });
        return {
          valid: false,
          error: `Verification error: ${message}`,
        };
      }
    }

    // Fall back to Phase 1 structural verification when no CryptoAdapter
    if (!this.cryptoAdapter) {
      this.log.warn('No CryptoAdapter provided, using Phase 1 structural verification only', {
        moduleId: id,
        version,
      });
    }

    // Manifest hash verification: compute hash of manifest without signature field
    const manifestCopy = { ...manifest };
    delete (manifestCopy as Record<string, unknown>).signature;
    const manifestHash = await sha256(JSON.stringify(manifestCopy));

    // Revocation check on structural path (if configured)
    if (this.revocationChecker) {
      const revocation = await this.revocationChecker.checkRevocation(manifest);
      if (revocation.revoked) {
        this.log.warn('Module certificate has been revoked', {
          moduleId: id,
          version,
          reason: revocation.reason,
        });
        return {
          valid: false,
          error: `Certificate revoked: ${revocation.reason ?? 'unknown reason'}`,
        };
      }
    }

    // Phase 1: Accept any valid base64 string
    this.log.debug('Module signature accepted (Phase 1 structural check)', {
      moduleId: id,
      version,
      manifestHash,
    });

    return {
      valid: true,
      signer: manifest.author ?? 'unknown',
      algorithm: this.detectAlgorithm(),
      timestamp: Date.now(),
      manifestHash,
    };
  }

  /**
   * Detect the signing algorithm from the configured public key.
   * RSA keys (PEM SPKI) are typically much longer than Ed25519 keys.
   */
  private detectAlgorithm(): 'RSA-4096' | 'Ed25519' {
    if (!this.publicKey) return 'Ed25519'; // default
    // RSA public keys in PEM are >400 chars; Ed25519 are ~68 chars base64
    const keyBody = this.publicKey
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\s/g, '');
    return keyBody.length > 200 ? 'RSA-4096' : 'Ed25519';
  }

  /**
   * Check if a string is valid base64 (standard or URL-safe).
   * Must be non-empty and consist only of valid base64 characters.
   */
  isValidBase64(str: string): boolean {
    if (!str || typeof str !== 'string' || str.length === 0) {
      return false;
    }

    // Minimum length for a meaningful base64-encoded value
    if (str.length < 4) {
      return false;
    }

    return BASE64_PATTERN.test(str);
  }
}
