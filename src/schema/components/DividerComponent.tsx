/**
 * DividerComponent - Horizontal divider line
 * @module schema/components/DividerComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const DividerComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const color = node.color ?? (node.props?.color as string | undefined) ?? '#E5E7EB';
  const thickness = node.thickness ?? (node.props?.thickness as number | undefined) ?? 1;

  const style: Record<string, unknown> = {
    height: thickness,
    backgroundColor: color,
    width: '100%',
    ...(node.style ?? {}),
  };

  return React.createElement(SDKView, {
    style,
    accessible: false,
    importantForAccessibility: 'no',
    accessibilityElementsHidden: true,
  });
};

DividerComponent.displayName = 'DividerComponent';
