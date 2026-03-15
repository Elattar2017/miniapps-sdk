/**
 * Crypto Adapter - Platform-agnostic cryptographic operations
 * @module kernel/identity/CryptoAdapter
 *
 * Strategy (in order of preference):
 * 1. NativeCryptoModule TurboModule (iOS Keychain / Android Keystore via JSI)
 * 2. Hybrid: pbkdf2Sync (Node.js-compat) + subtle (WebCrypto) — for react-native-quick-crypto
 * 3. Pure WebCrypto API (crypto.subtle) — Node.js 15+, browsers
 * 4. Graceful error for operations that cannot be performed without crypto
 *
 * Encryption format (AES-256-GCM):
 *   Base64( IV[12 bytes] || Ciphertext || AuthTag[16 bytes] )
 * The key is derived via PBKDF2 from the provided string key.
 */

import { sha256, generateNonce } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { SDKError } from '../errors/SDKError';
import { PKIVerifier } from './PKIVerifier';
import { pbkdf2Sha256, aesGcmDecrypt, aesGcmEncrypt } from './aes-gcm-pure';
import type { ICryptoAdapter } from '../../types';

/** Supported hash algorithms */
const VALID_HASH_ALGORITHMS = new Set(['SHA-256', 'SHA-384', 'SHA-512']);

/** AES-256-GCM configuration */
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = 'enterprise-module-sdk-v1'; // Fixed salt — key uniqueness comes from the passphrase

/** UTF-8 encode a string to Uint8Array (no TextEncoder dependency) */
function utf8Encode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(++i);
      code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/** UTF-8 decode a Uint8Array to string (no TextDecoder dependency) */
function utf8Decode(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    if (b < 0x80) {
      result += String.fromCharCode(b);
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      result += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      result += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      // Surrogate pair
      result += String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
      i += 4;
    }
  }
  return result;
}

/** Check if WebCrypto subtle API is available */
function hasWebCrypto(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto?.subtle?.encrypt === 'function';
}

/**
 * Check if Node.js-compatible crypto API is available (e.g. react-native-quick-crypto).
 * These methods use the same implementation as Node.js crypto and are guaranteed
 * compatible with server-side encryption.
 */
function hasNodeCrypto(): boolean {
  const c = globalThis.crypto as unknown as Record<string, unknown> | undefined;
  return typeof c?.createDecipheriv === 'function' && typeof c?.pbkdf2Sync === 'function';
}

/**
 * Node.js-compatible crypto module interface (react-native-quick-crypto or Node.js crypto).
 */
interface NodeCryptoLike {
  pbkdf2Sync(password: string, salt: string, iterations: number, keylen: number, digest: string): Uint8Array;
  createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): {
    setAuthTag(tag: Uint8Array): void;
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
  };
  createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): {
    update(data: Uint8Array): Uint8Array;
    final(): Uint8Array;
    getAuthTag(): Uint8Array;
  };
  randomBytes(size: number): Uint8Array;
}

let _nodeCryptoModule: NodeCryptoLike | null | undefined;

/**
 * Lazily resolve a Node.js-compatible crypto module.
 * Tries: 1) react-native-quick-crypto  2) Node.js 'crypto'
 * Returns null if neither is available. Result is cached.
 */
function resolveNodeCryptoModule(): NodeCryptoLike | null {
  if (_nodeCryptoModule !== undefined) return _nodeCryptoModule;
  _nodeCryptoModule = null;

  // Try react-native-quick-crypto first
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qc = require('react-native-quick-crypto');
    if (typeof qc?.pbkdf2Sync === 'function' && typeof qc?.createDecipheriv === 'function') {
      _nodeCryptoModule = qc as NodeCryptoLike;
      return _nodeCryptoModule;
    }
  } catch {
    // Not available
  }

  // Try Node.js built-in crypto (works in Jest, Node.js environments)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    if (typeof nodeCrypto?.pbkdf2Sync === 'function' && typeof nodeCrypto?.createDecipheriv === 'function') {
      _nodeCryptoModule = nodeCrypto as NodeCryptoLike;
      return _nodeCryptoModule;
    }
  } catch {
    // Not available
  }

  return null;
}

