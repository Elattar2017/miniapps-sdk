/**
 * PlatformAdapter Advanced Tests
 * Tests isTablet, getSafeAreaInsets per platform, getDeviceCapabilities
 */

import { Platform, Dimensions } from 'react-native';

// Import after mocking
import {
  getSafeAreaInsets,
  getDeviceCapabilities,
  isTablet,
  getScreenDimensions,
  getFullScreenDimensions,
  onDimensionChange,
  platformSelect,
  getCurrentPlatform,
} from '../../src/adapters/PlatformAdapter';

describe('PlatformAdapter - getSafeAreaInsets', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('returns iOS safe area insets', () => {
    (Platform as any).OS = 'ios';
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(44);
    expect(insets.bottom).toBe(34);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
  });

  it('returns Android safe area insets', () => {
    (Platform as any).OS = 'android';
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(24);
    expect(insets.bottom).toBe(0);
  });

  it('returns zero insets for web', () => {
    (Platform as any).OS = 'web';
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
  });

  it('returns zero insets for unknown platform', () => {
    (Platform as any).OS = 'windows';
    const insets = getSafeAreaInsets();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
  });
});

describe('PlatformAdapter - isTablet', () => {
  it('returns false for phone dimensions (375x812)', () => {
    const mockGet = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 375,
      height: 812,
      scale: 3,
      fontScale: 1,
    });
    expect(isTablet()).toBe(false);
    mockGet.mockRestore();
  });

  it('returns true for tablet dimensions (768x1024)', () => {
    const mockGet = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 768,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });
    expect(isTablet()).toBe(true);
    mockGet.mockRestore();
  });

  it('returns true for landscape tablet (1024x768)', () => {
    const mockGet = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 1024,
      height: 768,
      scale: 2,
      fontScale: 1,
    });
    expect(isTablet()).toBe(true);
    mockGet.mockRestore();
  });

  it('returns false for large phone (414x896)', () => {
    const mockGet = jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 414,
      height: 896,
      scale: 2,
      fontScale: 1,
    });
    expect(isTablet()).toBe(false);
    mockGet.mockRestore();
  });
});

describe('PlatformAdapter - getDeviceCapabilities', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  afterEach(() => {
    (Platform as any).OS = originalOS;
    (Platform as any).Version = originalVersion;
  });

  it('returns iOS capabilities with notch for iOS 11+', () => {
    (Platform as any).OS = 'ios';
    (Platform as any).Version = '16.0';
    const caps = getDeviceCapabilities();
    expect(caps.platform).toBe('ios');
    expect(caps.hasNotch).toBe(true);
    expect(caps.supportsHaptics).toBe(true);
    expect(caps.supportsBiometrics).toBe(true);
  });

  it('returns Android capabilities for API 26+', () => {
    (Platform as any).OS = 'android';
    (Platform as any).Version = 33;
    const caps = getDeviceCapabilities();
    expect(caps.platform).toBe('android');
    expect(caps.hasNotch).toBe(false);
    expect(caps.supportsHaptics).toBe(true);
    expect(caps.supportsBiometrics).toBe(true);
  });

  it('returns limited capabilities for old Android API', () => {
    (Platform as any).OS = 'android';
    (Platform as any).Version = 21;
    const caps = getDeviceCapabilities();
    expect(caps.supportsHaptics).toBe(false);
    expect(caps.supportsBiometrics).toBe(false);
  });
});

describe('PlatformAdapter - platformSelect', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('selects ios value on iOS', () => {
    (Platform as any).OS = 'ios';
    const result = platformSelect({ ios: 'apple', android: 'google', default: 'other' });
    expect(result).toBe('apple');
  });

  it('selects default when platform not specified', () => {
    (Platform as any).OS = 'windows';
    const origSelect = Platform.select;
    (Platform as any).select = (opts: any) => {
      const key = Platform.OS;
      return opts[key] ?? opts.default;
    };
    const result = platformSelect({ ios: 'apple', default: 'other' });
    expect(result).toBe('other');
    (Platform as any).select = origSelect;
  });
});

describe('PlatformAdapter - getScreenDimensions', () => {
  it('returns width, height, scale, fontScale', () => {
    const dims = getScreenDimensions();
    expect(typeof dims.width).toBe('number');
    expect(typeof dims.height).toBe('number');
    expect(typeof dims.scale).toBe('number');
    expect(typeof dims.fontScale).toBe('number');
  });
});

describe('PlatformAdapter - onDimensionChange', () => {
  it('returns unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = onDimensionChange(listener);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});
