/**
 * PKIVerifier Crypto Test Suite
 * Tests cryptographic signature verification via CryptoAdapter integration.
 * Validates real verification flow, fallback to Phase 1, content hash
 * computation, and error handling.
 */

import { PKIVerifier } from '../../../src/kernel/identity/PKIVerifier';
import type { ICryptoAdapter, ModuleManifest } from '../../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Create a base64 string encoding `byteCount` bytes.
 * Uses a repeated character pattern for deterministic output.
 */
function createBase64Signature(byteCount: number): string {
  const raw = 'a'.repeat(byteCount);
  return btoa(raw);
}

/** Create a valid test manifest with a sufficiently long base64 signature */
function createValidManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    id: 'com.test.module',
    name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    screens: ['main'],
    entryScreen: 'main',
    permissions: { apis: [], storage: false },
    signature: createBase64Signature(33), // 44 chars base64, 33 bytes decoded
    minSDKVersion: '1.0.0',
    icon: 'https://example.com/icon.png',
    category: 'utilities',
    author: 'Test Author',
    ...overrides,
  };
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

describe('PKIVerifier - Cryptographic Signature Verification', () => {
  describe('With CryptoAdapter + publicKey', () => {
    it('should call verifySignature with content hash of manifest fields', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(mockAdapter.verifySignature).toHaveBeenCalledTimes(1);

      // Verify that verifySignature was called with content hash, signature, and public key
      const callArgs = (mockAdapter.verifySignature as jest.Mock).mock.calls[0] as [string, string, string];
      expect(callArgs[1]).toBe(manifest.signature);
      expect(callArgs[2]).toBe(TEST_PUBLIC_KEY);
      // First arg should be a hash string (content hash)
      expect(typeof callArgs[0]).toBe('string');
      expect(callArgs[0].length).toBeGreaterThan(0);
    });

    it('should return valid=true when verifySignature returns true', async () => {
      const mockAdapter = createMockCryptoAdapter({
        verifySignature: jest.fn().mockResolvedValue(true),
      });
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(result.signer).toBe('Test Author');
      expect(result.algorithm).toBe('Ed25519');
      expect(result.timestamp).toBeDefined();
    });

    it('should return valid=false when verifySignature returns false', async () => {
      const mockAdapter = createMockCryptoAdapter({
        verifySignature: jest.fn().mockResolvedValue(false),
      });
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cryptographic signature verification failed');
    });
  });

  describe('Without CryptoAdapter (Phase 1 fallback)', () => {
    it('should fall back to Phase 1 base64 check when no CryptoAdapter', async () => {
      const verifier = new PKIVerifier();

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(result.signer).toBe('Test Author');
      expect(result.manifestHash).toBeDefined();
    });
  });

  describe('Content hash computation', () => {
    it('should compute content hash from id, version, and screens fields', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest1 = createValidManifest({
        id: 'com.test.module-a',
        version: '1.0.0',
        screens: ['main'],
      });
      const manifest2 = createValidManifest({
        id: 'com.test.module-b',
        version: '2.0.0',
        screens: ['main', 'settings'],
      });

      await verifier.verifyModuleSignature(manifest1);
      await verifier.verifyModuleSignature(manifest2);

      // Content hashes should be different because id/version/screens differ
      const calls = (mockAdapter.verifySignature as jest.Mock).mock.calls as Array<[string, string, string]>;
      expect(calls.length).toBe(2);
      expect(calls[0][0]).not.toBe(calls[1][0]);
    });
  });

  describe('Structural checks still enforced before crypto', () => {
    it('should reject signature too short before crypto check', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const shortSig = createBase64Signature(6); // 6 bytes < 32 minimum
      const manifest = createValidManifest({ signature: shortSig });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature too short: minimum 32 bytes required');
      // CryptoAdapter should not be called for pre-structural failures
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });

    it('should reject invalid base64 before crypto check', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest({ signature: '!!invalid!!' });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature is not valid base64');
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });

    it('should reject missing signature before crypto check', async () => {
      const mockAdapter = createMockCryptoAdapter();
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest({ signature: '' });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Module signature is missing or not a string');
      expect(mockAdapter.verifySignature).not.toHaveBeenCalled();
    });
  });

  describe('Backward compatibility', () => {
    it('should work with no config (constructor with no arguments)', async () => {
      const verifier = new PKIVerifier();

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(result.signer).toBe('Test Author');
      expect(result.algorithm).toBe('Ed25519');
      expect(result.manifestHash).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return valid=false when cryptoAdapter.verifySignature throws', async () => {
      const mockAdapter = createMockCryptoAdapter({
        verifySignature: jest.fn().mockRejectedValue(new Error('Native crypto unavailable')),
      });
      const verifier = new PKIVerifier({
        cryptoAdapter: mockAdapter,
        publicKey: TEST_PUBLIC_KEY,
      });

      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Verification error');
      expect(result.error).toContain('Native crypto unavailable');
    });
  });
});
