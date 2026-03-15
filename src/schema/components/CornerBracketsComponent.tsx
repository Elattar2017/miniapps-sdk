/**
 * CornerBracketsComponent - Four L-shaped corner markers overlay for camera viewfinders
 * @module schema/components/CornerBracketsComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const CornerBracketsComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const bracketSize = (node.bracketSize ?? (node.props?.bracketSize as number | undefined) ?? 24) as number;
  const bracketThickness = (node.bracketThickness ?? (node.props?.bracketThickness as number | undefined) ?? 3) as number;
  const bracketColor = (node.bracketColor ?? (node.props?.bracketColor as string | undefined) ?? '#FFFFFF') as string;
  const inset = (node.inset ?? (node.props?.inset as number | undefined) ?? 20) as number;

  const cornerBase: Record<string, unknown> = {
    position: 'absolute',
    width: bracketSize,
    height: bracketSize,
  };

  const topLeft: Record<string, unknown> = {
    ...cornerBase,
    top: 0,
    left: 0,
    borderTopWidth: bracketThickness,
    borderLeftWidth: bracketThickness,
    borderColor: bracketColor,
  };

  const topRight: Record<string, unknown> = {
    ...cornerBase,
    top: 0,
    right: 0,
    borderTopWidth: bracketThickness,
    borderRightWidth: bracketThickness,
    borderColor: bracketColor,
  };

  const bottomLeft: Record<string, unknown> = {
    ...cornerBase,
    bottom: 0,
    left: 0,
    borderBottomWidth: bracketThickness,
    borderLeftWidth: bracketThickness,
    borderColor: bracketColor,
  };

  const bottomRight: Record<string, unknown> = {
    ...cornerBase,
    bottom: 0,
    right: 0,
    borderBottomWidth: bracketThickness,
    borderRightWidth: bracketThickness,
    borderColor: bracketColor,
  };

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
    React.createElement(
      SDKView,
      {
        style: {
          position: 'absolute' as const,
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
        },
      },
      React.createElement(SDKView, { key: 'tl', style: topLeft }),
      React.createElement(SDKView, { key: 'tr', style: topRight }),
      React.createElement(SDKView, { key: 'bl', style: bottomLeft }),
      React.createElement(SDKView, { key: 'br', style: bottomRight }),
    ),
  );
};

CornerBracketsComponent.displayName = 'CornerBracketsComponent';
