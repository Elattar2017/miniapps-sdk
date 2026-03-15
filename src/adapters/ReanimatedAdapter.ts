/**
 * ReanimatedAdapter - Reanimated v3 abstraction layer
 *
 * Provides Reanimated-compatible APIs (shared values, animated styles,
 * animation modifiers) backed by React Native Animated as a fallback.
 * When react-native-reanimated is available, delegates to real implementations.
 *
 * @module adapters/ReanimatedAdapter
 */

import { useRef, useMemo } from 'react';
import { Animated as RNAnimated } from 'react-native';
import { logger } from '../utils/logger';

const reanimLogger = logger.child({ component: 'ReanimatedAdapter' });

// ---------------------------------------------------------------------------
// Runtime detection & lazy resolution
// ---------------------------------------------------------------------------

let _reanimatedAvailable: boolean | null = null;

/** Cached real Reanimated module (resolved lazily on first use) */
let _reanimatedModule: ReanimatedAPIs | null = null;

/** Subset of Reanimated APIs we delegate to when available */
interface ReanimatedAPIs {
  useSharedValue: (initialValue: unknown) => { value: unknown };
  useAnimatedStyle: (updater: () => Record<string, unknown>, deps?: unknown[]) => Record<string, unknown>;
  withTiming: (toValue: number, config?: { duration?: number }) => number;
  withSpring: (toValue: number, config?: { damping?: number; stiffness?: number }) => number;
  withDelay: (delay: number, animation: number) => number;
  withSequence: (...animations: number[]) => number;
  withRepeat: (animation: number, numberOfReps?: number, reverse?: boolean) => number;
  default?: { View?: React.ComponentType<unknown>; Text?: React.ComponentType<unknown>; ScrollView?: React.ComponentType<unknown> };
  createAnimatedComponent?: (component: React.ComponentType<unknown>) => React.ComponentType<unknown>;
}

/**
 * Check if react-native-reanimated is installed and available.
 */
function isReanimatedAvailable(): boolean {
  if (_reanimatedAvailable === null) {
    try {
      require('react-native-reanimated');
      _reanimatedAvailable = true;
    } catch {
      _reanimatedAvailable = false;
    }
  }
  return _reanimatedAvailable;
}

/**
 * Lazily resolve the real Reanimated module.
 * Returns null if not available.
 */
function getReanimated(): ReanimatedAPIs | null {
  if (_reanimatedModule !== null) return _reanimatedModule;
  if (!isReanimatedAvailable()) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-reanimated') as ReanimatedAPIs;
    _reanimatedModule = mod;
    return mod;
  } catch {
    return null;
  }
}

let _initialized = false;

/**
 * Initialize the Reanimated adapter. Logs availability status.
 */
function initializeReanimatedAdapter(): void {
  if (_initialized) return;

  if (isReanimatedAvailable()) {
    reanimLogger.debug('Reanimated v3 detected — using native worklet engine');
  } else {
    reanimLogger.debug('Reanimated not available — using RN Animated fallback');
  }

  _initialized = true;
}

// ---------------------------------------------------------------------------
// Shared Value abstraction
// ---------------------------------------------------------------------------

/**
 * A reactive value container, similar to Reanimated's SharedValue.
 * In fallback mode, wraps an Animated.Value with a JS-side mirror.
 */
interface SharedValue<T> {
  value: T;
  /** Internal animated value for driving animations (fallback mode) */
  _animatedValue?: InstanceType<typeof RNAnimated.Value>;
}

/**
 * Hook that creates a shared value, similar to Reanimated's useSharedValue.
 * Delegates to real Reanimated when available, otherwise uses a mutable ref
 * with a .value property backed by RN Animated.Value.
 */
function useSharedValue<T>(initialValue: T): SharedValue<T> {
  const reanimated = getReanimated();
  if (reanimated?.useSharedValue) {
    return reanimated.useSharedValue(initialValue) as SharedValue<T>;
  }

  return useFallbackSharedValue(initialValue);
}

