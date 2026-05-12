/**
 * CameraViewAdapter - Native camera view + mock/web fallback
 *
 * On native: resolves SDKCameraView via requireNativeComponent (Fabric view).
 * On web/test: renders a placeholder with camera icon styling.
 *
 * @module adapters/CameraViewAdapter
 */

import React from 'react';
import { logger } from '../utils/logger';

const adapterLogger = logger.child({ component: 'CameraViewAdapter' });

/**
 * Props for the native camera view component.
 */
export interface CameraViewProps {
  cameraId?: string;
  cameraFacing?: 'front' | 'back';
  mirror?: boolean;
  style?: Record<string, unknown>;
  children?: React.ReactNode;
  // Barcode scanner props (passed through to native view when present)
  barcodeScanEnabled?: boolean;
  barcodeFormats?: string[];
  scanInterval?: number;
  onBarcodeDetected?: (event: { nativeEvent: { value: string; format: string } }) => void;
}

/**
 * Attempt to resolve the native Fabric view component.
 * Returns null if not in a React Native environment or if the native view is not registered.
 */
function tryResolveNativeView(): React.ComponentType<CameraViewProps> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    const { requireNativeComponent, Platform } = RN;

    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return null;
    }

    // On RN 0.84 New Architecture (bridgeless), UIManager.getViewManagerConfig
    // does NOT reflect Fabric-registered components. Skip that check entirely.
    // The CameraErrorBoundary in CameraViewComponent catches render failures.
    if (typeof requireNativeComponent === 'function') {
      const NativeView = requireNativeComponent('SDKCameraView');
      if (NativeView) {
        adapterLogger.info('Native SDKCameraView resolved via requireNativeComponent');
        return NativeView as React.ComponentType<CameraViewProps>;
      }
    }
  } catch (err) {
    adapterLogger.warn('Failed to resolve native SDKCameraView', { error: String(err) });
  }
  return null;
}

/**
 * Mock camera view for web preview and test environments.
 * Renders a dashed-border container with a camera icon placeholder.
 */
const MockCameraView: React.FC<CameraViewProps> = ({ style, children, cameraFacing }) => {
  // Use SDKView/SDKText if available, fall back to basic elements
  try {
    const { SDKView, SDKText } = require('./RenderAdapter');
    return React.createElement(
      SDKView,
      {
        style: {
          backgroundColor: '#1a1a2e',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          ...style,
        },
        accessibilityRole: 'none' as const,
      },
      // Camera icon placeholder
      React.createElement(SDKText, {
        style: { fontSize: 40, color: 'rgba(255,255,255,0.4)' },
        children: '📷',
      }),
      React.createElement(SDKText, {
        style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6 },
        children: `Camera (${cameraFacing ?? 'back'})`,
      }),
      // Overlay container for children (absolute positioning)
      children
        ? React.createElement(
            SDKView,
            {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              },
            },
            children,
          )
        : null,
    );
  } catch {
    adapterLogger.debug('RenderAdapter not available, returning null for MockCameraView');
    return null;
  }
};

MockCameraView.displayName = 'MockCameraView';

// ---------------------------------------------------------------------------
// Resolved component
// ---------------------------------------------------------------------------

let _resolvedView: React.ComponentType<CameraViewProps> | null = null;
let _resolved = false;

/**
 * Returns the camera view component.
 * Native SDKCameraView on device, MockCameraView on web/test.
 */
export function getCameraView(): React.ComponentType<CameraViewProps> {
  if (!_resolved) {
    _resolvedView = tryResolveNativeView();
    _resolved = true;
  }
  return _resolvedView ?? MockCameraView;
}

export { MockCameraView };
