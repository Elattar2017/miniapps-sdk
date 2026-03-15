/**
 * SpacerComponent - Empty spacing element with fixed height/width
 * @module schema/components/SpacerComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const SpacerComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const size = (node.size as number | undefined) ?? (node.props?.size as number | undefined) ?? 16;

  return React.createElement(SDKView, {
    style: { height: size, width: size },
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no' as const,
  });
};

SpacerComponent.displayName = 'SpacerComponent';
