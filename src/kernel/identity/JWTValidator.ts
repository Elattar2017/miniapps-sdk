/**
 * JWT Validator - Decode, validate, and check JWT tokens
 * @module kernel/identity/JWTValidator
 *
 * Supports structural validation (format, expiry, required claims) and
 * optional cryptographic signature verification via CryptoAdapter.
 *
 * When no CryptoAdapter or publicKey is provided, falls back to
 * Phase 1 structural-only validation for backward compatibility.
 */

import { base64UrlDecode } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import type { DecodedJWT, JWTClaims, JWTHeader, ICryptoAdapter } from '../../types';

/** Required claims that must be present in a valid JWT */
const REQUIRED_CLAIMS: ReadonlyArray<keyof JWTClaims> = ['sub', 'iss', 'aud', 'exp', 'tenantId'];

/** Supported JWT signature algorithms for cryptographic verification */
const SUPPORTED_ALGORITHMS: ReadonlySet<string> = new Set(['RS256', 'ES256', 'EdDSA']);

/** Result of JWT validation */
export interface JWTValidationResult {
  valid: boolean;
  claims?: JWTClaims;
  error?: string;
}

/** Configuration for JWTValidator */
export interface JWTValidatorConfig {
  /** CryptoAdapter instance for signature verification */
  cryptoAdapter?: ICryptoAdapter;
  /** Whether to verify the JWT signature cryptographically (default: false) */
  verifySignature?: boolean;
  /** Public key for signature verification (PEM or base64-encoded) */
  publicKey?: string;
}

export class JWTValidator {
  private readonly log = logger.child({ component: 'JWTValidator' });
  private readonly cryptoAdapter?: ICryptoAdapter;
  private readonly verifySignatureEnabled: boolean;
  private readonly publicKey?: string;

  constructor(config?: JWTValidatorConfig) {
    this.cryptoAdapter = config?.cryptoAdapter;
    this.verifySignatureEnabled = config?.verifySignature ?? false;
    this.publicKey = config?.publicKey;
  }

  /**
   * Decode a JWT token into its constituent parts.
   * Splits the token into header.payload.signature, base64url decodes each,
   * and parses the JSON for header and payload.
   *
   * @throws Error if the token format is invalid or JSON cannot be parsed
   */
  decode(token: string): DecodedJWT {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error(
        `Invalid JWT format: expected 3 parts separated by dots, got ${parts.length}`,
      );
    }

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;

    let header: JWTHeader;
    try {
      const headerJson = base64UrlDecode(headerEncoded);
      header = JSON.parse(headerJson) as JWTHeader;
    } catch {
      throw new Error('Failed to decode JWT header: invalid base64url or JSON');
    }

    let payload: JWTClaims;
    try {
      const payloadJson = base64UrlDecode(payloadEncoded);
      payload = JSON.parse(payloadJson) as JWTClaims;
    } catch {
      throw new Error('Failed to decode JWT payload: invalid base64url or JSON');
    }

