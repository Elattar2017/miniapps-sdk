/**
 * CameraViewComponent - Live camera viewfinder with composable overlay children
 *
 * Rendering structure:
 *   SDKView (container — applies shape mask via borderRadius + overflow:hidden)
 *     ├── CameraFeed (native view or mock placeholder)
 *     └── SDKView (overlay container — position:absolute, covers full area)
 *          └── ...children (schema nodes: icons, text, views, buttons, etc.)
 *
 * Shape handling (all via styles — fully declarative):
 *   - 'circle'  → borderRadius = min(width, height) / 2
 *   - 'square'  → no borderRadius
 *   - 'rounded' → borderRadius = 16 (default)
 *   - Override any of these via explicit style.borderRadius in schema
 *
 * cameraFacing as expression:
 *   - "$state.facing" → switches camera when state changes
 *   - Module dev toggles via update_state action from any button
 *
 * mirror:
 *   - true → transform: [{ scaleX: -1 }] on feed
 *   - Auto-enabled for front camera if not explicitly set
 *
 * Children as overlays:
 *   - Rendered in absolute-positioned overlay container on top of feed
 *   - Module dev can add ANY schema components as overlays
 *
 * @module schema/components/CameraViewComponent
 */

import React, { useMemo, Component } from 'react';
import { SDKView } from '../../adapters';
import { getCameraView, MockCameraView } from '../../adapters/CameraViewAdapter';
import type { SchemaComponentProps } from '../../types';

/** Error boundary to prevent native camera crashes from killing the app */
class CameraErrorBoundary extends Component<
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

export const CameraViewComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const cameraFacing = (node.cameraFacing ?? node.props?.cameraFacing ?? 'back') as string;

  // Resolve expression for cameraFacing (e.g., "$state.cameraFacing")
  const resolvedFacing = useMemo(() => {
    if (cameraFacing.startsWith('$state.')) {
      const key = cameraFacing.slice(7);
      const val = context.state?.[key];
      return val === 'front' ? 'front' : 'back';
    }
    return cameraFacing === 'front' ? 'front' : 'back';
  }, [cameraFacing, context.state]);

  const shape = (node.shape ?? node.props?.shape ?? 'rounded') as string;
  const mirrorProp = node.mirror ?? (node.props?.mirror as boolean | undefined);

  // Auto-mirror for front camera if not explicitly set
  const shouldMirror = mirrorProp !== undefined ? mirrorProp : resolvedFacing === 'front';

  const containerWidth = (node.style?.width as number) ?? 250;
  const containerHeight = (node.style?.height as number) ?? 250;

  // Compute shape borderRadius
  const shapeBorderRadius = useMemo(() => {
    // Explicit style.borderRadius overrides shape
    if (node.style?.borderRadius !== undefined) {
      return node.style.borderRadius as number;
    }
    switch (shape) {
      case 'circle':
        return Math.min(
          typeof containerWidth === 'number' ? containerWidth : 250,
          typeof containerHeight === 'number' ? containerHeight : 250,
        ) / 2;
      case 'square':
        return 0;
      case 'rounded':
      default:
        return 16;
    }
  }, [shape, containerWidth, containerHeight, node.style?.borderRadius]);

  const containerStyle: Record<string, unknown> = {
    width: containerWidth,
    height: containerHeight,
    borderRadius: shapeBorderRadius,
    overflow: 'hidden',
    position: 'relative',
    ...(node.style ?? {}),
    // Re-apply shape borderRadius after spread (unless style had explicit borderRadius)
    ...(node.style?.borderRadius === undefined ? { borderRadius: shapeBorderRadius } : {}),
  };

  const feedStyle: Record<string, unknown> = {
    width: '100%',
    height: '100%',
    ...(shouldMirror ? { transform: [{ scaleX: -1 }] } : {}),
  };

  const CameraFeed = getCameraView();

  return React.createElement(
    SDKView,
    {
      style: containerStyle,
      accessibilityRole: 'none' as const,
      accessibilityLabel: `Camera viewfinder (${resolvedFacing})`,
    },
    // Camera feed — wrapped in error boundary to prevent native crashes
    React.createElement(CameraErrorBoundary, { cameraFacing: resolvedFacing },
      React.createElement(CameraFeed, {
        cameraId: node.id,
        cameraFacing: resolvedFacing,
        mirror: shouldMirror,
        style: feedStyle,
      }),
    ),
    // Overlay container for children (positioned on top of feed)
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
};

CameraViewComponent.displayName = 'CameraViewComponent';
