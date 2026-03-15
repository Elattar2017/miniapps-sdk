/**
 * BridgeAdapter Test Suite
 *
 * Tests for getNativeModule, isNativeModuleAvailable, initializeBridgeAdapter,
 * MockCryptoModule, and MockDeviceIntegrityModule.
 */

import {
  getNativeModule,
  isNativeModuleAvailable,
  initializeBridgeAdapter,
  MockCryptoModule,
  MockDeviceIntegrityModule,
  MockNetworkModule,
} from '../../src/adapters/BridgeAdapter';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getNativeModule
// ---------------------------------------------------------------------------

describe('getNativeModule', () => {
  it('returns a CryptoModule instance', () => {
    const crypto = getNativeModule('CryptoModule');
    expect(crypto).toBeDefined();
    expect(typeof crypto.hash).toBe('function');
    expect(typeof crypto.encrypt).toBe('function');
    expect(typeof crypto.decrypt).toBe('function');
    expect(typeof crypto.generateKey).toBe('function');
    expect(typeof crypto.verifySignature).toBe('function');
    expect(typeof crypto.secureStore).toBe('function');
    expect(typeof crypto.secureRetrieve).toBe('function');
    expect(typeof crypto.secureDelete).toBe('function');
  });

  it('returns a CryptoModule with isMock = true', () => {
    const crypto = getNativeModule('CryptoModule');
    expect(crypto.isMock).toBe(true);
  });

  it('returns a DeviceIntegrityModule instance', () => {
    const integrity = getNativeModule('DeviceIntegrityModule');
    expect(integrity).toBeDefined();
    expect(typeof integrity.attestDevice).toBe('function');
    expect(typeof integrity.verifyAttestation).toBe('function');
  });

  it('returns a DeviceIntegrityModule with isMock = true', () => {
    const integrity = getNativeModule('DeviceIntegrityModule');
    expect(integrity.isMock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MockCryptoModule
// ---------------------------------------------------------------------------

describe('MockCryptoModule', () => {
  let crypto: MockCryptoModule;

  beforeEach(() => {
    crypto = new MockCryptoModule();
  });

  it('hash() returns a deterministic string starting with algorithm prefix', async () => {
    const result = await crypto.hash('test-data', 'SHA-256');
    expect(typeof result).toBe('string');
    expect(result.startsWith('sha256:')).toBe(true);

    // Deterministic: same input should produce same hash
    const result2 = await crypto.hash('test-data', 'SHA-256');
    expect(result).toBe(result2);
  });

  it('hash() uses the correct algorithm prefix', async () => {
    const sha384 = await crypto.hash('data', 'SHA-384');
    expect(sha384.startsWith('sha384:')).toBe(true);

    const sha512 = await crypto.hash('data', 'SHA-512');
    expect(sha512.startsWith('sha512:')).toBe(true);
  });

  it('encrypt() and decrypt() round-trip returns original data', async () => {
    const key = 'my-secret-key-1234';
    const plaintext = 'Hello, World! This is sensitive data.';

    const ciphertext = await crypto.encrypt(plaintext, key);
    expect(typeof ciphertext).toBe('string');
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await crypto.decrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('generateKey() returns unique strings', async () => {
    const key1 = await crypto.generateKey();
    const key2 = await crypto.generateKey();

    expect(typeof key1).toBe('string');
    expect(typeof key2).toBe('string');
    expect(key1.length).toBeGreaterThan(0);
    expect(key2.length).toBeGreaterThan(0);
    expect(key1).not.toBe(key2);
  });

  it('verifySignature() returns false without valid crypto key (fail-closed)', async () => {
    // Without a real PEM public key and valid signature, verification should fail
    const result = await crypto.verifySignature('data', 'sig', 'not-a-real-pubkey');
    expect(result).toBe(false);
  });

  it('verifySignature() verifies real RSA signature via WebCrypto', async () => {
    // Generate a real RSA key pair for testing
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );

    // Export public key as PEM
    const pubKeyDer = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const pubKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(pubKeyDer)));
    const pubKeyPem = `-----BEGIN PUBLIC KEY-----\n${pubKeyBase64}\n-----END PUBLIC KEY-----`;

    // Sign some data
    const data = 'test data to verify';
    const dataBytes = new TextEncoder().encode(data);
    const sigBuffer = await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, dataBytes);
    const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const result = await crypto.verifySignature(data, sigBase64, pubKeyPem);
    expect(result).toBe(true);

    // Tampered data should fail
    const tampered = await crypto.verifySignature('tampered data', sigBase64, pubKeyPem);
    expect(tampered).toBe(false);
  });

  it('secureStore() and secureRetrieve() round-trip works', async () => {
    await crypto.secureStore('my-key', 'my-secret-value');
    const retrieved = await crypto.secureRetrieve('my-key');
    expect(retrieved).toBe('my-secret-value');
  });

  it('secureRetrieve() returns null for non-existent key', async () => {
    const result = await crypto.secureRetrieve('nonexistent-key');
    expect(result).toBeNull();
  });

  it('secureDelete() removes a stored value', async () => {
    await crypto.secureStore('delete-me', 'temporary-value');
    expect(await crypto.secureRetrieve('delete-me')).toBe('temporary-value');

    await crypto.secureDelete('delete-me');
    expect(await crypto.secureRetrieve('delete-me')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MockDeviceIntegrityModule
// ---------------------------------------------------------------------------

describe('MockDeviceIntegrityModule', () => {
  let integrity: MockDeviceIntegrityModule;

  beforeEach(() => {
    integrity = new MockDeviceIntegrityModule();
  });

  it('attestDevice() returns a string containing "mock-attestation-token"', async () => {
    const token = await integrity.attestDevice('test-challenge');
    expect(typeof token).toBe('string');
    expect(token).toContain('mock-attestation-token');
  });

  it('verifyAttestation() returns false (fail-closed without native module)', async () => {
    // Mock attestation tokens cannot be verified — returns false for security
    const mockToken = await integrity.attestDevice('challenge');
    const result = await integrity.verifyAttestation(mockToken);
    expect(result).toBe(false);
  });

  it('verifyAttestation() returns false for non-mock tokens too', async () => {
    // Even real-looking tokens can't be verified without native module
    const result = await integrity.verifyAttestation('real-attestation-token-xyz');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MockNetworkModule
// ---------------------------------------------------------------------------

describe('MockNetworkModule', () => {
  let network: MockNetworkModule;

  beforeEach(() => {
    network = new MockNetworkModule();
  });

  it('has isMock = true', () => {
    expect(network.isMock).toBe(true);
  });

  it('configurePins() does not throw', async () => {
    await expect(network.configurePins(JSON.stringify([
      { domain: 'api.example.com', pins: ['sha256/AAA='] },
    ]))).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNativeModule — NetworkModule
// ---------------------------------------------------------------------------

describe('getNativeModule — NetworkModule', () => {
  it('returns a NetworkModule instance with isMock = true', () => {
    const network = getNativeModule('NetworkModule');
    expect(network).toBeDefined();
    expect(network.isMock).toBe(true);
    expect(typeof network.fetch).toBe('function');
    expect(typeof network.configurePins).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// isNativeModuleAvailable
// ---------------------------------------------------------------------------

describe('isNativeModuleAvailable', () => {
  it('returns false for CryptoModule (Phase 1)', () => {
    expect(isNativeModuleAvailable('CryptoModule')).toBe(false);
  });

  it('returns false for DeviceIntegrityModule (Phase 1)', () => {
    expect(isNativeModuleAvailable('DeviceIntegrityModule')).toBe(false);
  });

  it('returns false for NetworkModule (Phase 1)', () => {
    expect(isNativeModuleAvailable('NetworkModule')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// initializeBridgeAdapter
// ---------------------------------------------------------------------------

describe('initializeBridgeAdapter', () => {
  it('runs without error', () => {
    expect(() => initializeBridgeAdapter()).not.toThrow();
  });

  it('second call is a no-op (idempotent)', () => {
    // First call initializes
    initializeBridgeAdapter();
    // Second call should not throw and should be a no-op
    expect(() => initializeBridgeAdapter()).not.toThrow();
  });
});