/** Fallback shared value using RN Animated.Value */
function useFallbackSharedValue<T>(initialValue: T): SharedValue<T> {
  const ref = useRef<SharedValue<T> | null>(null);

  if (ref.current === null) {
    const animValue = typeof initialValue === 'number'
      ? new RNAnimated.Value(initialValue)
      : undefined;

    const sv: SharedValue<T> = {
      value: initialValue,
      _animatedValue: animValue,
    };

    // Use Object.defineProperty to make .value reactive
    let currentValue = initialValue;
    Object.defineProperty(sv, 'value', {
      get() {
        return currentValue;
      },
      set(newValue: T) {
        currentValue = newValue;
        if (typeof newValue === 'number' && animValue) {
          animValue.setValue(newValue);
        }
      },
      enumerable: true,
      configurable: true,
    });

    ref.current = sv;
  }

  return ref.current;
}

// ---------------------------------------------------------------------------
// Animated Style hook
// ---------------------------------------------------------------------------

/**
 * Hook that creates animated styles, similar to Reanimated's useAnimatedStyle.
 * Delegates to real Reanimated when available, otherwise evaluates synchronously.
 */
function useAnimatedStyle(
  updater: () => Record<string, unknown>,
  deps: unknown[] = [],
): Record<string, unknown> {
  const reanimated = getReanimated();
  if (reanimated?.useAnimatedStyle) {
    return reanimated.useAnimatedStyle(updater, deps);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => updater(), deps);
}

// ---------------------------------------------------------------------------
// Animation modifiers (with* functions)
// ---------------------------------------------------------------------------

/**
 * Creates a timing animation configuration.
 * Delegates to real Reanimated when available.
 * In fallback mode, returns the target value directly.
 */
function withTiming(toValue: number, config?: { duration?: number }): number {
  const reanimated = getReanimated();
  if (reanimated?.withTiming) {
    return reanimated.withTiming(toValue, config);
  }
  return toValue;
}

/**
 * Creates a spring animation configuration.
 * Delegates to real Reanimated when available.
 * In fallback mode, returns the target value directly.
 */
function withSpring(toValue: number, config?: { damping?: number; stiffness?: number }): number {
  const reanimated = getReanimated();
  if (reanimated?.withSpring) {
    return reanimated.withSpring(toValue, config);
  }
  return toValue;
}

/**
 * Wraps an animation with a delay.
 * Delegates to real Reanimated when available.
 * In fallback mode, returns the animation value directly.
 */
function withDelay(delay: number, animation: number): number {
  const reanimated = getReanimated();
  if (reanimated?.withDelay) {
    return reanimated.withDelay(delay, animation);
  }
  return animation;
}

/**
 * Chains animations in sequence.
 * Delegates to real Reanimated when available.
 * In fallback mode, returns the last animation value.
 */
function withSequence(...animations: number[]): number {
  const reanimated = getReanimated();
  if (reanimated?.withSequence) {
    return reanimated.withSequence(...animations);
  }
  return animations.length > 0 ? animations[animations.length - 1] : 0;
}

/**
 * Repeats an animation.
 * Delegates to real Reanimated when available.
 * In fallback mode, returns the animation value directly.
 */
function withRepeat(animation: number, numberOfReps: number = -1, reverse: boolean = false): number {
  const reanimated = getReanimated();
  if (reanimated?.withRepeat) {
    return reanimated.withRepeat(animation, numberOfReps, reverse);
  }
  return animation;
}

// ---------------------------------------------------------------------------
// Animated Components
// ---------------------------------------------------------------------------

/**
 * Resolve animated components. When Reanimated is available, uses its
 * Animated.View/Text/ScrollView (worklet-driven). Otherwise falls back
 * to RN Animated equivalents.
 */
function resolveAnimatedComponents() {
  const reanimated = getReanimated();
  if (reanimated?.default) {
    return {
      View: reanimated.default.View ?? RNAnimated.View,
      Text: reanimated.default.Text ?? RNAnimated.Text,
      ScrollView: reanimated.default.ScrollView ?? RNAnimated.ScrollView,
    };
  }
  return {
    View: RNAnimated.View,
    Text: RNAnimated.Text,
    ScrollView: RNAnimated.ScrollView,
  };
}

const _resolved = resolveAnimatedComponents();
const ReanimatedView = _resolved.View;
const ReanimatedText = _resolved.Text;
const ReanimatedScrollView = _resolved.ScrollView;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  // Runtime
  isReanimatedAvailable,
  initializeReanimatedAdapter,
  getReanimated,
  // Shared values
  useSharedValue,
  // Animated styles
  useAnimatedStyle,
  // Animation modifiers
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  // Components
  ReanimatedView,
  ReanimatedText,
  ReanimatedScrollView,
};

export type { SharedValue };
