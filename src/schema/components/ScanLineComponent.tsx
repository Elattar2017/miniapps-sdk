/**
 * ScanLineComponent - Sweeping scan line overlay for camera viewfinders
 *
 * Note: In React Native, the line is rendered at a static 50% position.
 * Animation is handled in the web portal preview via CSS keyframes.
 *
 * @module schema/components/ScanLineComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ScanLineComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const lineColor = (node.lineColor ?? (node.props?.lineColor as string | undefined) ?? '#00FF00') as string;
  const lineWidth = (node.lineWidth ?? (node.props?.lineWidth as number | undefined) ?? 2) as number;
  const glowEffect = (node.glowEffect ?? (node.props?.glowEffect as boolean | undefined) ?? true) as boolean;

  const elements: React.ReactElement[] = [];

  // Glow layer behind the line
  if (glowEffect) {
    elements.push(
      React.createElement(SDKView, {
        key: 'glow',
        style: {
          position: 'absolute' as const,
          top: '50%',
          left: 0,
          right: 0,
          height: 20,
          marginTop: -10,
          backgroundColor: lineColor,
          opacity: 0.2,
        },
      }),
    );
  }

  // Main scan line
  elements.push(
    React.createElement(SDKView, {
      key: 'line',
      style: {
        position: 'absolute' as const,
        top: '50%',
        left: 0,
        right: 0,
        height: lineWidth,
        marginTop: -(lineWidth / 2),
        backgroundColor: lineColor,
      },
    }),
  );

  return React.createElement(
    SDKView,
    {
      style: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none' as const,
        overflow: 'hidden' as const,
      },
    },
    ...elements,
  );
};

ScanLineComponent.displayName = 'ScanLineComponent';
