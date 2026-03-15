/**
 * BridgeAdapter - Native Bridge Stability Layer for TurboModule/JSI communication
 *
 * Provides `getNativeModule(name)` which resolves platform-specific native modules.
 * Resolution order: real TurboModule (native) → mock fallback.
 *
 * Mock fallbacks use WebCrypto where available for security-critical operations
 * (signature verification). Device attestation mocks are fail-closed: verifyAttestation
 * returns false because mock attestation tokens cannot be cryptographically verified.
 *
 * @module adapters/BridgeAdapter
 */

import { logger } from '../utils/logger';
import type { ICryptoAdapter } from '../types';

const bridgeLogger = logger.child({ component: 'BridgeAdapter' });

// ---------------------------------------------------------------------------
// Native Module interfaces
// ---------------------------------------------------------------------------

/**
 * CryptoModule interface matching the native Swift/Kotlin TurboModule spec.
 */
interface NativeCryptoModule extends ICryptoAdapter {
  /** Check if the native module is a mock/stub */
  readonly isMock: boolean;
}

/**
 * DeviceIntegrityModule for App Attest (iOS) / Play Integrity (Android).
 * Mock fallback is fail-closed: verifyAttestation returns false.
 */
interface NativeDeviceIntegrityModule {
  readonly isMock: boolean;
  attestDevice(challenge: string): Promise<string>;
  verifyAttestation(token: string): Promise<boolean>;
}

/**
 * NetworkModule for native cert-pinned HTTP requests (TrustKit/OkHttp).
 */
interface NativeNetworkModule {
  readonly isMock: boolean;
  fetch(url: string, options: string): Promise<string>;
  configurePins(pins: string): Promise<void>;
}

/**
 * MediaModule for camera capture, photo library, and inline camera snapshots.
 */
interface NativeMediaModule {
  readonly isMock: boolean;
  captureImage(options: string): Promise<string>;
  pickFromLibrary(options: string): Promise<string>;
  captureFromView(cameraId: string, options: string): Promise<string>;
  checkCameraPermission(): Promise<string>;
  checkLibraryPermission(): Promise<string>;
  requestCameraPermission(): Promise<string>;
  requestLibraryPermission(): Promise<string>;
}

/**
 * Union of all known native modules.
 */
interface NativeModuleMap {
  CryptoModule: NativeCryptoModule;
  DeviceIntegrityModule: NativeDeviceIntegrityModule;
  NetworkModule: NativeNetworkModule;
  MediaModule: NativeMediaModule;
}

type NativeModuleName = keyof NativeModuleMap;

// ---------------------------------------------------------------------------
// Mock implementations (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Mock CryptoModule that returns deterministic placeholder values.
 * Replaced by real iOS Keychain / Android Keystore TurboModules in Phase 5.
 */
class MockCryptoModule implements NativeCryptoModule {
  readonly isMock = true;
  private readonly secureStorage: Map<string, string> = new Map();

  async hash(data: string, algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512'): Promise<string> {
    // Deterministic mock hash: hex-encoded string derived from input
    const prefix = algorithm.replace('-', '').toLowerCase();
    let hashValue = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hashValue = ((hashValue << 5) - hashValue + char) | 0;
    }
    const hexHash = Math.abs(hashValue).toString(16).padStart(16, '0');
    bridgeLogger.debug('Mock hash computed', { algorithm, dataLength: data.length });
    return `${prefix}:${hexHash}`;
  }

  async encrypt(data: string, key: string): Promise<string> {
    // Mock encryption: base64-encode the data with a marker prefix
    const encoded = this.simpleBase64Encode(`enc:${key.slice(0, 8)}:${data}`);
    bridgeLogger.debug('Mock encrypt', { dataLength: data.length });
    return encoded;
  }

  async decrypt(ciphertext: string, key: string): Promise<string> {
    // Mock decryption: reverse the mock encryption
    const decoded = this.simpleBase64Decode(ciphertext);
    const prefix = `enc:${key.slice(0, 8)}:`;
    if (decoded.startsWith(prefix)) {
      bridgeLogger.debug('Mock decrypt', { ciphertextLength: ciphertext.length });
      return decoded.slice(prefix.length);
    }
    bridgeLogger.warn('Mock decrypt: ciphertext does not match expected format');
    return decoded;
  }

  async generateKey(): Promise<string> {
    // Generate a mock 256-bit key as hex string
    const segments: string[] = [];
    for (let i = 0; i < 8; i++) {
      segments.push(Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'));
    }
    const key = segments.join('');
    bridgeLogger.debug('Mock key generated', { keyLength: key.length });
    return key;
  }

  async verifySignature(
    data: string,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    // Try real WebCrypto verification when available
    if (typeof globalThis.crypto?.subtle?.verify === 'function') {
      try {
        return await this.verifyWithWebCrypto(data, signature, publicKey);
      } catch (err) {
        bridgeLogger.warn('WebCrypto verifySignature failed, rejecting', {
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    }
    // No WebCrypto available — fail-closed for security
    bridgeLogger.warn('Mock verifySignature: no WebCrypto available, rejecting signature');
    return false;
  }

  /**
   * Verify RSA-PKCS1-v1_5 + SHA-256 signature via WebCrypto.
   */
  private async verifyWithWebCrypto(
    data: string,
    signature: string,
    publicKey: string,
  ): Promise<boolean> {
    // Parse PEM public key
    const pemBody = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Decode base64 signature
    const sigBytes = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0),
    );

    const dataBytes = new TextEncoder().encode(data);

    return globalThis.crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes.buffer,
      dataBytes.buffer,
    );
  }

  async secureStore(key: string, value: string): Promise<void> {
    this.secureStorage.set(key, value);
    bridgeLogger.debug('Mock secureStore: stored value', { key });
  }

  async secureRetrieve(key: string): Promise<string | null> {
    const value = this.secureStorage.get(key);
    bridgeLogger.debug('Mock secureRetrieve', { key, found: value !== undefined });
    return value ?? null;
  }

  async secureDelete(key: string): Promise<void> {
    this.secureStorage.delete(key);
    bridgeLogger.debug('Mock secureDelete', { key });
  }

  // Simple base64 helpers for the mock (avoids importing from utils to keep adapter self-contained)
  private simpleBase64Encode(input: string): string {
    if (typeof btoa === 'function') {
      return btoa(input);
    }
    // Node.js / Hermes fallback
    return Buffer.from(input, 'utf-8').toString('base64');
  }

  private simpleBase64Decode(input: string): string {
    if (typeof atob === 'function') {
      return atob(input);
    }
    // Node.js / Hermes fallback
    return Buffer.from(input, 'base64').toString('utf-8');
  }
}

