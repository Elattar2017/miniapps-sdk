jest.mock("react-native");

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import {
  isReanimatedAvailable,
  initializeReanimatedAdapter,
  getReanimated,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  ReanimatedView,
  ReanimatedText,
  ReanimatedScrollView,
} from '../../src/adapters/ReanimatedAdapter';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Test component that uses shared values
const SharedValueConsumer: React.FC<{ initial: number }> = ({ initial }) => {
  const sv = useSharedValue(initial);
  return React.createElement('View', { testID: 'value' }, String(sv.value));
};

// Test component that uses animated style
const AnimatedStyleConsumer: React.FC<{ opacity: number }> = ({ opacity }) => {
  const style = useAnimatedStyle(() => ({ opacity }), [opacity]);
  return React.createElement('View', { testID: 'styled', style });
};

describe('ReanimatedAdapter', () => {
  describe('isReanimatedAvailable', () => {
    it('returns false when reanimated is not installed', () => {
      expect(isReanimatedAvailable()).toBe(false);
    });
  });

  describe('initializeReanimatedAdapter', () => {
    it('does not throw', () => {
      expect(() => initializeReanimatedAdapter()).not.toThrow();
    });

    it('is idempotent', () => {
      initializeReanimatedAdapter();
      initializeReanimatedAdapter();
    });
  });

  describe('useSharedValue', () => {
    it('returns object with .value set to initial value', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(SharedValueConsumer, { initial: 42 }));
      });
      const el = tree!.root.find(e => e.props.testID === 'value');
      expect(el.children[0]).toBe('42');
    });

    it('value is settable', () => {
      let sharedVal: any;
      const TestComp: React.FC = () => {
        sharedVal = useSharedValue(0);
        return React.createElement('View', {}, String(sharedVal.value));
      };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TestComp)); });
      act(() => { sharedVal.value = 100; });
      expect(sharedVal.value).toBe(100);
    });

    it('multiple shared values are independent', () => {
      let sv1: any, sv2: any;
      const TestComp: React.FC = () => {
        sv1 = useSharedValue(10);
        sv2 = useSharedValue(20);
        return React.createElement('View', {},
          React.createElement('Text', { testID: 'v1' }, String(sv1.value)),
          React.createElement('Text', { testID: 'v2' }, String(sv2.value)),
        );
      };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TestComp)); });
      expect(sv1.value).toBe(10);
      expect(sv2.value).toBe(20);
      sv1.value = 99;
      expect(sv1.value).toBe(99);
      expect(sv2.value).toBe(20);
    });

    it('supports non-numeric values', () => {
      let sv: any;
      const TestComp: React.FC = () => {
        sv = useSharedValue('hello');
        return React.createElement('View', {}, String(sv.value));
      };
      act(() => { create(React.createElement(TestComp)); });
      expect(sv.value).toBe('hello');
      sv.value = 'world';
      expect(sv.value).toBe('world');
    });
  });

  describe('useAnimatedStyle', () => {
    it('returns style object from updater', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(AnimatedStyleConsumer, { opacity: 0.5 }));
      });
      const el = tree!.root.find(e => e.props.testID === 'styled');
      expect(el.props.style).toEqual({ opacity: 0.5 });
    });

    it('updates when deps change', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(AnimatedStyleConsumer, { opacity: 0.5 }));
      });
      act(() => {
        tree!.update(React.createElement(AnimatedStyleConsumer, { opacity: 1.0 }));
      });
      const el = tree!.root.find(e => e.props.testID === 'styled');
      expect(el.props.style).toEqual({ opacity: 1.0 });
    });
  });

  describe('withTiming', () => {
    it('returns the target value', () => {
      expect(withTiming(1)).toBe(1);
    });

    it('accepts config', () => {
      expect(withTiming(0.5, { duration: 300 })).toBe(0.5);
    });
  });

  describe('withSpring', () => {
    it('returns the target value', () => {
      expect(withSpring(1)).toBe(1);
    });

    it('accepts config', () => {
      expect(withSpring(0, { damping: 10, stiffness: 100 })).toBe(0);
    });
  });

  describe('withDelay', () => {
    it('returns the animation value', () => {
      expect(withDelay(500, 1)).toBe(1);
    });
  });

  describe('withSequence', () => {
    it('returns last value', () => {
      expect(withSequence(0, 0.5, 1)).toBe(1);
    });

    it('returns 0 for empty sequence', () => {
      expect(withSequence()).toBe(0);
    });
  });

  describe('withRepeat', () => {
    it('returns the animation value', () => {
      expect(withRepeat(1, 3)).toBe(1);
    });

    it('supports reverse flag', () => {
      expect(withRepeat(1, 2, true)).toBe(1);
    });
  });

  describe('getReanimated', () => {
    it('returns null when reanimated is not installed', () => {
      expect(getReanimated()).toBeNull();
    });
  });

  describe('delegation pattern', () => {
    it('withTiming returns value in fallback mode (no Reanimated)', () => {
      expect(isReanimatedAvailable()).toBe(false);
      expect(withTiming(42, { duration: 500 })).toBe(42);
    });

    it('withSpring returns value in fallback mode', () => {
      expect(withSpring(10, { damping: 15, stiffness: 200 })).toBe(10);
    });

    it('withDelay returns animation value in fallback mode', () => {
      expect(withDelay(1000, 5)).toBe(5);
    });

    it('withSequence returns last value in fallback mode', () => {
      expect(withSequence(1, 2, 3, 4)).toBe(4);
    });

    it('withRepeat returns animation value in fallback mode', () => {
      expect(withRepeat(7, 3, true)).toBe(7);
    });
  });

  describe('Animated components', () => {
    it('ReanimatedView renders without crashing', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ReanimatedView, { style: { opacity: 1 } }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('ReanimatedText renders without crashing', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ReanimatedText, {}, 'Hello'));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('ReanimatedScrollView renders without crashing', () => {
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ReanimatedScrollView, {}));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });
  });
});
