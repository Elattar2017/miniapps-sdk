/**
 * JWTValidator Crypto Test Suite
 * Tests cryptographic signature verification via CryptoAdapter integration.
 * Validates RS256/ES256/EdDSA algorithm support, fallback behavior,
 * and interaction between structural and signature checks.
 */

import { JWTValidator } from '../../../src/kernel/identity/JWTValidator';
import type { ICryptoAdapter } from '../../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Create a base64url-encoded string from a plain object */
function base64url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const b64 = btoa(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Standard valid claims for convenience */
function validClaims(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    sub: 'user-1',
    iss: 'test-issuer',
    aud: 'sdk',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    tenantId: 'tenant-1',
    ...overrides,
  };
}

/** Create a mock JWT token with the given header and claims */
function createMockJWT(
  claims: Record<string, unknown>,
  headerOverrides?: Record<string, unknown>,
): string {
  const header = { alg: 'RS256', typ: 'JWT', ...headerOverrides };
  const headerEncoded = base64url(header);
  const payloadEncoded = base64url(claims);
  return `${headerEncoded}.${payloadEncoded}.mock-signature-value`;
}

/** Create a mock ICryptoAdapter with all methods */
function createMockCryptoAdapter(
  overrides?: Partial<Record<keyof ICryptoAdapter, jest.Mock>>,
): ICryptoAdapter {
  return {
    hash: jest.fn().mockResolvedValue('mock-hash'),
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('decrypted'),
    generateKey: jest.fn().mockResolvedValue('mock-key'),
    verifySignature: jest.fn().mockResolvedValue(true),
    secureStore: jest.fn().mockResolvedValue(undefined),
    secureRetrieve: jest.fn().mockResolvedValue(null),
    secureDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const TEST_PUBLIC_KEY = 'test-public-key-pem-encoded';

describe('JWTValidator - Cryptographic Signature Verification', () => {
  describe('validateAsync with verifySignature=true', () => {
    it('should call cryptoAdapter.verifySignature with correct signing input', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(true);
      expect(mockAdapter.verifySignature).toHaveBeenCalledTimes(1);

      // Verify the signing input is header.payload (first two segments)
      const parts = token.split('.');
      const expectedSigningInput = parts[0] + '.' + parts[1];
      expect(mockAdapter.verifySignature).toHaveBeenCalledWith(
        expectedSigningInput,
        'mock-signature-value',
        TEST_PUBLIC_KEY,
      );
    });

    it('should return valid=false when cryptoAdapter returns false', async () => {
      const mockAdapter = createMockCryptoAdapter({
        verifySignature: jest.fn().mockResolvedValue(false),
      });
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('JWT signature verification failed');
      expect(result.claims).toBeDefined();
    });

    it('should fall back to structural-only when no cryptoAdapter is provided', async () => {
      const validator = new JWTValidator({
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
        // no cryptoAdapter
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      // Should pass because it falls back to structural-only
      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
    });
  });

  describe('validateAsync with verifySignature=false (default)', () => {
    it('should skip signature check and never call cryptoAdapter', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        // verifySignature defaults to false
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(true);
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });
  });

  describe('Algorithm support', () => {
    it('should accept RS256 algorithm in header', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims(), { alg: 'RS256' });
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(true);
      expect(mockAdapter.verifySignature).toHaveBeenCalled();
    });

    it('should accept ES256 algorithm in header', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims(), { alg: 'ES256' });
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(true);
      expect(mockAdapter.verifySignature).toHaveBeenCalled();
    });

    it('should return valid=false for unsupported algorithm', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims(), { alg: 'HS256' });
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported JWT algorithm');
      expect(result.error).toContain('HS256');
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });
  });

  describe('Structural checks still enforced with signature verification', () => {
    it('should reject expired token even with valid signature', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      );
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
      // Signature check should not be called when structural fails
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });

    it('should reject missing claims even with valid signature', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT({
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'tenant-1',
        // sub intentionally missing
      });
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required claim');
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });
  });

  describe('Public key configuration', () => {
    it('should return valid=false when no publicKey configured', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        // no publicKey
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No public key configured for signature verification');
    });

    it('should return valid=false when cryptoAdapter.verifySignature throws', async () => {
      const mockAdapter = createMockCryptoAdapter({
        verifySignature: jest.fn().mockRejectedValue(new Error('Crypto engine failure')),
      });
      const validator = new JWTValidator({
        cryptoAdapter: mockAdapter,
        verifySignature: true,
        publicKey: TEST_PUBLIC_KEY,
      });

      const token = createMockJWT(validClaims());
      const result = await validator.validateAsync(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Signature verification error');
      expect(result.error).toContain('Crypto engine failure');
    });
  });

  describe('Backward compatibility', () => {
    it('should work with no config (constructor with no arguments)', () => {
      const validator = new JWTValidator();
      const token = createMockJWT(validClaims());
      const result = validator.validate(token);

      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims?.sub).toBe('user-1');
    });
  });

  describe('getPublicKey()', () => {
    it('should return the configured public key', () => {
      const validator = new JWTValidator({
        publicKey: TEST_PUBLIC_KEY,
      });

      expect(validator.getPublicKey()).toBe(TEST_PUBLIC_KEY);
    });

    it('should return undefined when no public key configured', () => {
      const validator = new JWTValidator();

      expect(validator.getPublicKey()).toBeUndefined();
    });
  });
});
