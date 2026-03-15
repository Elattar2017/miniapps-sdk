jest.mock("react-native");

/**
 * AnimationAdapter Test Suite
 *
 * Tests for re-exported Animated primitives, animation factory helpers,
 * and initializeAnimationAdapter.
 */

import { Animated } from 'react-native';
import {
  SDKAnimated,
  SDKAnimatedValue,
  SDKAnimatedValueXY,
  SDKAnimatedView,
  SDKAnimatedText,
  SDKAnimatedImage,
  SDKAnimatedScrollView,
  createFadeAnimation,
  createSlideAnimation,
  createSpringAnimation,
  initializeAnimationAdapter,
} from '../../src/adapters/AnimationAdapter';

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
// Re-exported Animated primitives
// ---------------------------------------------------------------------------

describe('Animated re-exports', () => {
  it('SDKAnimated is RN Animated', () => {
    expect(SDKAnimated).toBe(Animated);
  });

  it('SDKAnimatedValue is Animated.Value', () => {
    expect(SDKAnimatedValue).toBe(Animated.Value);
  });

  it('SDKAnimatedValueXY is Animated.ValueXY', () => {
    expect(SDKAnimatedValueXY).toBe(Animated.ValueXY);
  });

  it('SDKAnimatedView is Animated.View', () => {
    expect(SDKAnimatedView).toBe(Animated.View);
  });

  it('SDKAnimatedText is Animated.Text', () => {
    expect(SDKAnimatedText).toBe(Animated.Text);
  });

  it('SDKAnimatedImage is Animated.Image', () => {
    expect(SDKAnimatedImage).toBe(Animated.Image);
  });

  it('SDKAnimatedScrollView is Animated.ScrollView', () => {
    expect(SDKAnimatedScrollView).toBe(Animated.ScrollView);
  });
});

// ---------------------------------------------------------------------------
// Animation factory helpers
// ---------------------------------------------------------------------------

describe('createFadeAnimation', () => {
  it('creates with default duration 300', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createFadeAnimation({ value: val, toValue: 1 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ duration: 300 }));
  });

  it('accepts custom duration', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createFadeAnimation({ value: val, toValue: 1, duration: 500 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ duration: 500 }));
  });

  it('uses native driver by default', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createFadeAnimation({ value: val, toValue: 1 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ useNativeDriver: true }));
  });

  it('allows disabling native driver', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createFadeAnimation({ value: val, toValue: 1, useNativeDriver: false });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ useNativeDriver: false }));
  });
});

describe('createSlideAnimation', () => {
  it('creates with default duration 250', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createSlideAnimation({ value: val, toValue: 100 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ duration: 250 }));
  });

  it('accepts custom duration', () => {
    const spy = jest.spyOn(Animated, 'timing');
    const val = new SDKAnimatedValue(0);
    createSlideAnimation({ value: val, toValue: 100, duration: 400 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ duration: 400 }));
  });
});

describe('createSpringAnimation', () => {
  it('creates with default friction 7 and tension 40', () => {
    const spy = jest.spyOn(Animated, 'spring');
    const val = new SDKAnimatedValue(0);
    createSpringAnimation({ value: val, toValue: 1 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ friction: 7, tension: 40 }));
  });

  it('accepts custom friction and tension', () => {
    const spy = jest.spyOn(Animated, 'spring');
    const val = new SDKAnimatedValue(0);
    createSpringAnimation({ value: val, toValue: 1, friction: 10, tension: 50 });
    expect(spy).toHaveBeenCalledWith(val, expect.objectContaining({ friction: 10, tension: 50 }));
  });
});

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

describe('initializeAnimationAdapter', () => {
  it('initializes without error', () => {
    expect(() => initializeAnimationAdapter()).not.toThrow();
  });

  it('is idempotent (second call does nothing)', () => {
    initializeAnimationAdapter();
    initializeAnimationAdapter();
    // Should not throw
  });
});
