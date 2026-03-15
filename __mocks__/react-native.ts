/**
 * React Native Mock - Provides mock implementations of essential RN components and APIs
 *
 * Used by Jest to replace the real 'react-native' module in tests so that
 * SDK components can be rendered and tested without a native runtime.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Mock Components
// ---------------------------------------------------------------------------

function createMockComponent(name: string): React.ForwardRefExoticComponent<
  React.PropsWithChildren<Record<string, unknown>> & React.RefAttributes<unknown>
> {
  return React.forwardRef(function MockComponent(
    props: React.PropsWithChildren<Record<string, unknown>>,
    ref: React.Ref<unknown>,
  ) {
    return React.createElement(name, { ...props, ref }, props.children);
  });
}

export const View = createMockComponent('View');
export const Text = createMockComponent('Text');
export const TextInput = createMockComponent('TextInput');
export const Image = createMockComponent('Image');
export const ScrollView = createMockComponent('ScrollView');
export const FlatList = createMockComponent('FlatList');
export const TouchableOpacity = createMockComponent('TouchableOpacity');
export const ActivityIndicator = createMockComponent('ActivityIndicator');
export const KeyboardAvoidingView = createMockComponent('KeyboardAvoidingView');
export const Modal = createMockComponent('Modal');

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

export const StyleSheet = {
  create<T extends Record<string, Record<string, unknown>>>(styles: T): T {
    return styles;
  },
  flatten(
    style: Record<string, unknown> | Record<string, unknown>[] | undefined,
  ): Record<string, unknown> {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style) as Record<string, unknown>;
    }
    return (style ?? {}) as Record<string, unknown>;
  },
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export const Platform = {
  OS: 'ios' as const,
  Version: '16.0',
  select<T>(options: { ios?: T; android?: T; default?: T }): T | undefined {
    return options.ios ?? options.default;
  },
  isPad: false,
  isTVOS: false,
  isTV: false,
  constants: {
    reactNativeVersion: {
      major: 0,
      minor: 76,
      patch: 0,
    },
  },
};

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

const dimensionData: Record<string, { width: number; height: number; scale: number; fontScale: number }> = {
  window: { width: 375, height: 812, scale: 2, fontScale: 1 },
  screen: { width: 375, height: 812, scale: 2, fontScale: 1 },
};

export const Dimensions = {
  get(dim: string): { width: number; height: number; scale: number; fontScale: number } {
    return dimensionData[dim] ?? { width: 375, height: 812, scale: 2, fontScale: 1 };
  },
  addEventListener(_event: string, _handler: (...args: unknown[]) => void): { remove: () => void } {
    return { remove: () => {} };
  },
  set(dims: Record<string, { width: number; height: number; scale?: number; fontScale?: number }>): void {
    Object.assign(dimensionData, dims);
  },
};

// ---------------------------------------------------------------------------
// Animated
// ---------------------------------------------------------------------------

class MockAnimatedValue {
  private value: number;

  constructor(val: number) {
    this.value = val;
  }

  setValue(val: number): void {
    this.value = val;
  }

  addListener(_callback: (state: { value: number }) => void): string {
    return 'mock-listener-id';
  }

  removeListener(_id: string): void {}

  removeAllListeners(): void {}

  interpolate(config: { inputRange: number[]; outputRange: (number | string)[] }): MockAnimatedValue {
    return new MockAnimatedValue(0);
  }

  stopAnimation(callback?: (value: number) => void): void {
    callback?.(this.value);
  }
}

class MockAnimatedValueXY {
  x: MockAnimatedValue;
  y: MockAnimatedValue;

  constructor(valueIn?: { x: number; y: number }) {
    this.x = new MockAnimatedValue(valueIn?.x ?? 0);
    this.y = new MockAnimatedValue(valueIn?.y ?? 0);
  }

  setValue(value: { x: number; y: number }): void {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }

  getLayout(): { left: MockAnimatedValue; top: MockAnimatedValue } {
    return { left: this.x, top: this.y };
  }

  stopAnimation(callback?: (value: { x: number; y: number }) => void): void {
    callback?.({ x: 0, y: 0 });
  }
}

export const Animated = {
  Value: MockAnimatedValue,
  ValueXY: MockAnimatedValueXY,
  View: createMockComponent('Animated.View'),
  Text: createMockComponent('Animated.Text'),
  Image: createMockComponent('Animated.Image'),
  ScrollView: createMockComponent('Animated.ScrollView'),
  timing(
    _value: MockAnimatedValue,
    config: { toValue: number; duration?: number; useNativeDriver?: boolean },
  ): { start: (callback?: () => void) => void } {
    return {
      start: (callback?: () => void) => {
        callback?.();
      },
    };
  },
  spring(
    _value: MockAnimatedValue,
    config: { toValue: number; useNativeDriver?: boolean },
  ): { start: (callback?: () => void) => void } {
    return {
      start: (callback?: () => void) => {
        callback?.();
      },
    };
  },
  parallel(
    animations: Array<{ start: (callback?: () => void) => void }>,
  ): { start: (callback?: () => void) => void } {
    return {
      start: (callback?: () => void) => {
        callback?.();
      },
    };
  },
  sequence(
    animations: Array<{ start: (callback?: () => void) => void }>,
  ): { start: (callback?: () => void) => void } {
    return {
      start: (callback?: () => void) => {
        callback?.();
      },
    };
  },
  loop(
    animation: { start: (callback?: () => void) => void; stop: () => void; reset: () => void },
    config?: { iterations?: number },
  ): { start: (callback?: () => void) => void; stop: () => void; reset: () => void } {
    return {
      start: (callback?: () => void) => { callback?.(); },
      stop: () => {},
      reset: () => {},
    };
  },
  stagger(
    delay: number,
    animations: Array<{ start: (callback?: () => void) => void }>,
  ): { start: (callback?: () => void) => void; stop: () => void; reset: () => void } {
    return {
      start: (callback?: () => void) => { callback?.(); },
      stop: () => {},
      reset: () => {},
    };
  },
  delay(duration: number): { start: (callback?: () => void) => void; stop: () => void; reset: () => void } {
    return {
      start: (callback?: () => void) => { callback?.(); },
      stop: () => {},
      reset: () => {},
    };
  },
  createAnimatedComponent(component: React.ComponentType<Record<string, unknown>>): React.ComponentType<Record<string, unknown>> {
    return component;
  },
};

// ---------------------------------------------------------------------------
// TurboModule type
// ---------------------------------------------------------------------------

export interface TurboModule {}

// ---------------------------------------------------------------------------
// TurboModuleRegistry
// ---------------------------------------------------------------------------

export const TurboModuleRegistry = {
  get: jest.fn().mockReturnValue(null),
  getEnforcing: jest.fn().mockImplementation((name: string) => {
    throw new Error(`TurboModule '${name}' not found`);
  }),
};

// ---------------------------------------------------------------------------
// NativeModules
// ---------------------------------------------------------------------------

export const NativeModules = {};

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------

export const AppState = {
  currentState: 'active' as string,
  addEventListener(_event: string, _handler: (...args: unknown[]) => void): { remove: () => void } {
    return { remove: () => {} };
  },
};

// ---------------------------------------------------------------------------
// PixelRatio
// ---------------------------------------------------------------------------

export const PixelRatio = {
  get(): number {
    return 2;
  },
  getFontScale(): number {
    return 1;
  },
  getPixelSizeForLayoutSize(layoutSize: number): number {
    return layoutSize * 2;
  },
  roundToNearestPixel(layoutSize: number): number {
    return Math.round(layoutSize * 2) / 2;
  },
};

// ---------------------------------------------------------------------------
// Default export (for `import RN from 'react-native'` style imports)
// ---------------------------------------------------------------------------

export default {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Platform,
  Dimensions,
  Animated,
  TurboModuleRegistry,
  NativeModules,
  AppState,
  PixelRatio,
};
