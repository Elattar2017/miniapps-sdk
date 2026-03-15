/**
 * PlatformAdapter Subscription & Safe Area Tests
 *
 * Tests for proper Dimensions event listener cleanup (memory leak fix)
 * and react-native-safe-area-context integration.
 */

jest.mock('react-native');

import { Dimensions } from 'react-native';
import {
  onDimensionChange,
  getSafeAreaInsets,
  getDefaultSafeAreaInsets,
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
// Dimension subscription cleanup
// ---------------------------------------------------------------------------

describe('onDimensionChange subscription lifecycle', () => {
  it('addEventListener is called when first listener subscribes', () => {
    const spy = jest.spyOn(Dimensions, 'addEventListener');
    const unsub = onDimensionChange(jest.fn());

    expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
    unsub();
  });

  it('subscription.remove() is called when last listener unsubscribes', () => {
    const removeSpy = jest.fn();
    jest.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: removeSpy });

    const unsub1 = onDimensionChange(jest.fn());
    const unsub2 = onDimensionChange(jest.fn());

    // First unsubscribe — still one listener remaining
    unsub1();
    expect(removeSpy).not.toHaveBeenCalled();

    // Last unsubscribe — subscription should be removed
    unsub2();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('re-subscribing after full unsubscribe creates new subscription', () => {
    const removeSpy = jest.fn();
    const addSpy = jest.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: removeSpy });

    const unsub = onDimensionChange(jest.fn());
    unsub();
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledTimes(1);

    // Subscribe again
    const unsub2 = onDimensionChange(jest.fn());
    expect(addSpy).toHaveBeenCalledTimes(2);
    unsub2();
    expect(removeSpy).toHaveBeenCalledTimes(2);
  });

  it('unsubscribing the same listener twice does not cause issues', () => {
    const removeSpy = jest.fn();
    jest.spyOn(Dimensions, 'addEventListener').mockReturnValue({ remove: removeSpy });

    const unsub = onDimensionChange(jest.fn());
    unsub();
    // Double unsubscribe should not throw or remove again
    expect(() => unsub()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Safe area insets (fallback path)
// ---------------------------------------------------------------------------

describe('getDefaultSafeAreaInsets', () => {
  it('returns iOS defaults', () => {
    // Default mock has Platform.OS = 'ios'
    const insets = getDefaultSafeAreaInsets();
    expect(insets).toEqual({ top: 44, bottom: 34, left: 0, right: 0 });
  });
});

describe('getSafeAreaInsets', () => {
  it('falls back to platform defaults when react-native-safe-area-context is unavailable', () => {
    // In test environment, react-native-safe-area-context is not installed
    const insets = getSafeAreaInsets();
    // Should return iOS defaults since Platform.OS mock is 'ios'
    expect(insets.top).toBe(44);
    expect(insets.bottom).toBe(34);
  });

  it('returns a copy (not a reference to internal state)', () => {
    const insets1 = getSafeAreaInsets();
    const insets2 = getSafeAreaInsets();
    expect(insets1).toEqual(insets2);
    expect(insets1).not.toBe(insets2);
  });
});
