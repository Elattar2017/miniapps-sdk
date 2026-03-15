/**
 * RenderAdapter - Native Bridge Stability Layer for React Native core components
 *
 * Wraps all React Native core components behind a stable interface.
 * If React Native renames or changes APIs in future versions,
 * only this file needs to be updated.
 *
 * @module adapters/RenderAdapter
 */

import React from 'react';
import {
  View as RNView,
  Text as RNText,
  Image as RNImage,
  TextInput as RNTextInput,
  ScrollView as RNScrollView,
  FlatList as RNFlatList,
  TouchableOpacity as RNTouchableOpacity,
  ActivityIndicator as RNActivityIndicator,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Modal as RNModal,
  StyleSheet as RNStyleSheet,
  Platform as RNPlatform,
} from 'react-native';

import type {
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
} from 'react-native';

import { logger } from '../utils/logger';

const adapterLogger = logger.child({ component: 'RenderAdapter' });

// ---------------------------------------------------------------------------
// Wrapped Components
// ---------------------------------------------------------------------------

/**
 * Stable View wrapper. Logs if the underlying RN component is missing
 * so that a future major-version migration surfaces immediately.
 */
const SDKView = React.forwardRef<RNView, ViewProps>(
  function SDKView(props, ref) {
    return React.createElement(RNView, { ...props, ref });
  },
);
SDKView.displayName = 'SDKView';

/**
 * Stable Text wrapper.
 */
const SDKText = React.forwardRef<RNText, TextProps>(
  function SDKText(props, ref) {
    return React.createElement(RNText, { ...props, ref });
  },
);
SDKText.displayName = 'SDKText';

/**
 * Stable Image wrapper.
 */
const SDKImage = React.forwardRef<RNImage, ImageProps>(
  function SDKImage(props, ref) {
    return React.createElement(RNImage, { ...props, ref });
  },
);
SDKImage.displayName = 'SDKImage';

/**
 * Stable TextInput wrapper.
 */
const SDKTextInput = React.forwardRef<RNTextInput, TextInputProps>(
  function SDKTextInput(props, ref) {
    return React.createElement(RNTextInput, { ...props, ref });
  },
);
SDKTextInput.displayName = 'SDKTextInput';

/**
 * Stable ScrollView wrapper.
 */
const SDKScrollView = React.forwardRef<RNScrollView, ScrollViewProps>(
  function SDKScrollView(props, ref) {
    return React.createElement(RNScrollView, { ...props, ref });
  },
);
SDKScrollView.displayName = 'SDKScrollView';

/**
 * Stable FlatList wrapper.
 * FlatList is generic so we re-export the class reference directly
 * behind a named alias. Components consuming this should use
 * `SDKFlatList` instead of importing from 'react-native'.
 */
function SDKFlatList<T>(props: FlatListProps<T>): React.ReactElement {
  return React.createElement(RNFlatList as React.ComponentType<FlatListProps<T>>, props);
}
SDKFlatList.displayName = 'SDKFlatList';

/**
 * Stable TouchableOpacity wrapper.
 */
const SDKTouchableOpacity = React.forwardRef<typeof RNTouchableOpacity, TouchableOpacityProps>(
  function SDKTouchableOpacity(props, ref) {
    return React.createElement(RNTouchableOpacity, { ...props, ref } as TouchableOpacityProps);
  },
);
SDKTouchableOpacity.displayName = 'SDKTouchableOpacity';

/**
 * Stable ActivityIndicator wrapper.
 */
const SDKActivityIndicator = React.forwardRef<RNView, ActivityIndicatorProps>(
  function SDKActivityIndicator(props, ref) {
    return React.createElement(RNActivityIndicator, { ...props, ref } as ActivityIndicatorProps);
  },
);
SDKActivityIndicator.displayName = 'SDKActivityIndicator';

/**
 * Stable KeyboardAvoidingView wrapper.
 */
function SDKKeyboardAvoidingView(props: KeyboardAvoidingViewProps): React.ReactElement {
  return React.createElement(RNKeyboardAvoidingView, props);
}
SDKKeyboardAvoidingView.displayName = 'SDKKeyboardAvoidingView';

/**
 * Stable Modal wrapper.
 */
const SDKModal = React.forwardRef<RNView, ModalProps>(
  function SDKModal(props, ref) {
    return React.createElement(RNModal, { ...props, ref } as ModalProps);
  },
);
SDKModal.displayName = 'SDKModal';

// ---------------------------------------------------------------------------
// StyleSheet & Platform pass-through
// ---------------------------------------------------------------------------

/**
 * Stable StyleSheet reference.
 */
const SDKStyleSheet = RNStyleSheet;

/**
 * Stable Platform reference.
 */
const SDKPlatform = RNPlatform;

// ---------------------------------------------------------------------------
// Initialization guard
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Validates that all required RN primitives exist at SDK boot time.
 * Should be called once during kernel initialization.
 */
function initializeRenderAdapter(): void {
  if (_initialized) {
    return;
  }

  const requiredComponents: Array<[string, unknown]> = [
    ['View', RNView],
    ['Text', RNText],
    ['Image', RNImage],
    ['TextInput', RNTextInput],
    ['ScrollView', RNScrollView],
    ['FlatList', RNFlatList],
    ['TouchableOpacity', RNTouchableOpacity],
    ['ActivityIndicator', RNActivityIndicator],
    ['Modal', RNModal],
    ['StyleSheet', RNStyleSheet],
    ['Platform', RNPlatform],
  ];

  for (const [name, component] of requiredComponents) {
    if (component == null) {
      adapterLogger.error(`React Native component "${name}" is not available. SDK rendering may fail.`);
    }
  }

  _initialized = true;
  adapterLogger.debug('RenderAdapter initialized successfully');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
  SDKPlatform,
  initializeRenderAdapter,
};

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
};
