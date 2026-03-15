/**
 * RevocationChecker Test Suite
 *
 * Tests CRL/OCSP certificate revocation checking, caching behavior,
 * fallback logic, and PKIVerifier integration.
 */

jest.mock('react-native');

import { RevocationChecker } from '../../../src/kernel/identity/RevocationChecker';
import { PKIVerifier } from '../../../src/kernel/identity/PKIVerifier';
import type { ModuleManifest, ICryptoAdapter } from '../../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.useFakeTimers({ now: 1700000000000 });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/**
 * Create a base64 string encoding `byteCount` bytes.
 */
function createBase64Signature(byteCount: number): string {
  const raw = 'a'.repeat(byteCount);
  return btoa(raw);
}

function createManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    id: 'com.test.module',
    name: 'Test Module',
    version: '1.0.0',
    description: 'Test',
    icon: 'test',
    category: 'test',
    entryScreen: 'main',
    screens: ['main'],
    permissions: { apis: [], storage: false },
    minSDKVersion: '1.0.0',
    signature: 'dGVzdHNpZ25hdHVyZXRlc3RzaWduYXR1cmV0ZXN0c2ln',
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

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe('RevocationChecker - Constructor', () => {
  it('should create with default config when no arguments provided', () => {
    const checker = new RevocationChecker();
    expect(checker).toBeDefined();
    expect(checker.getCacheSize()).toBe(0);
  });

  it('should create with CRL endpoint', () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });
    expect(checker).toBeDefined();
  });

  it('should create with all options configured', () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      ocspEndpoint: 'https://ocsp.example.com',
      cacheTTL: 60_000,
      allowOnFailure: false,
    });
    expect(checker).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CRL path
// ---------------------------------------------------------------------------
describe('RevocationChecker - CRL path', () => {
  it('should return not-revoked via CRL when crlEndpoint is configured', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
  });

  it('should return checkedVia CRL when crlEndpoint is configured', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    const result = await checker.checkRevocation(createManifest());
    expect(result.checkedVia).toBe('CRL');
  });

  it('should cache CRL result after successful check', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    const manifest = createManifest();
    await checker.checkRevocation(manifest);

    // CRL check should have populated the cache
    expect(checker.getCacheSize()).toBe(1);

    // Second call should return from cache (proving CRL was executed and cached)
    const second = await checker.checkRevocation(manifest);
    expect(second.checkedVia).toBe('cache');
  });
});

// ---------------------------------------------------------------------------
// OCSP fallback
// ---------------------------------------------------------------------------
describe('RevocationChecker - OCSP fallback', () => {
  it('should fall back to OCSP when CRL endpoint is not configured', async () => {
    const checker = new RevocationChecker({
      ocspEndpoint: 'https://ocsp.example.com',
    });

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('OCSP');
  });

  it('should fall back to OCSP when CRL check throws', async () => {
    // Create a checker then force the CRL path to fail by overriding the private method
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      ocspEndpoint: 'https://ocsp.example.com',
    });

    // Override private checkCRL to throw
    (checker as unknown as Record<string, unknown>)['checkCRL'] = jest.fn().mockRejectedValue(
      new Error('CRL endpoint unreachable'),
    );

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('OCSP');
  });

  it('should return checkedVia OCSP when only OCSP endpoint configured', async () => {
    const checker = new RevocationChecker({
      ocspEndpoint: 'https://ocsp.example.com',
    });

    const result = await checker.checkRevocation(createManifest());
    expect(result.checkedVia).toBe('OCSP');
  });
});