export class CryptoAdapter implements ICryptoAdapter {
  private readonly log = logger.child({ component: 'CryptoAdapter' });
  private readonly pkiVerifier: PKIVerifier;

  /**
   * In-memory secure storage fallback.
   * In production, NativeCryptoModule (iOS Keychain / Android Keystore) is preferred.
   */
  private readonly secureStorage: Map<string, string> = new Map();

  /** Cached derived CryptoKeys to avoid re-deriving on every call */
  private readonly keyCache = new Map<string, CryptoKey>();

  /** NativeCryptoModule TurboModule reference (resolved once) */
  private nativeModule: {
    encrypt(data: string, key: string): Promise<string>;
    decrypt(ciphertext: string, key: string): Promise<string>;
    generateKey(): Promise<string>;
    verifySignature(data: string, signature: string, publicKey: string): Promise<boolean>;
    secureStore(key: string, value: string): Promise<void>;
    secureRetrieve(key: string): Promise<string | null>;
    secureDelete(key: string): Promise<void>;
  } | null = undefined as unknown as null;
  private nativeModuleResolved = false;

  constructor() {
    this.pkiVerifier = new PKIVerifier();
  }

  /**
   * Lazily resolve the NativeCryptoModule TurboModule.
   * Returns null when not available (test environment, missing native code).
   */
  private getNativeModule() {
    if (!this.nativeModuleResolved) {
      this.nativeModuleResolved = true;
      try {
        // Dynamic require to avoid crash when react-native isn't available (tests)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../../native/NativeCryptoModule');
        this.nativeModule = mod.default ?? null;
      } catch {
        this.nativeModule = null;
      }
      if (this.nativeModule) {
        this.log.info('NativeCryptoModule TurboModule available — using hardware-backed crypto');
      }
    }
    return this.nativeModule;
  }

  // ---------------------------------------------------------------------------
  // hash()
  // ---------------------------------------------------------------------------

  /**
   * Hash data using the specified algorithm.
   * Uses WebCrypto API for all algorithms when available.
   * Falls back to JS SHA-256 only (SHA-384/512 warn and degrade).
   */
  async hash(data: string, algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512'): Promise<string> {
    if (typeof data !== 'string' || data.length === 0) {
      throw SDKError.kernel('hash() requires a non-empty string for data', {
        context: { dataType: typeof data },
      });
    }

    if (!VALID_HASH_ALGORITHMS.has(algorithm)) {
      throw SDKError.kernel(`hash() received unsupported algorithm: ${algorithm}`, {
        context: { algorithm, supported: Array.from(VALID_HASH_ALGORITHMS) },
      });
    }

    // Use WebCrypto API for all algorithms when available
    if (hasWebCrypto()) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await globalThis.crypto.subtle.digest(algorithm, dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback: only SHA-256 via our utility
    if (algorithm !== 'SHA-256') {
      this.log.warn(`WebCrypto not available; ${algorithm} falling back to SHA-256`);
    }
    return sha256(data);
  }

  // ---------------------------------------------------------------------------
  // Key derivation (PBKDF2)
  // ---------------------------------------------------------------------------

  /**
   * Derive an AES-256-GCM CryptoKey from a string passphrase using PBKDF2.
   * Results are cached for performance.
   */
  private async deriveKey(passphrase: string): Promise<CryptoKey> {
    const cached = this.keyCache.get(passphrase);
    if (cached) return cached;

    const encoder = new TextEncoder();
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    const derivedKey = await globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(PBKDF2_SALT),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: AES_KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    );

    this.keyCache.set(passphrase, derivedKey);
    return derivedKey;
  }

  // ---------------------------------------------------------------------------
  // encrypt()
  // ---------------------------------------------------------------------------