/**
 * Mock DeviceIntegrityModule. Returns mock attestation tokens prefixed with "mock-"
 * so they are distinguishable. Verification is fail-closed: verifyAttestation returns
 * false because mock tokens cannot be cryptographically verified.
 *
 * Replaced by real App Attest (iOS) / Play Integrity (Android) TurboModule.
 */
class MockDeviceIntegrityModule implements NativeDeviceIntegrityModule {
  readonly isMock = true;

  async attestDevice(challenge: string): Promise<string> {
    bridgeLogger.warn(
      'Using MOCK device attestation — tokens will be rejected by production backends',
      { challengeLength: challenge.length },
    );
    return `mock-attestation-token-${Date.now()}`;
  }

  async verifyAttestation(token: string): Promise<boolean> {
    // Fail-closed: mock attestation tokens cannot be cryptographically verified
    const isMockToken = token.startsWith('mock-attestation-token-');
    if (isMockToken) {
      bridgeLogger.warn('Mock verifyAttestation: rejecting mock attestation token');
      return false;
    }
    // Non-mock tokens in mock environment — also reject (no native verification available)
    bridgeLogger.warn('Mock verifyAttestation: cannot verify real token without native module');
    return false;
  }
}

/**
 * Mock NetworkModule. Certificate pinning is NOT enforced in mock mode.
 * All requests pass through standard JS fetch() without pinning.
 * Replaced by real TrustKit (iOS) / OkHttp CertificatePinner (Android) TurboModule.
 */
class MockNetworkModule implements NativeNetworkModule {
  readonly isMock = true;

  async fetch(url: string, optionsStr: string): Promise<string> {
    bridgeLogger.warn('Using MOCK network module — certificate pinning NOT enforced', { url });
    const options = JSON.parse(optionsStr);
    const response = await globalThis.fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body,
    });
    const data = await response.json().catch(() => null);
    const headers: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => { headers[key] = value; });
    return JSON.stringify({ status: response.status, data, headers });
  }

  async configurePins(_pins: string): Promise<void> {
    bridgeLogger.warn('Mock configurePins: certificate pinning not enforced without native module');
  }
}

/**
 * Mock MediaModule. Returns placeholder MediaResult objects with mock:// URIs.
 * Replaced by real iOS PHPicker/UIImagePicker and Android Photo Picker TurboModules.
 */
class MockMediaModule implements NativeMediaModule {
  readonly isMock = true;

  // 1x1 grey JPEG as base64 — tiny valid image for mock previews
  private static readonly PLACEHOLDER_BASE64 =
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM' +
    'DhEQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU' +
    'FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';

  private buildMockResult(source: string, options?: Record<string, unknown>): string {
    // Use data: URI so React Native's Image component can actually render the mock
    const uri = `data:image/jpeg;base64,${MockMediaModule.PLACEHOLDER_BASE64}`;
    const result: Record<string, unknown> = {
      uri,
      fileName: `mock_${source}.jpg`,
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      fileSize: 102400,
      timestamp: Date.now(),
    };
    if (options?.includeBase64) {
      result.base64 = MockMediaModule.PLACEHOLDER_BASE64;
    }
    return JSON.stringify(result);
  }

