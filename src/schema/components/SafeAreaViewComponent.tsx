/**
 * SafeAreaViewComponent - Wrapper that adds padding for device safe areas
 * @module schema/components/SafeAreaViewComponent
 *
 * Applies padding based on device safe area insets (notch, Dynamic Island,
 * home indicator). Supports an `edges` prop to control which edges get padding.
 */

import React from 'react';
import { SDKView, getDefaultSafeAreaInsets } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const SafeAreaViewComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const insets = getDefaultSafeAreaInsets();
  const edges: string[] = node.edges ?? (node.props?.edges as string[] | undefined) ?? ['top', 'bottom', 'left', 'right'];

  const style: Record<string, unknown> = {
    flex: 1,
    // Skip top padding if SDK header is already handling safe area
    ...(edges.includes('top') && !context.headerVisible ? { paddingTop: insets.top } : {}),
    ...(edges.includes('bottom') ? { paddingBottom: insets.bottom } : {}),
    ...(edges.includes('left') ? { paddingLeft: insets.left } : {}),
    ...(edges.includes('right') ? { paddingRight: insets.right } : {}),
    ...(node.style ?? {}),
  };

  return React.createElement(SDKView, { style }, children);
};

SafeAreaViewComponent.displayName = 'SafeAreaViewComponent';
