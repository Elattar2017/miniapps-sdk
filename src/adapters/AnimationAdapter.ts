/**
 * AnimationAdapter - Native Bridge Stability Layer for animations
 *
 * Phase 1 stub: Re-exports basic React Native Animated API.
 * Full Reanimated v3 integration planned for Phase 4.
 *
 * @module adapters/AnimationAdapter
 */

import { Animated as RNAnimated } from 'react-native';
import { logger } from '../utils/logger';

const animLogger = logger.child({ component: 'AnimationAdapter' });

// ---------------------------------------------------------------------------
// Re-exported Animated primitives
// ---------------------------------------------------------------------------

const SDKAnimated = RNAnimated;

/**
 * Stable reference to Animated.Value.
 */
const SDKAnimatedValue = RNAnimated.Value;

/**
 * Stable reference to Animated.ValueXY.
 */
const SDKAnimatedValueXY = RNAnimated.ValueXY;

// ---------------------------------------------------------------------------
// Animated component wrappers
// ---------------------------------------------------------------------------

const SDKAnimatedView = RNAnimated.View;
const SDKAnimatedText = RNAnimated.Text;
const SDKAnimatedImage = RNAnimated.Image;
const SDKAnimatedScrollView = RNAnimated.ScrollView;

// ---------------------------------------------------------------------------
// Animation factory helpers
// ---------------------------------------------------------------------------

/**
 * Configuration for a fade animation.
 */
interface FadeAnimationConfig {
  value: InstanceType<typeof RNAnimated.Value>;
  toValue: number;
  duration?: number;
  useNativeDriver?: boolean;
}

/**
 * Creates a timing-based fade animation.
 */
function createFadeAnimation(config: FadeAnimationConfig): RNAnimated.CompositeAnimation {
  return RNAnimated.timing(config.value, {
    toValue: config.toValue,
    duration: config.duration ?? 300,
    useNativeDriver: config.useNativeDriver ?? true,
  });
}

/**
 * Configuration for a slide animation.
 */
interface SlideAnimationConfig {
  value: InstanceType<typeof RNAnimated.Value>;
  toValue: number;
  duration?: number;
  useNativeDriver?: boolean;
}

/**
 * Creates a timing-based slide animation (typically for translateY or translateX).
 */
function createSlideAnimation(config: SlideAnimationConfig): RNAnimated.CompositeAnimation {
  return RNAnimated.timing(config.value, {
    toValue: config.toValue,
    duration: config.duration ?? 250,
    useNativeDriver: config.useNativeDriver ?? true,
  });
}

/**
 * Creates a spring animation for bouncy interactions.
 */
interface SpringAnimationConfig {
  value: InstanceType<typeof RNAnimated.Value>;
  toValue: number;
  friction?: number;
  tension?: number;
  useNativeDriver?: boolean;
}

function createSpringAnimation(config: SpringAnimationConfig): RNAnimated.CompositeAnimation {
  return RNAnimated.spring(config.value, {
    toValue: config.toValue,
    friction: config.friction ?? 7,
    tension: config.tension ?? 40,
    useNativeDriver: config.useNativeDriver ?? true,
  });
}

// ---------------------------------------------------------------------------
// Animation composition helpers
// ---------------------------------------------------------------------------

/**
 * Creates a sequential animation that runs animations one after another.
 */
function createSequenceAnimation(
  animations: RNAnimated.CompositeAnimation[],
): RNAnimated.CompositeAnimation {
  return RNAnimated.sequence(animations);
}

/**
 * Creates a parallel animation that runs all animations simultaneously.
 */
function createParallelAnimation(
  animations: RNAnimated.CompositeAnimation[],
): RNAnimated.CompositeAnimation {
  return RNAnimated.parallel(animations);
}

/**
 * Creates a looping animation.
 * @param animation The animation to loop
 * @param iterations Number of loops (-1 for infinite). Defaults to -1.
 */
function createLoopAnimation(
  animation: RNAnimated.CompositeAnimation,
  iterations: number = -1,
): RNAnimated.CompositeAnimation {
  return RNAnimated.loop(animation, { iterations });
}

/**
 * Creates a staggered animation that starts each animation with a delay offset.
 * @param delay Delay in ms between each animation start
 * @param animations Array of animations to stagger
 */
function createStaggerAnimation(
  delay: number,
  animations: RNAnimated.CompositeAnimation[],
): RNAnimated.CompositeAnimation {
  return RNAnimated.stagger(delay, animations);
}

/**
 * Creates a delay animation (useful inside sequences).
 * @param duration Delay duration in ms
 */
function createDelayAnimation(duration: number): RNAnimated.CompositeAnimation {
  return RNAnimated.delay(duration);
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Validates that the RN Animated API is available. Called at SDK boot.
 */
function initializeAnimationAdapter(): void {
  if (_initialized) {
    return;
  }

  if (!RNAnimated || !RNAnimated.Value) {
    animLogger.error('React Native Animated API is not available. Animations will be disabled.');
  } else {
    animLogger.debug('AnimationAdapter initialized successfully');
  }

  _initialized = true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
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
  createSequenceAnimation,
  createParallelAnimation,
  createLoopAnimation,
  createStaggerAnimation,
  createDelayAnimation,
  initializeAnimationAdapter,
};

export type {
  FadeAnimationConfig,
  SlideAnimationConfig,
  SpringAnimationConfig,
};
