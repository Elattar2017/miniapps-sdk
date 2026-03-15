/**
 * GridOverlayComponent - Grid lines overlay (e.g. rule-of-thirds) for camera viewfinders
 * @module schema/components/GridOverlayComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const GridOverlayComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const rows = (node.rows ?? (node.props?.rows as number | undefined) ?? 3) as number;
  const columns = (node.columns ?? (node.props?.columns as number | undefined) ?? 3) as number;
  const gridColor = (node.gridColor ?? (node.props?.gridColor as string | undefined) ?? 'rgba(255,255,255,0.3)') as string;
  const gridWidth = (node.gridWidth ?? (node.props?.gridWidth as number | undefined) ?? 1) as number;

  const lines: React.ReactElement[] = [];

  // Horizontal lines
  for (let i = 1; i < rows; i++) {
    lines.push(
      React.createElement(SDKView, {
        key: `h-${i}`,
        style: {
          position: 'absolute' as const,
          top: `${(i / rows) * 100}%`,
          left: 0,
          right: 0,
          height: gridWidth,
          backgroundColor: gridColor,
        },
      }),
    );
  }

  // Vertical lines
  for (let i = 1; i < columns; i++) {
    lines.push(
      React.createElement(SDKView, {
        key: `v-${i}`,
        style: {
          position: 'absolute' as const,
          left: `${(i / columns) * 100}%`,
          top: 0,
          bottom: 0,
          width: gridWidth,
          backgroundColor: gridColor,
        },
      }),
    );
  }

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
      },
    },
    ...lines,
  );
};

GridOverlayComponent.displayName = 'GridOverlayComponent';
