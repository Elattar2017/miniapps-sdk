/**
 * PlatformAdapter - Native Bridge Stability Layer for platform detection
 *
 * Provides platform detection (iOS/Android/Web), screen dimension helpers,
 * and safe area insets stub. Wraps RN Platform and Dimensions APIs.
 *
 * @module adapters/PlatformAdapter
 */

import { Platform, Dimensions } from 'react-native';
import type { ScaledSize } from 'react-native';
import { logger } from '../utils/logger';

const platformLogger = logger.child({ component: 'PlatformAdapter' });

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** Supported SDK platforms */
type SDKPlatform = 'ios' | 'android' | 'web' | 'unknown';

/**
 * Returns the current platform identifier.
 */
function getCurrentPlatform(): SDKPlatform {
  const os = Platform.OS;
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  if (os === 'web') return 'web';
  return 'unknown';
}

/**
 * Returns true if running on iOS.
 */
function isIOS(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Returns true if running on Android.
 */
function isAndroid(): boolean {
  return Platform.OS === 'android';
}

/**
 * Returns true if running on web (React Native Web).
 */
function isWeb(): boolean {
  return Platform.OS === 'web';
}

/**
 * Returns the platform OS version as a number (Android API level or iOS version).
 * Returns 0 if the version cannot be determined.
 */
function getPlatformVersion(): number {
  const version = Platform.Version;
  if (typeof version === 'number') {
    return version;
  }
  if (typeof version === 'string') {
    const parsed = parseFloat(version);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Platform.select wrapper with type safety.
 */
function platformSelect<T>(specifics: { ios?: T; android?: T; web?: T; default: T }): T {
  const result = Platform.select({
    ios: specifics.ios,
    android: specifics.android,
    web: specifics.web,
    default: specifics.default,
  });
  return (result ?? specifics.default) as T;
}

// ---------------------------------------------------------------------------
// Screen dimensions
// ---------------------------------------------------------------------------

/** Screen dimensions snapshot */
interface ScreenDimensions {
  width: number;
  height: number;
  scale: number;
  fontScale: number;
}

/**
 * Returns the current window dimensions.
 */
function getScreenDimensions(): ScreenDimensions {
  const window: ScaledSize = Dimensions.get('window');
  return {
    width: window.width,
    height: window.height,
    scale: window.scale,
    fontScale: window.fontScale,
  };
}

/**
 * Returns the full screen dimensions (including navigation bars, status bar, etc.).
 */
function getFullScreenDimensions(): ScreenDimensions {
  const screen: ScaledSize = Dimensions.get('screen');
  return {
    width: screen.width,
    height: screen.height,
    scale: screen.scale,
    fontScale: screen.fontScale,
  };
}

type DimensionChangeListener = (dimensions: ScreenDimensions) => void;

/** Active dimension change listeners */
const dimensionListeners = new Set<DimensionChangeListener>();
let dimensionSubscription: { remove: () => void } | null = null;

/**
 * Subscribes to dimension changes (e.g., orientation changes).
 * Returns an unsubscribe function. The underlying RN Dimensions event listener
 * is properly removed when all SDK listeners unsubscribe.
 */
function onDimensionChange(listener: DimensionChangeListener): () => void {
  dimensionListeners.add(listener);

  if (!dimensionSubscription) {
    dimensionSubscription = Dimensions.addEventListener('change', handleDimensionChange);
    platformLogger.debug('Dimension change listener activated');
  }

  return () => {
    dimensionListeners.delete(listener);
    if (dimensionListeners.size === 0 && dimensionSubscription) {
      dimensionSubscription.remove();
      dimensionSubscription = null;
      platformLogger.debug('Dimension change listener deactivated');
    }
  };
}

function handleDimensionChange(event: { window: ScaledSize; screen: ScaledSize }): void {
  const dimensions: ScreenDimensions = {
    width: event.window.width,
    height: event.window.height,
    scale: event.window.scale,
    fontScale: event.window.fontScale,
  };

  for (const listener of dimensionListeners) {
    listener(dimensions);
  }
}

// ---------------------------------------------------------------------------
// Safe area insets
// ---------------------------------------------------------------------------

/** Safe area insets for notch/edge-to-edge displays */
interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Cached safe area context module (null = not checked, false = unavailable) */
let _safeAreaModule: { initialWindowMetrics?: { insets?: SafeAreaInsets } } | false | null = null;

/**
 * Attempt to resolve react-native-safe-area-context at runtime.
 */
function tryResolveSafeAreaContext(): typeof _safeAreaModule {
  if (_safeAreaModule !== null) return _safeAreaModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-safe-area-context');
    _safeAreaModule = mod;
    platformLogger.debug('react-native-safe-area-context detected');
    return mod;
  } catch {
    _safeAreaModule = false;
    platformLogger.debug('react-native-safe-area-context not available, using platform defaults');
    return false;
  }
}

/**
 * Returns safe area insets for the current device.
 *
 * Attempts to use react-native-safe-area-context's initialWindowMetrics
 * for real device insets. Falls back to platform-specific defaults if
 * the library is not installed.
 */
function getSafeAreaInsets(): SafeAreaInsets {
  // Try real safe area context first
  const safeAreaModule = tryResolveSafeAreaContext();
  if (safeAreaModule && safeAreaModule.initialWindowMetrics?.insets) {
    return { ...safeAreaModule.initialWindowMetrics.insets };
  }

  // Fallback: platform-specific defaults
  return getDefaultSafeAreaInsets();
}

/**
 * Returns platform-specific default safe area insets.
 * Used when react-native-safe-area-context is not available.
 */
function getDefaultSafeAreaInsets(): SafeAreaInsets {
  if (isIOS()) {
    return {
      top: 44,     // Status bar + notch area
      bottom: 34,  // Home indicator
      left: 0,
      right: 0,
    };
  }

  if (isAndroid()) {
    return {
      top: 24,     // Status bar
      bottom: 0,
      left: 0,
      right: 0,
    };
  }

  // Web or unknown
  return {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
}

// ---------------------------------------------------------------------------
// Device capabilities
// ---------------------------------------------------------------------------

/** Device capability flags */
interface DeviceCapabilities {
  platform: SDKPlatform;
  version: number;
  hasNotch: boolean;
  supportsHaptics: boolean;
  supportsBiometrics: boolean;
}

/**
 * Returns device capability flags.
 * Phase 1 stub: uses heuristics based on platform.
 */
function getDeviceCapabilities(): DeviceCapabilities {
  const platform = getCurrentPlatform();
  const version = getPlatformVersion();

  return {
    platform,
    version,
    // Heuristic: iOS 11+ likely has notch, Android handled differently
    hasNotch: platform === 'ios' && version >= 11,
    // Heuristic: iOS supports haptics broadly, Android API 26+
    supportsHaptics: platform === 'ios' || (platform === 'android' && version >= 26),
    // Heuristic: iOS supports biometrics (Touch ID/Face ID), Android API 23+
    supportsBiometrics: platform === 'ios' || (platform === 'android' && version >= 23),
  };
}

/**
 * Returns true if the device appears to be a tablet.
 * Uses dimension heuristics: shortest side > 600dp indicates tablet form factor.
 */
function isTablet(): boolean {
  const dims = getScreenDimensions();
  const shortestSide = Math.min(dims.width, dims.height);
  return shortestSide > 600;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Validates platform APIs and logs device info. Called at SDK boot.
 */
function initializePlatformAdapter(): void {
  if (_initialized) {
    return;
  }

  const platform = getCurrentPlatform();
  const version = getPlatformVersion();
  const dimensions = getScreenDimensions();

  platformLogger.info('PlatformAdapter initialized', {
    platform,
    version,
    screenWidth: dimensions.width,
    screenHeight: dimensions.height,
    scale: dimensions.scale,
  });

  _initialized = true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
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
  getDefaultSafeAreaInsets,
  getDeviceCapabilities,
  isTablet,
  initializePlatformAdapter,
};

export type {
  SDKPlatform,
  ScreenDimensions,
  SafeAreaInsets,
  DeviceCapabilities,
  DimensionChangeListener,
};