    return {
      header,
      payload,
      signature: signatureEncoded,
    };
  }

  /**
   * Validate a JWT token for structure, expiry, and required claims.
   * This method is always synchronous for backward compatibility.
   *
   * For cryptographic signature verification, use `validateAsync()` instead.
   *
   * Checks:
   * 1. Token can be decoded (valid format)
   * 2. Token has not expired (exp > Date.now() / 1000)
   * 3. All required claims are present (sub, iss, aud, exp, tenantId)
   */
  validate(token: string): JWTValidationResult {
    return this.validateStructure(token);
  }

  /**
   * Validate a JWT token with optional cryptographic signature verification.
   *
   * Performs all structural checks first (format, expiry, required claims).
   * When `verifySignature` is enabled in config, additionally verifies the
   * JWT signature using CryptoAdapter.
   *
   * Checks:
   * 1. Token can be decoded (valid format)
   * 2. Token has not expired (exp > Date.now() / 1000)
   * 3. All required claims are present (sub, iss, aud, exp, tenantId)
   * 4. (If enabled) Cryptographic signature verification
   */
  async validateAsync(token: string): Promise<JWTValidationResult> {
    const structuralResult = this.validateStructure(token);

    // If structural validation failed, return immediately
    if (!structuralResult.valid) {
      return structuralResult;
    }

    // If signature verification is not enabled, return structural result
    if (!this.verifySignatureEnabled) {
      return structuralResult;
    }

    // Signature verification required
    return this.validateSignatureAsync(token, structuralResult);
  }

  /**
   * Perform structural validation of JWT token (format, expiry, required claims).
   * Always synchronous. Used internally by validate().
   */
  private validateStructure(token: string): JWTValidationResult {
    let decoded: DecodedJWT;
    try {
      decoded = this.decode(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown decode error';
      this.log.warn('JWT decode failed', { error: message });
      return { valid: false, error: message };
    }

    const { payload } = decoded;

    // Check expiry
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number') {
      this.log.warn('JWT missing exp claim');
      return { valid: false, error: 'Missing exp claim' };
    }

    if (payload.exp <= nowSeconds) {
      this.log.warn('JWT token has expired', {
        exp: payload.exp,
        now: nowSeconds,
      });
      return { valid: false, claims: payload, error: 'Token has expired' };
    }

    // Check required claims
    for (const claim of REQUIRED_CLAIMS) {
      const value = payload[claim];
      if (value === undefined || value === null || value === '') {
        this.log.warn(`JWT missing required claim: ${claim}`);
        return {
          valid: false,
          claims: payload,
          error: `Missing required claim: ${claim}`,
        };
      }
    }

    this.log.debug('JWT structural validation successful', {
      sub: payload.sub,
      tenantId: payload.tenantId,
    });

    return { valid: true, claims: payload };
  }

  /**
   * Perform async signature verification after structural checks pass.
   */
  private async validateSignatureAsync(
    token: string,
    structuralResult: JWTValidationResult,
  ): Promise<JWTValidationResult> {
    const decoded = this.decode(token);
    const sigResult = await this.verifyTokenSignature(
      token,
      decoded.header,
      decoded.signature,
    );

    if (!sigResult.valid) {
      return {
        valid: false,
        claims: structuralResult.claims,
        error: sigResult.error,
      };
    }

    this.log.debug('JWT validation with signature verification successful', {
      sub: structuralResult.claims?.sub,
      tenantId: structuralResult.claims?.tenantId,
    });

    return structuralResult;
  }

  /**
   * Verify the cryptographic signature of a JWT token.
   *
   * @param token - The full JWT token string
   * @param header - The decoded JWT header containing the algorithm
   * @param signature - The base64url-encoded signature from the token
   * @returns Result indicating whether the signature is valid
   */
  private async verifyTokenSignature(
    token: string,
    header: JWTHeader,
    signature: string,
  ): Promise<{ valid: boolean; error?: string }> {
    if (!this.cryptoAdapter) {
      this.log.warn('Signature verification requested but no CryptoAdapter provided');
      return { valid: true }; // fall back to structural-only
    }

    if (!this.publicKey) {
      this.log.warn('Signature verification requested but no public key configured');
      return { valid: false, error: 'No public key configured for signature verification' };
    }

    const alg = header.alg;
    if (!alg || !SUPPORTED_ALGORITHMS.has(alg)) {
      return { valid: false, error: `Unsupported JWT algorithm: ${alg ?? 'none'}` };
    }

    // Signing input is base64url(header).base64url(payload)
    const parts = token.split('.');
    const signingInput = parts[0] + '.' + parts[1];

    try {
      const isValid = await this.cryptoAdapter.verifySignature(
        signingInput,
        signature,
        this.publicKey,
      );
      return isValid
        ? { valid: true }
        : { valid: false, error: 'JWT signature verification failed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: `Signature verification error: ${message}` };
    }
  }

  /**
   * Get the configured public key for signature verification.
   */
  getPublicKey(): string | undefined {
    return this.publicKey;
  }

  /**
   * Check if a JWT token has expired.
   * Returns true if the token is expired or cannot be decoded.
   */
  isExpired(token: string): boolean {
    try {
      const decoded = this.decode(token);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return decoded.payload.exp <= nowSeconds;
    } catch {
      // If we cannot decode the token, treat it as expired
      return true;
    }
  }

  /**
   * Get the time remaining until the token expires, in milliseconds.
   * Returns 0 if the token is already expired or cannot be decoded.
   */
  getTimeToExpiry(token: string): number {
    try {
      const decoded = this.decode(token);
      const nowMs = Date.now();
      const expiryMs = decoded.payload.exp * 1000;
      const remaining = expiryMs - nowMs;
      return remaining > 0 ? remaining : 0;
    } catch {
      return 0;
    }
  }
}