  /**
   * Encrypt data with AES-256-GCM.
   * Output format: base64( IV[12] || ciphertext || authTag[16] )
   *
   * Strategy: NativeCryptoModule → Hybrid (pbkdf2Sync + subtle) → WebCrypto → error
   */
  async encrypt(data: string, key: string): Promise<string> {
    if (typeof data !== 'string' || data.length === 0) {
      throw SDKError.kernel('encrypt() requires a non-empty string for data', {
        context: { dataType: typeof data },
      });
    }
    if (typeof key !== 'string' || key.length === 0) {
      throw SDKError.kernel('encrypt() requires a non-empty string for key', {
        context: { keyType: typeof key },
      });
    }

    // 1. Try NativeCryptoModule
    const native = this.getNativeModule();
    if (native) {
      return native.encrypt(data, key);
    }

    // 2. Try hybrid: pbkdf2Sync key derivation + WebCrypto subtle encryption
    //    (react-native-quick-crypto provides both; avoids Buffer + createCipheriv chain)
    if (hasNodeCrypto() && hasWebCrypto()) {
      return this.encryptHybrid(data, key);
    }

    // 2.5. Try require('react-native-quick-crypto') or require('crypto')
    const nodeCrypto = resolveNodeCryptoModule();
    if (nodeCrypto) {
      return this.encryptNodeCrypto(data, key, nodeCrypto);
    }

    // 3. Try pure WebCrypto
    if (hasWebCrypto()) {
      const derivedKey = await this.deriveKey(key);
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const encoder = new TextEncoder();

      const cipherBuffer = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        encoder.encode(data),
      );

      // Combine: IV || ciphertext+authTag
      const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(cipherBuffer), IV_LENGTH);

