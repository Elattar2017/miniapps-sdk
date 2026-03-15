/**
 * Native Bridge Stability Layer - Adapter re-exports
 *
 * All adapters are re-exported from this barrel file.
 * SDK components should import from '@sdk/adapters' rather than
 * from individual adapter files.
 *
 * @module adapters
 */

// RenderAdapter - React Native core component wrappers
export {
  SDKView,
  SDKText,
  SDKImage,
  SDKTextInput,
  SDKScrollView,
  SDKFlatList,
  SDKTouchableOpacity,
  SDKActivityIndicator,
  SDKKeyboardAvoidingView,
  SDKModal,
  SDKStyleSheet,
  initializeRenderAdapter,
} from './RenderAdapter';

export type {
  ViewProps,
  TextProps,
  ImageProps,
  TextInputProps,
  ScrollViewProps,
  FlatListProps,
  TouchableOpacityProps,
  ActivityIndicatorProps,
  KeyboardAvoidingViewProps,
  ModalProps,
  ViewStyle,
  TextStyle,
  ImageStyle,
} from './RenderAdapter';

// NavigationAdapter - React Navigation v7+ wrappers
export {
  createSDKNavigator,
  SDKNavigationContainer,
  isNavigationAvailable,
  StubNavigationManager,
  RealNavigationManager,
} from './NavigationAdapter';

export type {
  SDKNavigator,
  SDKNavigationContainerProps,
  NavigationListener,
} from './NavigationAdapter';

// StorageAdapter - MMKV / SQLite wrappers with key prefixing
export {
  StorageAdapter,
  createStorageAdapter,
  InMemoryStorage,
} from './StorageAdapter';

export type { StorageAdapterConfig } from './StorageAdapter';

// AnimationAdapter - React Native Animated API wrappers
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
  initializeAnimationAdapter,
} from './AnimationAdapter';

export type {
  FadeAnimationConfig,
  SlideAnimationConfig,
  SpringAnimationConfig,
} from './AnimationAdapter';

// PlatformAdapter - Platform detection, dimensions, safe area
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
} from './PlatformAdapter';

export type {
  SDKPlatform,
  ScreenDimensions,
  SafeAreaInsets,
  DeviceCapabilities,
  DimensionChangeListener,
} from './PlatformAdapter';

// CameraViewAdapter - Native camera view + mock fallback
export { getCameraView, MockCameraView } from './CameraViewAdapter';
export type { CameraViewProps } from './CameraViewAdapter';

// BridgeAdapter - TurboModule/JSI communication
export {
  getNativeModule,
  isNativeModuleAvailable,
  initializeBridgeAdapter,
  MockCryptoModule,
  MockDeviceIntegrityModule,
  MockMediaModule,
} from './BridgeAdapter';

export type {
  NativeCryptoModule,
  NativeDeviceIntegrityModule,
  NativeMediaModule,
  NativeModuleMap,
  NativeModuleName,
} from './BridgeAdapter';
