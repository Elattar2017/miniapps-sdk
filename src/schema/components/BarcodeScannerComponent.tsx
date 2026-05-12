/**
 * BarcodeScannerComponent - Live camera barcode/QR code scanner
 *
 * Renders a camera viewfinder with native barcode detection.
 * Children are rendered as absolute-positioned overlays (scan_frame,
 * corner_brackets, scan_line, etc.).
 *
 * Fires onScan event with { value, format } when a barcode is detected.
 * Uses platform-native detection:
 *   - iOS: AVCaptureMetadataOutput (Apple Vision framework)
 *   - Android: Google ML Kit barcode scanning via CameraX ImageAnalysis
 *
 * @module schema/components/BarcodeScannerComponent
 */

import React, { useMemo, useCallback, Component } from 'react';
import { SDKView, SDKText } from '../../adapters';
import { getCameraView, MockCameraView } from '../../adapters/CameraViewAdapter';
import type { SchemaComponentProps } from '../../types';

/** Error boundary to prevent native camera/scanner crashes from killing the app */
class ScannerErrorBoundary extends Component<
  { children?: React.ReactNode; cameraFacing: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return React.createElement(MockCameraView, {
        cameraFacing: this.props.cameraFacing as 'front' | 'back',
        style: { width: '100%', height: '100%' },
      });
    }
    return this.props.children;
  }
}

export const BarcodeScannerComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const cameraFacing = (node.cameraFacing ?? node.props?.cameraFacing ?? 'back') as string;
  const formats = (node.formats ?? node.props?.formats ?? ['qr', 'ean-13', 'code-128']) as string[];
  const torch = (node.torch ?? node.props?.torch ?? false) as boolean;
  const scanInterval = (node.scanInterval ?? node.props?.scanInterval ?? 1500) as number;
  const activeRaw = node.active ?? node.props?.active ?? true;

  // Resolve cameraFacing expression
  const resolvedFacing = useMemo(() => {
    if (typeof cameraFacing === 'string' && cameraFacing.startsWith('$state.')) {
      const key = cameraFacing.slice(7);
      const val = context.state?.[key];
      return val === 'front' ? 'front' : 'back';
    }
    return cameraFacing === 'front' ? 'front' : 'back';
  }, [cameraFacing, context.state]);

  // Resolve active expression
  const isActive = useMemo(() => {
    const val = activeRaw;
    if (typeof val === 'string' && val.startsWith('$state.')) {
      const key = val.slice(7);
      return !!context.state?.[key];
    }
    return !!val;
  }, [activeRaw, context.state]);

  // Handle native barcode detection event — fires onScan action(s)
  // Resolves $event.value and $event.format inline before dispatching,
  // because the expression engine may not have $event in its context
  // at the ScreenRenderer action dispatch level.
  const handleBarcodeDetected = useCallback((event: { nativeEvent: { value: string; format: string } }) => {
    const { value, format } = event.nativeEvent;
    const onScan = node.onScan ?? node.props?.onScan;
    if (onScan && context.onAction) {
      const actions = Array.isArray(onScan) ? onScan : [onScan];
      for (const action of actions) {
        // Pre-resolve $event references in the action before dispatching
        const resolved = JSON.parse(
          JSON.stringify(action)
            .replace(/\$event\.value/g, value)
            .replace(/\$event\.format/g, format),
        );
        context.onAction({
          ...resolved,
          payload: { ...(resolved.payload ?? {}), value, format },
        });
      }
    }
  }, [node.onScan, node.props?.onScan, context]);

  // Get the native camera feed component (stable ref from module-level cache)
  const CameraFeed = getCameraView();

  // Container styles — match CameraViewComponent pattern
  const containerWidth = (node.style?.width as number) ?? 300;
  const containerHeight = (node.style?.height as number) ?? 280;
  const containerBorderRadius = (node.style?.borderRadius as number) ?? 16;

  const containerStyle = useMemo(() => ({
    ...(node.style ?? {}),
    width: containerWidth,
    height: containerHeight,
    borderRadius: containerBorderRadius,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    backgroundColor: '#1a1a2e',
  }), [node.style, containerWidth, containerHeight, containerBorderRadius]);

  const feedStyle = useMemo(() => ({
    width: '100%' as const,
    height: '100%' as const,
  }), []);

  const overlayStyle = useMemo(() => ({
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }), []);

  return React.createElement(
    SDKView,
    {
      style: containerStyle,
      accessibilityRole: 'none' as const,
      accessibilityLabel: `Barcode scanner (${resolvedFacing} camera)`,
    },
    // Camera feed with native barcode detection — wrapped in error boundary
    React.createElement(ScannerErrorBoundary, { cameraFacing: resolvedFacing },
      React.createElement(CameraFeed, {
        cameraId: node.id,
        cameraFacing: resolvedFacing,
        mirror: false,
        style: feedStyle,
        // Native barcode detection props — passed through to SDKCameraView
        barcodeScanEnabled: isActive,
        barcodeFormats: formats,
        scanInterval,
        onBarcodeDetected: handleBarcodeDetected,
      }),
    ),
    // Overlay children (scan_frame, corner_brackets, scan_line, etc.)
    children ? React.createElement(
      SDKView,
      { style: overlayStyle, pointerEvents: 'box-none' as const },
      children,
    ) : null,
    // Torch indicator
    torch ? React.createElement(
      SDKView,
      {
        style: {
          position: 'absolute' as const,
          top: 8,
          left: 8,
          backgroundColor: 'rgba(255,200,0,0.8)',
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
      },
      React.createElement(SDKText, { style: { color: '#000', fontSize: 10, fontWeight: '600' as const } }, 'Torch ON'),
    ) : null,
    // Paused indicator when scanning is disabled
    !isActive ? React.createElement(
      SDKView,
      {
        style: {
          position: 'absolute' as const,
          top: 8,
          right: 8,
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 4,
        },
      },
      React.createElement(SDKText, { style: { color: '#fff', fontSize: 10 } }, 'Paused'),
    ) : null,
  );
};

BarcodeScannerComponent.displayName = 'BarcodeScannerComponent';