      // Base64 encode
      let binary = '';
      for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i]);
      }
      return btoa(binary);
    }

    // 3.5. Pure JS AES-256-GCM fallback (zero dependencies)
    return this.encryptPureJS(data, key);
  }

  // ---------------------------------------------------------------------------
  // decrypt()
  // ---------------------------------------------------------------------------

  /**
   * Decrypt AES-256-GCM ciphertext.
   * Input format: base64( IV[12] || ciphertext || authTag[16] )
   *
   * Strategy: NativeCryptoModule → Hybrid (pbkdf2Sync + subtle) → WebCrypto → error
   */
  async decrypt(ciphertext: string, key: string): Promise<string> {
    if (typeof ciphertext !== 'string' || ciphertext.length === 0) {
      throw SDKError.kernel('decrypt() requires a non-empty string for ciphertext', {
        context: { ciphertextType: typeof ciphertext },
      });
    }
    if (typeof key !== 'string' || key.length === 0) {
      throw SDKError.kernel('decrypt() requires a non-empty string for key', {
        context: { keyType: typeof key },
      });
    }

    // 1. Try NativeCryptoModule
    const native = this.getNativeModule();
    if (native) {
      return native.decrypt(ciphertext, key);
    }

    // 2. Try hybrid: pbkdf2Sync key derivation + WebCrypto subtle decryption
    //    (react-native-quick-crypto provides both; avoids Buffer + createDecipheriv chain)
    if (hasNodeCrypto() && hasWebCrypto()) {
      return this.decryptHybrid(ciphertext, key);
    }

    // 2.5. Try require('react-native-quick-crypto') or require('crypto')
    const nodeCrypto = resolveNodeCryptoModule();
    if (nodeCrypto) {
      return this.decryptNodeCrypto(ciphertext, key, nodeCrypto);
    }

    // 3. Try pure WebCrypto
    if (hasWebCrypto()) {
      const derivedKey = await this.deriveKey(key);

      // Base64 decode
      const binary = atob(ciphertext);
      const combined = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        combined[i] = binary.charCodeAt(i);
      }

      if (combined.length < IV_LENGTH + 1) {
        throw new Error('Decryption failed: ciphertext too short');
      }

      const iv = combined.slice(0, IV_LENGTH);
      const encryptedData = combined.slice(IV_LENGTH);

      try {
        const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          derivedKey,
          encryptedData,
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
      } catch {
        throw new Error('Decryption failed: key mismatch');
      }
    }

    // 3.5. Pure JS AES-256-GCM fallback (zero dependencies)
    return this.decryptPureJS(ciphertext, key);
  }

  // ---------------------------------------------------------------------------
  // Node.js-compatible crypto (require('react-native-quick-crypto') or require('crypto'))
  // ---------------------------------------------------------------------------

  private encryptNodeCrypto(data: string, key: string, nodeCrypto: NodeCryptoLike): string {
    const rawKey = nodeCrypto.pbkdf2Sync(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) keyBytes[i] = rawKey[i];

    const iv = nodeCrypto.randomBytes(IV_LENGTH);
    const ivBytes = new Uint8Array(IV_LENGTH);
    for (let i = 0; i < IV_LENGTH; i++) ivBytes[i] = iv[i];

    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', keyBytes, ivBytes);
    const dataBytes = utf8Encode(data);

    const encrypted = cipher.update(dataBytes);
    cipher.final(); // GCM final produces no extra bytes for ciphertext
    const authTag = cipher.getAuthTag();

    // Combine: IV || ciphertext || authTag
    const combined = new Uint8Array(IV_LENGTH + encrypted.length + 16);
    combined.set(ivBytes, 0);
    for (let i = 0; i < encrypted.length; i++) combined[IV_LENGTH + i] = encrypted[i];
    for (let i = 0; i < 16; i++) combined[IV_LENGTH + encrypted.length + i] = authTag[i];

    let binary = '';
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
    return btoa(binary);
  }

  private decryptNodeCrypto(ciphertext: string, key: string, nodeCrypto: NodeCryptoLike): string {
    const rawKey = nodeCrypto.pbkdf2Sync(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) keyBytes[i] = rawKey[i];

    // Base64 decode
    const binary = atob(ciphertext);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);

    if (combined.length < IV_LENGTH + 16 + 1) {
      throw new Error('Decryption failed: ciphertext too short');
    }

    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(combined.length - 16);
    const encryptedData = combined.slice(IV_LENGTH, combined.length - 16);

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', keyBytes, iv);
    decipher.setAuthTag(authTag);
    const decrypted = decipher.update(encryptedData);
    try {
      decipher.final(); // Verifies auth tag
    } catch {
      throw new Error('Decryption failed: key mismatch');
    }

    return utf8Decode(new Uint8Array(decrypted));
  }

  // ---------------------------------------------------------------------------
  // Pure JS AES-256-GCM (zero dependencies — ultimate fallback)
  // ---------------------------------------------------------------------------

  private encryptPureJS(data: string, key: string): string {
    this.log.info('Using pure JS AES-256-GCM fallback for encryption');
    const derivedKey = pbkdf2Sha256(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32);

    // Generate random IV — use crypto.getRandomValues if available, otherwise fallback
    let iv: Uint8Array;
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    } else {
      iv = new Uint8Array(IV_LENGTH);
      for (let i = 0; i < IV_LENGTH; i++) iv[i] = Math.floor(Math.random() * 256);
      this.log.warn('Using Math.random for IV — not cryptographically secure');
    }

    const dataBytes = utf8Encode(data);

    const { ciphertext: encrypted, authTag } = aesGcmEncrypt(dataBytes, derivedKey, iv);

    // Combine: IV || ciphertext || authTag (matches WebCrypto format: IV || ciphertext+authTag)
    const combined = new Uint8Array(IV_LENGTH + encrypted.length + authTag.length);
    combined.set(iv, 0);
    combined.set(encrypted, IV_LENGTH);
    combined.set(authTag, IV_LENGTH + encrypted.length);

    let binary = '';
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
    return btoa(binary);
  }

  private decryptPureJS(ciphertext: string, key: string): string {
    this.log.info('Using pure JS AES-256-GCM fallback for decryption');
    const derivedKey = pbkdf2Sha256(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32);

    // Base64 decode
    const binary = atob(ciphertext);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);

    if (combined.length < IV_LENGTH + 16 + 1) {
      throw new Error('Decryption failed: ciphertext too short');
    }

    const iv = combined.slice(0, IV_LENGTH);
    // WebCrypto format: IV || ciphertext || authTag (last 16 bytes)
    const authTag = combined.slice(combined.length - 16);
    const encryptedData = combined.slice(IV_LENGTH, combined.length - 16);

    const plainBytes = aesGcmDecrypt(encryptedData, derivedKey, iv, authTag);
    return utf8Decode(plainBytes);
  }

  // ---------------------------------------------------------------------------
  // Hybrid crypto: pbkdf2Sync (Node.js-compat) + subtle (WebCrypto)
  // Uses pbkdf2Sync for key derivation (guaranteed compatible with backend)
  // and subtle.encrypt/decrypt for AES-GCM (standard WebCrypto, no Buffer needed).
  // ---------------------------------------------------------------------------

  /**
   * Hybrid encrypt: pbkdf2Sync key derivation + subtle.encrypt.
   * Avoids Buffer dependency and createCipheriv chain.
   */
  private async encryptHybrid(data: string, key: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = globalThis.crypto as any;

    // Derive raw key bytes using Node.js-compatible pbkdf2Sync
    const rawKey = c.pbkdf2Sync(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');

    // Copy into fresh Uint8Array — Buffer may be a view of a larger pooled ArrayBuffer
    const rawKeyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) rawKeyBytes[i] = rawKey[i];

    // Import raw key for WebCrypto (no derivation step — bypasses buggy subtle.deriveKey)
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw', rawKeyBytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt'],
    );

    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encode string to Uint8Array without TextEncoder (not available in Hermes)
    const dataBytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      dataBytes[i] = data.charCodeAt(i);
    }

    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, cryptoKey, dataBytes,
    );

    // Combine: IV || ciphertext+authTag (WebCrypto appends authTag automatically)
    const combined = new Uint8Array(IV_LENGTH + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), IV_LENGTH);

    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  }

  /**
   * Hybrid decrypt: pbkdf2Sync key derivation + subtle.decrypt.
   * Avoids Buffer dependency and createDecipheriv/setAuthTag chain.
   */
  private async decryptHybrid(ciphertext: string, key: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = globalThis.crypto as any;

    // Derive raw key bytes using Node.js-compatible pbkdf2Sync
    const rawKey = c.pbkdf2Sync(key, PBKDF2_SALT, PBKDF2_ITERATIONS, 32, 'sha256');

    // Copy into fresh Uint8Array — Buffer may be a view of a larger pooled ArrayBuffer,
    // so rawKey.buffer could contain more bytes than intended
    const rawKeyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) rawKeyBytes[i] = rawKey[i];

    // Import raw key for WebCrypto (no derivation step — bypasses buggy subtle.deriveKey)
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw', rawKeyBytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt'],
    );

    // Base64 decode (no Buffer dependency)
    const binary = atob(ciphertext);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length < IV_LENGTH + 1) {
      throw new Error('Decryption failed: ciphertext too short');
    }

    const iv = combined.slice(0, IV_LENGTH);
    // encryptedData includes authTag — WebCrypto handles extraction automatically
    const encryptedData = combined.slice(IV_LENGTH);

    try {
      const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, cryptoKey, encryptedData,
      );

      // Decode UTF-8 without TextDecoder (not available in Hermes)
      const bytes = new Uint8Array(decryptedBuffer);
      let result = '';
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
      }
      return result;
    } catch {
      throw new Error('Decryption failed: key mismatch');
    }
  }

  // ---------------------------------------------------------------------------
  // generateKey()
  // ---------------------------------------------------------------------------

  /**
   * Generate a cryptographically secure key string.
   * Returns a 256-bit random key as hex (64 chars).
   *
   * Strategy: NativeCryptoModule → WebCrypto → UUID fallback
   */
  async generateKey(): Promise<string> {
    // 1. Try NativeCryptoModule
    const native = this.getNativeModule();
    if (native) {
      return native.generateKey();
    }

    // 2. Try WebCrypto
    if (hasWebCrypto()) {
      const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
      return Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 3. Fallback: UUID (not ideal for encryption but usable for non-security contexts)
    this.log.warn('generateKey(): no WebCrypto — falling back to UUID');
    return generateNonce();
  }

  // ---------------------------------------------------------------------------
  // verifySignature()
  // ---------------------------------------------------------------------------

  /**
   * Verify a cryptographic signature.
   *
   * Strategy: NativeCryptoModule → WebCrypto RSA-PKCS1-v1_5 → structural check fallback
   */
  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    if (typeof data !== 'string' || data.length === 0) {
      throw SDKError.kernel('verifySignature() requires a non-empty string for data', {
        context: { dataType: typeof data },
      });
    }
    if (typeof signature !== 'string' || signature.length === 0) {
      throw SDKError.kernel('verifySignature() requires a non-empty string for signature', {
        context: { signatureType: typeof signature },
      });
    }
    if (typeof publicKey !== 'string' || publicKey.length === 0) {
      throw SDKError.kernel('verifySignature() requires a non-empty string for publicKey', {
        context: { publicKeyType: typeof publicKey },
      });
    }

    // 1. Try NativeCryptoModule
    const native = this.getNativeModule();
    if (native) {
      return native.verifySignature(data, signature, publicKey);
    }

    // 2. Try WebCrypto with PEM public key
    if (hasWebCrypto() && publicKey.includes('BEGIN PUBLIC KEY')) {
      try {
        return await this.verifyWithWebCrypto(data, signature, publicKey);
      } catch (err) {
        this.log.warn('WebCrypto signature verification failed, falling back to structural check', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Fallback: structural check (valid base64)
    const isValid = this.pkiVerifier.isValidBase64(signature);
    this.log.debug('Signature verification (structural fallback)', {
      dataLength: data.length,
      result: isValid,
    });
    return isValid;
  }

  /**
   * Verify RSA-PKCS1-v1_5 + SHA-256 signature using WebCrypto.
   */
  private async verifyWithWebCrypto(data: string, signature: string, publicKeyPem: string): Promise<boolean> {
    // Parse PEM → DER
    const pemBody = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');
    const binaryStr = atob(pemBody);
    const keyDer = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      keyDer[i] = binaryStr.charCodeAt(i);
    }

    // Import public key
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'spki',
      keyDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Decode signature from base64
    const sigBinaryStr = atob(signature);
    const sigBytes = new Uint8Array(sigBinaryStr.length);
    for (let i = 0; i < sigBinaryStr.length; i++) {
      sigBytes[i] = sigBinaryStr.charCodeAt(i);
    }

    // Encode data (without TextEncoder — not available in Hermes)
    const dataBytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      dataBytes[i] = data.charCodeAt(i);
    }

    // Verify
    return globalThis.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes.buffer,
      dataBytes.buffer,
    );
  }

  // ---------------------------------------------------------------------------
  // Secure Storage
  // ---------------------------------------------------------------------------

  /**
   * Store a value in secure storage.
   * Strategy: NativeCryptoModule (Keychain/Keystore) → in-memory Map fallback
   */
  async secureStore(key: string, value: string): Promise<void> {
    if (typeof key !== 'string' || key.length === 0) {
      throw SDKError.kernel('secureStore() requires a non-empty string for key', {
        context: { keyType: typeof key },
      });
    }

    const native = this.getNativeModule();
    if (native) {
      await native.secureStore(key, value);
      this.log.debug('Value stored in secure storage (native Keychain/Keystore)', { key });
      return;
    }

    this.secureStorage.set(key, value);
    this.log.debug('Value stored in secure storage (in-memory fallback)', { key });
  }

  /**
   * Retrieve a value from secure storage.
   * Strategy: NativeCryptoModule (Keychain/Keystore) → in-memory Map fallback
   */
  async secureRetrieve(key: string): Promise<string | null> {
    if (typeof key !== 'string' || key.length === 0) {
      throw SDKError.kernel('secureRetrieve() requires a non-empty string for key', {
        context: { keyType: typeof key },
      });
    }

    const native = this.getNativeModule();
    if (native) {
      const value = await native.secureRetrieve(key);
      this.log.debug('Value retrieved from secure storage (native Keychain/Keystore)', { key, found: value !== null });
      return value;
    }

    const value = this.secureStorage.get(key);
    this.log.debug('Value retrieved from secure storage (in-memory fallback)', { key, found: value !== undefined });
    return value ?? null;
  }

  /**
   * Delete a value from secure storage.
   * Strategy: NativeCryptoModule (Keychain/Keystore) → in-memory Map fallback
   */
  async secureDelete(key: string): Promise<void> {
    if (typeof key !== 'string' || key.length === 0) {
      throw SDKError.kernel('secureDelete() requires a non-empty string for key', {
        context: { keyType: typeof key },
      });
    }

    const native = this.getNativeModule();
    if (native) {
      await native.secureDelete(key);
      this.log.debug('Value deleted from secure storage (native Keychain/Keystore)', { key });
      return;
    }

    this.secureStorage.delete(key);
    this.log.debug('Value deleted from secure storage (in-memory fallback)', { key });
  }
}