  async captureImage(optionsStr: string): Promise<string> {
    bridgeLogger.warn('Using MOCK media module — captureImage returns placeholder');
    const options = JSON.parse(optionsStr);
    return this.buildMockResult('capture', options);
  }

  async pickFromLibrary(optionsStr: string): Promise<string> {
    bridgeLogger.warn('Using MOCK media module — pickFromLibrary returns placeholder');
    const options = JSON.parse(optionsStr);
    if (options.multiple) {
      const count = Math.min(options.maxCount ?? 3, 3);
      const results = Array.from({ length: count }, (_, i) =>
        JSON.parse(this.buildMockResult(`pick_${i}`, options)),
      );
      return JSON.stringify(results);
    }
    return this.buildMockResult('pick', options);
  }

  async captureFromView(_cameraId: string, optionsStr: string): Promise<string> {
    bridgeLogger.warn('Using MOCK media module — captureFromView returns placeholder');
    const options = JSON.parse(optionsStr);
    return this.buildMockResult('viewCapture', options);
  }

  async checkCameraPermission(): Promise<string> {
    return 'granted';
  }

  async checkLibraryPermission(): Promise<string> {
    return 'granted';
  }

  async requestCameraPermission(): Promise<string> {
    return 'granted';
  }

  async requestLibraryPermission(): Promise<string> {
    return 'granted';
  }
}

// ---------------------------------------------------------------------------
// Module resolution
// ---------------------------------------------------------------------------

/** Singleton mock module instances */
const mockModules: NativeModuleMap = {
  CryptoModule: new MockCryptoModule(),
  DeviceIntegrityModule: new MockDeviceIntegrityModule(),
  NetworkModule: new MockNetworkModule(),
  MediaModule: new MockMediaModule(),
};

/**
 * Attempts to resolve a real TurboModule via the RN bridge.
 * Returns null if not available.
 */
function tryResolveNativeModule<K extends NativeModuleName>(name: K): NativeModuleMap[K] | null {
  try {
    const nativeSpecs: Record<string, () => unknown> = {
      CryptoModule: () => require('../native/NativeCryptoModule').default,
      DeviceIntegrityModule: () => require('../native/NativeDeviceIntegrityModule').default,
      NetworkModule: () => require('../native/NativeNetworkModule').default,
      MediaModule: () => require('../native/NativeMediaModule').default,
    };
    const resolver = nativeSpecs[name];
    if (resolver) {
      const nativeModule = resolver();
      if (nativeModule) {
        bridgeLogger.info('Native TurboModule resolved', { name });
        return nativeModule as NativeModuleMap[K];
      }
    }
  } catch {
    // TurboModule not available in this environment - fall back to mock
  }
  return null;
}

/**
 * Returns a native module instance by name.
 *
 * Resolution order:
 * 1. Try to resolve from the RN TurboModule registry (Phase 5)
 * 2. Fall back to mock implementation (Phase 1)
 *
 * @param name - The native module name
 * @returns The native module instance (mock in Phase 1)
 */
function getNativeModule<K extends NativeModuleName>(name: K): NativeModuleMap[K] {
  // Attempt real resolution first
  const realModule = tryResolveNativeModule(name);
  if (realModule) {
    bridgeLogger.info(`Resolved real native module: ${name}`);
    return realModule;
  }

  // Fall back to mock
  const mockModule = mockModules[name];
  if (mockModule) {
    bridgeLogger.debug(`Using mock native module: ${name}`);
    return mockModule;
  }

  // This should never happen due to type constraints, but guard anyway
  bridgeLogger.error(`Unknown native module requested: ${name}`);
  throw new Error(`Native module "${name}" is not registered`);
}

/**
 * Check whether a specific native module has a real (non-mock) implementation.
 */
function isNativeModuleAvailable(name: NativeModuleName): boolean {
  return tryResolveNativeModule(name) !== null;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Initializes the bridge adapter. Logs available native modules.
 * Called at SDK boot.
 */
function initializeBridgeAdapter(): void {
  if (_initialized) {
    return;
  }

  const moduleNames: NativeModuleName[] = ['CryptoModule', 'DeviceIntegrityModule', 'NetworkModule', 'MediaModule'];
  for (const name of moduleNames) {
    const isReal = isNativeModuleAvailable(name);
    bridgeLogger.info(`Native module "${name}": ${isReal ? 'REAL' : 'MOCK'}`);
  }

  _initialized = true;
  bridgeLogger.debug('BridgeAdapter initialized');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  getNativeModule,
  isNativeModuleAvailable,
  initializeBridgeAdapter,
  MockCryptoModule,
  MockDeviceIntegrityModule,
  MockNetworkModule,
  MockMediaModule,
};

export type {
  NativeCryptoModule,
  NativeDeviceIntegrityModule,
  NativeNetworkModule,
  NativeMediaModule,
  NativeModuleMap,
  NativeModuleName,
};