// ---------------------------------------------------------------------------
// Skip mode
// ---------------------------------------------------------------------------
describe('RevocationChecker - Skip mode', () => {
  it('should return not-revoked with checkedVia skipped when no endpoints configured', async () => {
    const checker = new RevocationChecker();

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('skipped');
  });

  it('should handle manifest with undefined signature by using nosig in cache key', async () => {
    const checker = new RevocationChecker();

    // Force signature to be undefined to exercise the 'nosig' fallback in buildCacheKey
    const manifest = createManifest({ signature: undefined as unknown as string });
    const result = await checker.checkRevocation(manifest);
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('skipped');
  });

  it('should return revoked when allowOnFailure is false and no endpoints configured', async () => {
    const checker = new RevocationChecker({
      allowOnFailure: false,
    });

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(true);
    expect(result.reason).toBe('Revocation check required but unavailable');
  });
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
describe('RevocationChecker - Cache', () => {
  it('should return cached result on second call for the same manifest', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    const manifest = createManifest();
    const first = await checker.checkRevocation(manifest);
    const second = await checker.checkRevocation(manifest);

    expect(first.checkedVia).toBe('CRL');
    expect(second.checkedVia).toBe('cache');
  });

  it('should set checkedVia to cache for cached results', async () => {
    const checker = new RevocationChecker({
      ocspEndpoint: 'https://ocsp.example.com',
    });

    const manifest = createManifest();
    await checker.checkRevocation(manifest);
    const cached = await checker.checkRevocation(manifest);

    expect(cached.checkedVia).toBe('cache');
    expect(cached.revoked).toBe(false);
  });

  it('should expire cache after TTL and re-check', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      cacheTTL: 5000, // 5 seconds
    });

    const manifest = createManifest();

    // First call populates cache
    const first = await checker.checkRevocation(manifest);
    expect(first.checkedVia).toBe('CRL');

    // Second call within TTL returns cache
    jest.advanceTimersByTime(3000);
    const second = await checker.checkRevocation(manifest);
    expect(second.checkedVia).toBe('cache');

    // Third call after TTL expired should re-check via CRL
    jest.advanceTimersByTime(3000); // total 6s > 5s TTL
    const third = await checker.checkRevocation(manifest);
    expect(third.checkedVia).toBe('CRL');
  });

  it('should maintain separate cache entries for different module versions', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    const manifest1 = createManifest({ version: '1.0.0' });
    const manifest2 = createManifest({ version: '2.0.0' });

    await checker.checkRevocation(manifest1);
    await checker.checkRevocation(manifest2);

    expect(checker.getCacheSize()).toBe(2);
  });

  it('should clear all entries when clearCache is called', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    await checker.checkRevocation(createManifest({ id: 'module-a' }));
    await checker.checkRevocation(createManifest({ id: 'module-b' }));
    expect(checker.getCacheSize()).toBe(2);

    checker.clearCache();
    expect(checker.getCacheSize()).toBe(0);
  });

  it('should return correct cache size', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
    });

    expect(checker.getCacheSize()).toBe(0);

    await checker.checkRevocation(createManifest({ id: 'a' }));
    expect(checker.getCacheSize()).toBe(1);

    await checker.checkRevocation(createManifest({ id: 'b' }));
    expect(checker.getCacheSize()).toBe(2);

    await checker.checkRevocation(createManifest({ id: 'c' }));
    expect(checker.getCacheSize()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('RevocationChecker - Error handling', () => {
  it('should fall back to OCSP when CRL fails, and return OCSP result', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      ocspEndpoint: 'https://ocsp.example.com',
    });

    // Override private checkCRL to throw
    (checker as unknown as Record<string, unknown>)['checkCRL'] = jest.fn().mockRejectedValue(
      new Error('Network timeout'),
    );

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('OCSP');
  });

  it('should return skipped when both CRL and OCSP fail and allowOnFailure is true', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      ocspEndpoint: 'https://ocsp.example.com',
      allowOnFailure: true,
    });

    // Override both private methods to throw
    (checker as unknown as Record<string, unknown>)['checkCRL'] = jest.fn().mockRejectedValue(
      new Error('CRL unreachable'),
    );
    (checker as unknown as Record<string, unknown>)['checkOCSP'] = jest.fn().mockRejectedValue(
      new Error('OCSP unreachable'),
    );

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(false);
    expect(result.checkedVia).toBe('skipped');
  });

  it('should return revoked when both CRL and OCSP fail and allowOnFailure is false', async () => {
    const checker = new RevocationChecker({
      crlEndpoint: 'https://crl.example.com/ca.crl',
      ocspEndpoint: 'https://ocsp.example.com',
      allowOnFailure: false,
    });

    // Override both private methods to throw
    (checker as unknown as Record<string, unknown>)['checkCRL'] = jest.fn().mockRejectedValue(
      new Error('CRL unreachable'),
    );
    (checker as unknown as Record<string, unknown>)['checkOCSP'] = jest.fn().mockRejectedValue(
      new Error('OCSP unreachable'),
    );

    const result = await checker.checkRevocation(createManifest());
    expect(result.revoked).toBe(true);
    expect(result.reason).toBe('Revocation check required but unavailable');
  });
});

// ---------------------------------------------------------------------------
// PKIVerifier integration
// ---------------------------------------------------------------------------
describe('RevocationChecker - PKIVerifier integration', () => {
  it('should create RevocationChecker when PKIVerifier receives revocationConfig', () => {
    const verifier = new PKIVerifier({
      revocationConfig: {
        crlEndpoint: 'https://crl.example.com/ca.crl',
      },
    });

    // The revocationChecker is a private field; verify the verifier was created successfully
    expect(verifier).toBeDefined();
  });

  it('should call revocation check after successful crypto verification', async () => {
    const mockAdapter = createMockCryptoAdapter({
      verifySignature: jest.fn().mockResolvedValue(true),
    });

    const verifier = new PKIVerifier({
      cryptoAdapter: mockAdapter,
      publicKey: 'test-public-key',
      revocationConfig: {
        crlEndpoint: 'https://crl.example.com/ca.crl',
      },
    });

    const manifest = createManifest({
      signature: createBase64Signature(33),
      author: 'Test Author',
    });

    const result = await verifier.verifyModuleSignature(manifest);

    // Crypto verification passed and CRL returned not-revoked, so result should be valid
    expect(result.valid).toBe(true);
    expect(result.signer).toBe('Test Author');
  });

  it('should return invalid when RevocationChecker reports certificate as revoked', async () => {
    const mockAdapter = createMockCryptoAdapter({
      verifySignature: jest.fn().mockResolvedValue(true),
    });

    const verifier = new PKIVerifier({
      cryptoAdapter: mockAdapter,
      publicKey: 'test-public-key',
      revocationConfig: {
        // No endpoints configured + allowOnFailure false = always revoked
        allowOnFailure: false,
      },
    });

    const manifest = createManifest({
      signature: createBase64Signature(33),
    });

    const result = await verifier.verifyModuleSignature(manifest);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Certificate revoked');
  });

  it('should skip revocation check when PKIVerifier has no revocationConfig', async () => {
    const verifier = new PKIVerifier();

    const manifest = createManifest({
      signature: createBase64Signature(33),
      author: 'Test Author',
    });

    const result = await verifier.verifyModuleSignature(manifest);

    // Without revocationConfig, Phase 1 structural verification proceeds as usual
    expect(result.valid).toBe(true);
    expect(result.signer).toBe('Test Author');
  });
});
