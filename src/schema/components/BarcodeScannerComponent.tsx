/**
 * BarcodeScannerComponent - Live camera barcode/QR code scanner
 *
 * Renders a camera viewfinder with native barcode detection.
 * Children are rendered as absolute-positioned overlays (scan_frame,
 * corner_brackets, scan_line, etc.).
 *
 * Fires onScan event with { value, format } when a barcode is detected.
 * Uses platform-native detection:
 *   - iOS: Apple Vision framework (VNDetectBarcodesRequest)
 *   - Android: Google ML Kit barcode scanning
 *
 * @module schema/components/BarcodeScannerComponent
 */

import React, { useMemo, useRef, useCallback, Component } from 'react';
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

  // Throttle scan events
  const lastScanRef = useRef<number>(0);

  // Dispatch onScan — pass action directly, $event via payload (matching existing component patterns)
  const handleBarcodesDetected = useCallback((barcodes: Array<{ value: string; format: string }>) => {
    if (!isActive || barcodes.length === 0) return;
    const now = Date.now();
    if (now - lastScanRef.current < scanInterval) return;
    lastScanRef.current = now;

    const barcode = barcodes[0];
    const onScan = node.onScan ?? node.props?.onScan;
    if (onScan && context.onAction) {
      const actions = Array.isArray(onScan) ? onScan : [onScan];
      for (const action of actions) {
        context.onAction({
          ...action,
          payload: { ...(action.payload ?? {}), value: barcode.value, format: barcode.format },
        });
      }
    }
  }, [isActive, scanInterval, node.onScan, node.props?.onScan, context]);

  // Get the native camera feed component (stable ref from module-level cache)
  const CameraFeed = getCameraView();

  // Container styles — node.style spread last so schema overrides take precedence
  const containerStyle = useMemo(() => ({
    overflow: 'hidden' as const,
    position: 'relative' as const,
    backgroundColor: '#1a1a2e',
    width: 250,
    height: 250,
    borderRadius: 16,
    ...(node.style ?? {}),
  }), [node.style]);

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
    // Camera feed with barcode detection — wrapped in error boundary
    React.createElement(ScannerErrorBoundary, { cameraFacing: resolvedFacing },
      React.createElement(CameraFeed as React.ComponentType<Record<string, unknown>>, {
        cameraId: node.id,
        cameraFacing: resolvedFacing,
        mirror: false,
        style: feedStyle,
        // Native barcode detection props (passed to native module)
        barcodeFormats: formats,
        barcodeScanEnabled: isActive,
        torchEnabled: torch,
        onBarcodesDetected: handleBarcodesDetected,
      }),
    ),
    // Overlay children (scan_frame, corner_brackets, scan_line, etc.)
    children ? React.createElement(
      SDKView,
      { style: overlayStyle, pointerEvents: 'box-none' as const },
      children,
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
      React.createElement(
        SDKText,
        { style: { color: '#fff', fontSize: 10 } },
        'Paused',
      ),
    ) : null,
  );
};

BarcodeScannerComponent.displayName = 'BarcodeScannerComponent';
