/**
 * Native Module Mocks - Mock implementations of NativeModules.CryptoModule
 * and NativeModules.DeviceIntegrityModule for testing without a native runtime.
 */

/** Mock CryptoModule - provides basic crypto operations */
export const MockCryptoModule = {
  /**
   * Hash data with the specified algorithm.
   * Returns a hex-encoded mock hash.
   */
  async hash(data: string, algorithm: string): Promise<string> {
    // Simple non-cryptographic hash for testing
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `mock-${algorithm.toLowerCase()}-${Math.abs(hash).toString(16).padStart(8, '0')}`;
  },

  /**
   * Encrypt data with the given key.
   * Returns a base64-style mock ciphertext.
   */
  async encrypt(data: string, key: string): Promise<string> {
    return `encrypted:${Buffer.from(data).toString('base64')}`;
  },

  /**
   * Decrypt ciphertext with the given key.
   * Reverses the mock encryption.
   */
  async decrypt(ciphertext: string, key: string): Promise<string> {
    const prefix = 'encrypted:';
    if (ciphertext.startsWith(prefix)) {
      return Buffer.from(ciphertext.slice(prefix.length), 'base64').toString('utf-8');
    }
    return ciphertext;
  },

  /**
   * Generate a random encryption key.
   * Returns a mock 256-bit hex key.
   */
  async generateKey(): Promise<string> {
    const chars = '0123456789abcdef';
    let key = '';
    for (let i = 0; i < 64; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
  },

  /**
   * Verify a signature against data and public key.
   * Always returns true in mock implementation.
   */
  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    return true;
  },

  /**
   * Store a value securely (mock Keychain/Keystore).
   */
  async secureStore(key: string, value: string): Promise<void> {
    MockCryptoModule._secureStorage.set(key, value);
  },

  /**
   * Retrieve a securely stored value.
   */
  async secureRetrieve(key: string): Promise<string | null> {
    return MockCryptoModule._secureStorage.get(key) ?? null;
  },

  /**
   * Delete a securely stored value.
   */
  async secureDelete(key: string): Promise<void> {
    MockCryptoModule._secureStorage.delete(key);
  },

  /** Internal storage map for testing (not part of the real module) */
  _secureStorage: new Map<string, string>(),

  /** Reset the mock state (for use in test teardown) */
  _reset(): void {
    MockCryptoModule._secureStorage.clear();
  },
};

/** Mock DeviceIntegrityModule - provides device attestation stubs */
export const MockDeviceIntegrityModule = {
  /**
   * Check device integrity (App Attest / Play Integrity).
   * Returns a mock attestation result.
   */
  async checkIntegrity(): Promise<{
    valid: boolean;
    platform: string;
    attestationToken: string;
  }> {
    return {
      valid: true,
      platform: 'ios',
      attestationToken: 'mock-attestation-token-' + Date.now(),
    };
  },

  /**
   * Generate a nonce for attestation challenge.
   */
  async generateNonce(): Promise<string> {
    return 'mock-nonce-' + Math.random().toString(36).slice(2);
  },

  /**
   * Verify attestation with the server.
   * Always returns true in mock implementation.
   */
  async verifyAttestation(token: string, nonce: string): Promise<boolean> {
    return true;
  },

  /**
   * Check if the device is rooted/jailbroken.
   * Returns false (not compromised) in mock implementation.
   */
  async isDeviceCompromised(): Promise<boolean> {
    return false;
  },
};

/**
 * Combined NativeModules mock object.
 * Use this in jest.mock() to replace NativeModules.
 */
export const NativeModules = {
  CryptoModule: MockCryptoModule,
  DeviceIntegrityModule: MockDeviceIntegrityModule,
};
