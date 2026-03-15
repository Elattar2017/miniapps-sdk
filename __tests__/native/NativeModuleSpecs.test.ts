/**
 * Tests for TurboModule codegen specifications
 *
 * Validates that each NativeModule spec:
 * - Exports null by default (TurboModuleRegistry.get returns null in test env)
 * - Defines the expected interface methods (type-level, validated via mock)
 * - Integrates correctly with BridgeAdapter resolution
 */

import type { Spec as CryptoSpec } from '../../src/native/NativeCryptoModule';
import type { Spec as DeviceIntegritySpec } from '../../src/native/NativeDeviceIntegrityModule';
import type { Spec as NetworkSpec } from '../../src/native/NativeNetworkModule';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

// ---------------------------------------------------------------------------
// NativeCryptoModule
// ---------------------------------------------------------------------------

describe('NativeCryptoModule', () => {
  it('exports null by default and calls TurboModuleRegistry.get with CryptoModule', () => {
    // Get a fresh reference to TurboModuleRegistry for this test
    const { TurboModuleRegistry } = require('react-native');
    (TurboModuleRegistry.get as jest.Mock).mockClear();

    const NativeCryptoModule = require('../../src/native/NativeCryptoModule').default;
    expect(NativeCryptoModule).toBeNull();
    expect(TurboModuleRegistry.get).toHaveBeenCalledWith('CryptoModule');
  });

  it('Spec interface has required crypto method signatures', () => {
    // Validate the interface shape via a type-conforming mock object
    const mockCrypto: CryptoSpec = {
      hash: jest.fn().mockResolvedValue('abc123'),
      encrypt: jest.fn().mockResolvedValue('encrypted'),
      decrypt: jest.fn().mockResolvedValue('decrypted'),
      generateKey: jest.fn().mockResolvedValue('key-hex'),
      verifySignature: jest.fn().mockResolvedValue(true),
      secureStore: jest.fn().mockResolvedValue(undefined),
      secureRetrieve: jest.fn().mockResolvedValue('value'),
      secureDelete: jest.fn().mockResolvedValue(undefined),
    };

    expect(typeof mockCrypto.hash).toBe('function');
    expect(typeof mockCrypto.encrypt).toBe('function');
    expect(typeof mockCrypto.decrypt).toBe('function');
    expect(typeof mockCrypto.generateKey).toBe('function');
    expect(typeof mockCrypto.verifySignature).toBe('function');
    expect(typeof mockCrypto.secureStore).toBe('function');
    expect(typeof mockCrypto.secureRetrieve).toBe('function');
    expect(typeof mockCrypto.secureDelete).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// NativeDeviceIntegrityModule
// ---------------------------------------------------------------------------

describe('NativeDeviceIntegrityModule', () => {
  it('exports null by default and calls TurboModuleRegistry.get with DeviceIntegrityModule', () => {
    const { TurboModuleRegistry } = require('react-native');
    (TurboModuleRegistry.get as jest.Mock).mockClear();

    const NativeDeviceIntegrityModule = require('../../src/native/NativeDeviceIntegrityModule').default;
    expect(NativeDeviceIntegrityModule).toBeNull();
    expect(TurboModuleRegistry.get).toHaveBeenCalledWith('DeviceIntegrityModule');
  });

  it('Spec interface has attestDevice and verifyAttestation', () => {
    const mockIntegrity: DeviceIntegritySpec = {
      attestDevice: jest.fn().mockResolvedValue('token'),
      verifyAttestation: jest.fn().mockResolvedValue(true),
    };

    expect(typeof mockIntegrity.attestDevice).toBe('function');
    expect(typeof mockIntegrity.verifyAttestation).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// NativeNetworkModule
// ---------------------------------------------------------------------------

describe('NativeNetworkModule', () => {
  it('exports null by default and calls TurboModuleRegistry.get with NetworkModule', () => {
    const { TurboModuleRegistry } = require('react-native');
    (TurboModuleRegistry.get as jest.Mock).mockClear();

    const NativeNetworkModule = require('../../src/native/NativeNetworkModule').default;
    expect(NativeNetworkModule).toBeNull();
    expect(TurboModuleRegistry.get).toHaveBeenCalledWith('NetworkModule');
  });

  it('Spec interface has fetch and configurePins', () => {
    const mockNetwork: NetworkSpec = {
      fetch: jest.fn().mockResolvedValue('{"ok":true}'),
      configurePins: jest.fn().mockResolvedValue(undefined),
    };

    expect(typeof mockNetwork.fetch).toBe('function');
    expect(typeof mockNetwork.configurePins).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// BridgeAdapter TurboModule integration
// ---------------------------------------------------------------------------

describe('BridgeAdapter TurboModule resolution', () => {
  it('falls back to mock when TurboModule returns null', () => {
    // Default behavior: TurboModuleRegistry.get returns null,
    // so BridgeAdapter should use its mock implementations
    const { getNativeModule } = require('../../src/adapters/BridgeAdapter');

    const crypto = getNativeModule('CryptoModule');
    expect(crypto).toBeDefined();
    expect(crypto.isMock).toBe(true);
  });

  it('uses TurboModule when available', () => {
    // Mock require to return a real TurboModule-like object for CryptoModule
    const fakeTurboModule = {
      hash: jest.fn().mockResolvedValue('native-hash'),
      encrypt: jest.fn().mockResolvedValue('native-encrypted'),
      decrypt: jest.fn().mockResolvedValue('native-decrypted'),
      generateKey: jest.fn().mockResolvedValue('native-key'),
      verifySignature: jest.fn().mockResolvedValue(true),
      secureStore: jest.fn().mockResolvedValue(undefined),
      secureRetrieve: jest.fn().mockResolvedValue('native-value'),
      secureDelete: jest.fn().mockResolvedValue(undefined),
    };

    // Override the NativeCryptoModule to return a non-null module
    jest.doMock('../../src/native/NativeCryptoModule', () => ({
      __esModule: true,
      default: fakeTurboModule,
    }));

    // Re-require BridgeAdapter to pick up the mocked native module
    const { getNativeModule } = require('../../src/adapters/BridgeAdapter');

    const crypto = getNativeModule('CryptoModule');
    expect(crypto).toBe(fakeTurboModule);
    expect(crypto.hash).toBe(fakeTurboModule.hash);
  });
});
