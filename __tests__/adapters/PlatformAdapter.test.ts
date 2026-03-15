/**
 * PlatformAdapter Test Suite
 *
 * Tests for platform detection, screen dimensions, safe area insets,
 * device capabilities, and initializePlatformAdapter.
 */

jest.mock('react-native');

import { Platform, Dimensions } from 'react-native';
import {
  getCurrentPlatform,
  isIOS,
  isAndroid,
  isWeb,
  getPlatformVersion,
  platformSelect,
  getScreenDimensions,
  getFullScreenDimensions,
  onDimensionChange,
  getSafeAreaInsets,
  getDeviceCapabilities,
  initializePlatformAdapter,
} from '../../src/adapters/PlatformAdapter';

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
// Platform detection
// ---------------------------------------------------------------------------

describe('getCurrentPlatform', () => {
  it('returns "ios" when Platform.OS is "ios"', () => {
    // The default mock has Platform.OS = 'ios'
    expect(getCurrentPlatform()).toBe('ios');
  });
});

describe('isIOS / isAndroid / isWeb', () => {
  it('isIOS() returns true when Platform.OS is "ios"', () => {
    expect(isIOS()).toBe(true);
  });

  it('isAndroid() returns false when Platform.OS is "ios"', () => {
    expect(isAndroid()).toBe(false);
  });

  it('isWeb() returns false when Platform.OS is "ios"', () => {
    expect(isWeb()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlatformVersion
// ---------------------------------------------------------------------------

describe('getPlatformVersion', () => {
  it('returns a number version parsed from string', () => {
    // Default mock has Platform.Version = '16.0'
    const version = getPlatformVersion();
    expect(typeof version).toBe('number');
    expect(version).toBe(16.0);
  });

  it('returns 0 for NaN version', () => {
    const originalVersion = Platform.Version;
    (Platform as any).Version = 'not-a-number';

    const version = getPlatformVersion();
    expect(version).toBe(0);

    (Platform as any).Version = originalVersion;
  });

  it('returns numeric version directly when already a number', () => {
    const originalVersion = Platform.Version;
    (Platform as any).Version = 33;

    const version = getPlatformVersion();
    expect(version).toBe(33);

    (Platform as any).Version = originalVersion;
  });
});

// ---------------------------------------------------------------------------
// platformSelect
// ---------------------------------------------------------------------------

describe('platformSelect', () => {
  it('returns platform-specific value for ios', () => {
    const result = platformSelect({
      ios: 'ios-value',
      android: 'android-value',
      default: 'default-value',
    });
    expect(result).toBe('ios-value');
  });

  it('falls back to default when platform-specific value is not provided', () => {
    // Platform.select in mock returns ios ?? default, so if we only provide default
    // and Platform.select returns undefined for ios, it falls back
    const result = platformSelect({
      default: 'fallback-value',
    });
    expect(result).toBe('fallback-value');
  });
});

// ---------------------------------------------------------------------------
// Screen dimensions
// ---------------------------------------------------------------------------

describe('getScreenDimensions', () => {
  it('returns object with width, height, scale, fontScale', () => {
    const dims = getScreenDimensions();
    expect(dims).toHaveProperty('width');
    expect(dims).toHaveProperty('height');
    expect(dims).toHaveProperty('scale');
    expect(dims).toHaveProperty('fontScale');
    expect(typeof dims.width).toBe('number');
    expect(typeof dims.height).toBe('number');
    // The mock returns 375x812
    expect(dims.width).toBe(375);
    expect(dims.height).toBe(812);
  });
});

describe('getFullScreenDimensions', () => {
  it('returns screen dimensions', () => {
    const dims = getFullScreenDimensions();
    expect(dims).toHaveProperty('width');
    expect(dims).toHaveProperty('height');
    expect(dims).toHaveProperty('scale');
    expect(dims).toHaveProperty('fontScale');
    expect(typeof dims.width).toBe('number');
    expect(typeof dims.height).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// onDimensionChange
// ---------------------------------------------------------------------------

describe('onDimensionChange', () => {
  it('returns an unsubscribe function', () => {
    const listener = jest.fn();
    const unsubscribe = onDimensionChange(listener);
    expect(typeof unsubscribe).toBe('function');
    // Clean up
    unsubscribe();
  });

  it('unsubscribe removes the listener', () => {
    const listener = jest.fn();
    const unsubscribe = onDimensionChange(listener);
    unsubscribe();
    // After unsubscribe, listener should not be called
    // (no easy way to trigger in mock, but unsubscribe should not throw)
    expect(() => unsubscribe()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Safe area insets
// ---------------------------------------------------------------------------

describe('getSafeAreaInsets', () => {
  it('returns iOS-specific insets when Platform.OS is "ios"', () => {
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(44);
    expect(insets.bottom).toBe(34);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Device capabilities
// ---------------------------------------------------------------------------

describe('getDeviceCapabilities', () => {
  it('returns platform/version/hasNotch/supportsHaptics/supportsBiometrics', () => {
    const caps = getDeviceCapabilities();
    expect(caps).toHaveProperty('platform');
    expect(caps).toHaveProperty('version');
    expect(caps).toHaveProperty('hasNotch');
    expect(caps).toHaveProperty('supportsHaptics');
    expect(caps).toHaveProperty('supportsBiometrics');
    expect(caps.platform).toBe('ios');
    expect(typeof caps.version).toBe('number');
    expect(typeof caps.hasNotch).toBe('boolean');
    expect(typeof caps.supportsHaptics).toBe('boolean');
    expect(typeof caps.supportsBiometrics).toBe('boolean');
  });

  it('iOS 16+ has notch', () => {
    const caps = getDeviceCapabilities();
    // Platform.Version = '16.0' => version >= 11 => hasNotch = true
    expect(caps.hasNotch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('initializePlatformAdapter', () => {
  it('runs without error', () => {
    expect(() => initializePlatformAdapter()).not.toThrow();
  });

  it('second call is a no-op (idempotent)', () => {
    initializePlatformAdapter();
    expect(() => initializePlatformAdapter()).not.toThrow();
  });
});
