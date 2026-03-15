jest.mock("react-native");

/**
 * AnimationAdapter Composition Helpers Test Suite
 *
 * Tests for createSequenceAnimation, createParallelAnimation,
 * createLoopAnimation, createStaggerAnimation, and createDelayAnimation.
 */

import { Animated } from 'react-native';
import {
  createFadeAnimation,
  createSlideAnimation,
  createSpringAnimation,
  createSequenceAnimation,
  createParallelAnimation,
  createLoopAnimation,
  createStaggerAnimation,
  createDelayAnimation,
  SDKAnimatedValue,
} from '../../src/adapters/AnimationAdapter';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Animation Composition Helpers', () => {
  describe('createSequenceAnimation', () => {
    it('returns a CompositeAnimation', () => {
      const val = new SDKAnimatedValue(0);
      const anim1 = createFadeAnimation({ value: val, toValue: 1 });
      const anim2 = createFadeAnimation({ value: val, toValue: 0 });
      const seq = createSequenceAnimation([anim1, anim2]);
      expect(seq).toBeDefined();
      expect(typeof seq.start).toBe('function');
    });

    it('calls Animated.sequence', () => {
      const spy = jest.spyOn(Animated, 'sequence');
      const val = new SDKAnimatedValue(0);
      const anims = [createFadeAnimation({ value: val, toValue: 1 })];
      createSequenceAnimation(anims);
      expect(spy).toHaveBeenCalledWith(anims);
    });

    it('handles empty array', () => {
      const seq = createSequenceAnimation([]);
      expect(seq).toBeDefined();
      expect(typeof seq.start).toBe('function');
    });

    it('handles single animation', () => {
      const val = new SDKAnimatedValue(0);
      const anim = createFadeAnimation({ value: val, toValue: 1 });
      const seq = createSequenceAnimation([anim]);
      expect(seq).toBeDefined();
    });
  });

  describe('createParallelAnimation', () => {
    it('returns a CompositeAnimation', () => {
      const val1 = new SDKAnimatedValue(0);
      const val2 = new SDKAnimatedValue(0);
      const anim1 = createFadeAnimation({ value: val1, toValue: 1 });
      const anim2 = createSlideAnimation({ value: val2, toValue: 100 });
      const par = createParallelAnimation([anim1, anim2]);
      expect(par).toBeDefined();
      expect(typeof par.start).toBe('function');
    });

    it('calls Animated.parallel', () => {
      const spy = jest.spyOn(Animated, 'parallel');
      const val = new SDKAnimatedValue(0);
      const anims = [createFadeAnimation({ value: val, toValue: 1 })];
      createParallelAnimation(anims);
      expect(spy).toHaveBeenCalledWith(anims);
    });

    it('handles empty array', () => {
      const par = createParallelAnimation([]);
      expect(par).toBeDefined();
    });
  });

  describe('createLoopAnimation', () => {
    it('returns a CompositeAnimation', () => {
      const val = new SDKAnimatedValue(0);
      const anim = createFadeAnimation({ value: val, toValue: 1 });
      const loop = createLoopAnimation(anim);
      expect(loop).toBeDefined();
      expect(typeof loop.start).toBe('function');
    });

    it('defaults to infinite iterations (-1)', () => {
      const spy = jest.spyOn(Animated as any, 'loop');
      const val = new SDKAnimatedValue(0);
      const anim = createFadeAnimation({ value: val, toValue: 1 });
      createLoopAnimation(anim);
      expect(spy).toHaveBeenCalledWith(anim, { iterations: -1 });
    });

    it('accepts custom iteration count', () => {
      const spy = jest.spyOn(Animated as any, 'loop');
      const val = new SDKAnimatedValue(0);
      const anim = createFadeAnimation({ value: val, toValue: 1 });
      createLoopAnimation(anim, 3);
      expect(spy).toHaveBeenCalledWith(anim, { iterations: 3 });
    });
  });

  describe('createStaggerAnimation', () => {
    it('returns a CompositeAnimation', () => {
      const val1 = new SDKAnimatedValue(0);
      const val2 = new SDKAnimatedValue(0);
      const anims = [
        createFadeAnimation({ value: val1, toValue: 1 }),
        createFadeAnimation({ value: val2, toValue: 1 }),
      ];
      const stagger = createStaggerAnimation(100, anims);
      expect(stagger).toBeDefined();
      expect(typeof stagger.start).toBe('function');
    });

    it('calls Animated.stagger with delay and animations', () => {
      const spy = jest.spyOn(Animated as any, 'stagger');
      const val = new SDKAnimatedValue(0);
      const anims = [createFadeAnimation({ value: val, toValue: 1 })];
      createStaggerAnimation(200, anims);
      expect(spy).toHaveBeenCalledWith(200, anims);
    });

    it('handles empty array', () => {
      const stagger = createStaggerAnimation(100, []);
      expect(stagger).toBeDefined();
    });
  });

  describe('createDelayAnimation', () => {
    it('returns a CompositeAnimation', () => {
      const del = createDelayAnimation(500);
      expect(del).toBeDefined();
      expect(typeof del.start).toBe('function');
    });

    it('calls Animated.delay with duration', () => {
      const spy = jest.spyOn(Animated as any, 'delay');
      createDelayAnimation(1000);
      expect(spy).toHaveBeenCalledWith(1000);
    });
  });

  describe('Composition nesting', () => {
    it('supports sequence containing parallel', () => {
      const val1 = new SDKAnimatedValue(0);
      const val2 = new SDKAnimatedValue(0);
      const parallel = createParallelAnimation([
        createFadeAnimation({ value: val1, toValue: 1 }),
        createSlideAnimation({ value: val2, toValue: 100 }),
      ]);
      const delay = createDelayAnimation(200);
      const seq = createSequenceAnimation([parallel, delay]);
      expect(seq).toBeDefined();
      expect(typeof seq.start).toBe('function');
    });

    it('supports loop containing sequence', () => {
      const val = new SDKAnimatedValue(0);
      const seq = createSequenceAnimation([
        createFadeAnimation({ value: val, toValue: 1 }),
        createFadeAnimation({ value: val, toValue: 0 }),
      ]);
      const loop = createLoopAnimation(seq, 5);
      expect(loop).toBeDefined();
      expect(typeof loop.start).toBe('function');
    });

    it('supports stagger with spring animations', () => {
      const val1 = new SDKAnimatedValue(0);
      const val2 = new SDKAnimatedValue(0);
      const val3 = new SDKAnimatedValue(0);
      const anims = [
        createSpringAnimation({ value: val1, toValue: 1 }),
        createSpringAnimation({ value: val2, toValue: 1 }),
        createSpringAnimation({ value: val3, toValue: 1 }),
      ];
      const stagger = createStaggerAnimation(50, anims);
      expect(stagger).toBeDefined();
      expect(typeof stagger.start).toBe('function');
    });
  });
});
