/**
 * CryptoAdapter Test Suite
 * Tests parameter validation guards, hash algorithms, AES-256-GCM encrypt/decrypt
 * round-trips, key generation, signature verification, and secure storage.
 */

import { CryptoAdapter } from '../../src/kernel/identity/CryptoAdapter';
import { SDKError } from '../../src/kernel/errors/SDKError';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CryptoAdapter', () => {
  let crypto: CryptoAdapter;

  beforeEach(() => {
    crypto = new CryptoAdapter();
  });

  // ---------------------------------------------------------------------------
  // hash()
  // ---------------------------------------------------------------------------

  describe('hash()', () => {
    it('should produce consistent hex output for SHA-256', async () => {
      const hash1 = await crypto.hash('hello world', 'SHA-256');
      const hash2 = await crypto.hash('hello world', 'SHA-256');

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('SHA-384 produces different hash than SHA-256', async () => {
      const sha256Result = await crypto.hash('test data', 'SHA-256');
      const sha384Result = await crypto.hash('test data', 'SHA-384');

      expect(sha384Result).not.toBe(sha256Result);
      expect(sha384Result).toMatch(/^[0-9a-f]{96}$/);
    });

    it('SHA-512 produces different hash than SHA-256', async () => {
      const sha256Result = await crypto.hash('test data', 'SHA-256');
      const sha512Result = await crypto.hash('test data', 'SHA-512');

      expect(sha512Result).not.toBe(sha256Result);
      expect(sha512Result).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should throw SDKError when data is empty', async () => {
      await expect(crypto.hash('', 'SHA-256')).rejects.toThrow(SDKError);
      await expect(crypto.hash('', 'SHA-256')).rejects.toThrow(
        'hash() requires a non-empty string for data',
      );
    });

    it('should throw SDKError when data is not a string', async () => {
      await expect(
        crypto.hash(123 as unknown as string, 'SHA-256'),
      ).rejects.toThrow(SDKError);
    });

    it('should throw SDKError for invalid algorithm', async () => {
      await expect(
        crypto.hash('data', 'MD5' as unknown as 'SHA-256'),
      ).rejects.toThrow(SDKError);
      await expect(
        crypto.hash('data', 'MD5' as unknown as 'SHA-256'),
      ).rejects.toThrow('unsupported algorithm');
    });
  });

  // ---------------------------------------------------------------------------
  // encrypt() / decrypt() — AES-256-GCM
  // ---------------------------------------------------------------------------

  describe('encrypt() / decrypt()', () => {
    it('should round-trip produce original data', async () => {
      const original = 'sensitive data here';
      const key = 'test-key-123';

      const encrypted = await crypto.encrypt(original, key);
      const decrypted = await crypto.decrypt(encrypted, key);

      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext each time (random IV)', async () => {
      const data = 'same data';
      const key = 'same-key';

      const encrypted1 = await crypto.encrypt(data, key);
      const encrypted2 = await crypto.encrypt(data, key);

      // Different IVs mean different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to the same plaintext
      expect(await crypto.decrypt(encrypted1, key)).toBe(data);
      expect(await crypto.decrypt(encrypted2, key)).toBe(data);
    });

    it('should handle long data', async () => {
      const longData = 'x'.repeat(10000);
      const key = 'long-data-key';

      const encrypted = await crypto.encrypt(longData, key);
      const decrypted = await crypto.decrypt(encrypted, key);

      expect(decrypted).toBe(longData);
    });

    it('should handle unicode data', async () => {
      const unicodeData = 'Hello 世界 🌍 مرحبا';
      const key = 'unicode-key';

      const encrypted = await crypto.encrypt(unicodeData, key);
      const decrypted = await crypto.decrypt(encrypted, key);

      expect(decrypted).toBe(unicodeData);
    });

    it('should throw SDKError when encrypt data is empty', async () => {
      await expect(crypto.encrypt('', 'key')).rejects.toThrow(SDKError);
      await expect(crypto.encrypt('', 'key')).rejects.toThrow(
        'encrypt() requires a non-empty string for data',
      );
    });

    it('should throw SDKError when encrypt key is empty', async () => {
      await expect(crypto.encrypt('data', '')).rejects.toThrow(SDKError);
      await expect(crypto.encrypt('data', '')).rejects.toThrow(
        'encrypt() requires a non-empty string for key',
      );
    });

    it('should throw SDKError when decrypt ciphertext is empty', async () => {
      await expect(crypto.decrypt('', 'key')).rejects.toThrow(SDKError);
      await expect(crypto.decrypt('', 'key')).rejects.toThrow(
        'decrypt() requires a non-empty string for ciphertext',
      );
    });

    it('should throw SDKError when decrypt key is empty', async () => {
      await expect(crypto.decrypt('ciphertext', '')).rejects.toThrow(SDKError);
      await expect(crypto.decrypt('ciphertext', '')).rejects.toThrow(
        'decrypt() requires a non-empty string for key',
      );
    });

    it('should throw on key mismatch during decrypt', async () => {
      const encrypted = await crypto.encrypt('data', 'correct-key');

      await expect(crypto.decrypt(encrypted, 'wrong-key')).rejects.toThrow(
        'Decryption failed: key mismatch',
      );
    });

    it('should throw on corrupted ciphertext', async () => {
      await expect(crypto.decrypt('not-valid-base64!!!', 'key')).rejects.toThrow();
    });

    it('should throw on truncated ciphertext', async () => {
      // base64 of only a few bytes (less than IV_LENGTH)
      const tooShort = btoa('short');
      await expect(crypto.decrypt(tooShort, 'key')).rejects.toThrow('ciphertext too short');
    });
  });

  // ---------------------------------------------------------------------------
  // generateKey()
  // ---------------------------------------------------------------------------

  describe('generateKey()', () => {
    it('should return a non-empty string', async () => {
      const key = await crypto.generateKey();

      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('should return a 64-char hex string (256-bit key)', async () => {
      const key = await crypto.generateKey();

      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return unique values on multiple calls', async () => {
      const key1 = await crypto.generateKey();
      const key2 = await crypto.generateKey();

      expect(key1).not.toBe(key2);
    });
  });

  // ---------------------------------------------------------------------------
  // verifySignature()
  // ---------------------------------------------------------------------------

  describe('verifySignature()', () => {
    it('should return true for valid base64 signature (structural fallback)', async () => {
      const validBase64 = btoa('valid signature content');
      const result = await crypto.verifySignature('data', validBase64, 'public-key');

      expect(result).toBe(true);
    });

    it('should return false for invalid base64 signature', async () => {
      const result = await crypto.verifySignature('data', '!!!invalid!!!', 'public-key');

      expect(result).toBe(false);
    });

    it('should verify with WebCrypto when PEM public key provided', async () => {
      // Generate a real RSA key pair for testing
      const keyPair = await globalThis.crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
      );

      // Sign data
      const data = JSON.stringify({ id: 'com.test.module', version: '1.0.0' });
      const encoder = new TextEncoder();
      const sigBuffer = await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, encoder.encode(data));
      const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

      // Export public key as PEM
      const pubDer = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubDer)));
      const pemLines = pubB64.match(/.{1,64}/g) ?? [];
      const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${pemLines.join('\n')}\n-----END PUBLIC KEY-----`;

      // Verify
      const result = await crypto.verifySignature(data, signature, publicKeyPem);
      expect(result).toBe(true);

      // Verify with wrong data fails
      const wrongResult = await crypto.verifySignature('wrong data', signature, publicKeyPem);
      expect(wrongResult).toBe(false);
    });

    it('should throw SDKError when data is empty', async () => {
      await expect(
        crypto.verifySignature('', 'sig', 'key'),
      ).rejects.toThrow(SDKError);
    });

    it('should throw SDKError when signature is empty', async () => {
      await expect(
        crypto.verifySignature('data', '', 'key'),
      ).rejects.toThrow(SDKError);
    });

    it('should throw SDKError when publicKey is empty', async () => {
      await expect(
        crypto.verifySignature('data', 'sig', ''),
      ).rejects.toThrow(SDKError);
    });
  });

  // ---------------------------------------------------------------------------
  // secureStore() / secureRetrieve() / secureDelete()
  // ---------------------------------------------------------------------------

  describe('secureStore() / secureRetrieve() / secureDelete()', () => {
    it('should round-trip store and retrieve a value', async () => {
      await crypto.secureStore('my-key', 'my-secret-value');

      const retrieved = await crypto.secureRetrieve('my-key');
      expect(retrieved).toBe('my-secret-value');
    });

    it('should return null for non-existent key', async () => {
      const result = await crypto.secureRetrieve('nonexistent-key');
      expect(result).toBeNull();
    });

    it('should remove stored key on delete', async () => {
      await crypto.secureStore('delete-me', 'value');
      expect(await crypto.secureRetrieve('delete-me')).toBe('value');

      await crypto.secureDelete('delete-me');
      expect(await crypto.secureRetrieve('delete-me')).toBeNull();
    });

    it('should throw SDKError when secureStore key is empty', async () => {
      await expect(crypto.secureStore('', 'value')).rejects.toThrow(SDKError);
      await expect(crypto.secureStore('', 'value')).rejects.toThrow(
        'secureStore() requires a non-empty string for key',
      );
    });

    it('should throw SDKError when secureRetrieve key is empty', async () => {
      await expect(crypto.secureRetrieve('')).rejects.toThrow(SDKError);
    });

    it('should throw SDKError when secureDelete key is empty', async () => {
      await expect(crypto.secureDelete('')).rejects.toThrow(SDKError);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-compatibility: SDK decrypt ↔ Node.js encrypt
  // ---------------------------------------------------------------------------

  describe('cross-compatibility with Node.js crypto', () => {
    it('should decrypt data encrypted with Node.js crypto module (matching backend)', async () => {
      // Simulate what the backend's encryptForSDK() does
      const { pbkdf2Sync, createCipheriv, randomBytes } = require('crypto');
      const passphrase = 'test-encryption-key';
      const plaintext = 'https://api.vendor.com/tokens';

      // Backend encryption (matches registry/service.ts encryptForSDK)
      const derivedKey = pbkdf2Sync(passphrase, 'enterprise-module-sdk-v1', 100_000, 32, 'sha256');
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const combined = Buffer.concat([iv, encrypted, authTag]);
      const ciphertext = combined.toString('base64');

      // SDK decryption
      const decrypted = await crypto.decrypt(ciphertext, passphrase);
      expect(decrypted).toBe(plaintext);
    });
  });
});
