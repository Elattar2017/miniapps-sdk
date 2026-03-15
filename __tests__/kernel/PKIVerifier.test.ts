/**
 * PKIVerifier Test Suite
 * Tests module signature verification, base64 validation,
 * manifest hash computation, signature length validation,
 * and certificate expiry checking.
 */

import { PKIVerifier } from '../../src/kernel/identity/PKIVerifier';
import type { ModuleManifest } from '../../src/types';

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

describe('PKIVerifier', () => {
  let verifier: PKIVerifier;

  beforeEach(() => {
    verifier = new PKIVerifier();
  });

  // ---------------------------------------------------------------------------
  // verifyModuleSignature()
  // ---------------------------------------------------------------------------

  describe('verifyModuleSignature()', () => {
    it('should accept valid manifest with valid long base64 signature', async () => {
      const manifest = createValidManifest();
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(result.signer).toBe('Test Author');
      expect(result.algorithm).toBe('Ed25519');
      expect(result.timestamp).toBeDefined();
    });

    it('should return invalid for missing signature', async () => {
      const manifest = createValidManifest({ signature: '' });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Module signature is missing or not a string');
    });

    it('should return invalid for non-string signature', async () => {
      const manifest = createValidManifest({
        signature: 12345 as unknown as string,
      });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Module signature is missing or not a string');
    });

    it('should return invalid for too-short base64 (<4 chars)', async () => {
      const manifest = createValidManifest({ signature: 'abc' });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature is not valid base64');
    });

    it('should return invalid for signature too short after decode (<32 bytes)', async () => {
      // 8 chars base64 => 6 bytes decoded, which is < 32
      const shortSig = createBase64Signature(6);
      const manifest = createValidManifest({ signature: shortSig });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Signature too short: minimum 32 bytes required');
    });

    it('should compute consistent manifest hash', async () => {
      const manifest = createValidManifest();
      const result1 = await verifier.verifyModuleSignature(manifest);
      const result2 = await verifier.verifyModuleSignature(manifest);

      expect(result1.manifestHash).toBeDefined();
      expect(result1.manifestHash).toBe(result2.manifestHash);
    });

    it('should produce different hashes for different manifests', async () => {
      const manifest1 = createValidManifest({ name: 'Module A' });
      const manifest2 = createValidManifest({ name: 'Module B' });

      const result1 = await verifier.verifyModuleSignature(manifest1);
      const result2 = await verifier.verifyModuleSignature(manifest2);

      expect(result1.manifestHash).toBeDefined();
      expect(result2.manifestHash).toBeDefined();
      expect(result1.manifestHash).not.toBe(result2.manifestHash);
    });

    it('should accept signedAt within validity period', async () => {
      const manifest = createValidManifest({
        signedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
      });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
    });

    it('should return invalid for signedAt beyond validity period', async () => {
      const manifest = createValidManifest({
        signedAt: Date.now() - (366 * 24 * 60 * 60 * 1000), // >1 year ago
      });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Module signature has expired');
    });

    it('should accept manifest with missing signedAt (no expiry check)', async () => {
      const manifest = createValidManifest();
      // signedAt is undefined by default
      expect(manifest.signedAt).toBeUndefined();

      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
    });

    it('should populate signer from manifest.author', async () => {
      const manifest = createValidManifest({ author: 'Acme Corp' });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.signer).toBe('Acme Corp');
    });

    it('should default signer to unknown when author is missing', async () => {
      const manifest = createValidManifest({ author: undefined });
      const result = await verifier.verifyModuleSignature(manifest);

      expect(result.valid).toBe(true);
      expect(result.signer).toBe('unknown');
    });
  });

  // ---------------------------------------------------------------------------
  // isValidBase64()
  // ---------------------------------------------------------------------------

  describe('isValidBase64()', () => {
    it('should return true for valid standard base64', async () => {
      const base64 = btoa('hello world');
      expect(verifier.isValidBase64(base64)).toBe(true);
    });

    it('should return true for valid URL-safe base64', async () => {
      // URL-safe base64 uses - and _ instead of + and /
      expect(verifier.isValidBase64('YWJj-ZGVm_Z2hp')).toBe(true);
    });

    it('should return false for empty string', async () => {
      expect(verifier.isValidBase64('')).toBe(false);
    });

    it('should return false for too-short string (<4 chars)', async () => {
      expect(verifier.isValidBase64('abc')).toBe(false);
      expect(verifier.isValidBase64('ab')).toBe(false);
      expect(verifier.isValidBase64('a')).toBe(false);
    });
  });
});
