/**
 * RowComponent - Horizontal flex container for side-by-side children
 * @module schema/components/RowComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const RowComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  const gap = node.gap ?? (node.props?.gap as number | undefined);
  const alignItems = node.alignItems ?? (node.props?.alignItems as string | undefined);
  const justifyContent = node.justifyContent ?? (node.props?.justifyContent as string | undefined);
  const wrap = node.wrap ?? (node.props?.wrap as boolean | undefined);
  const padding = node.padding ?? (node.props?.padding as number | undefined);

  const style: Record<string, unknown> = {
    flexDirection: 'row',
    ...(gap !== undefined ? { gap } : {}),
    ...(alignItems !== undefined ? { alignItems } : {}),
    ...(justifyContent !== undefined ? { justifyContent } : {}),
    ...(wrap ? { flexWrap: 'wrap' } : {}),
    ...(padding !== undefined ? { padding } : {}),
    ...(node.style ?? {}),
  };

  return React.createElement(
    SDKView,
    {
      style,
      accessibilityRole: 'none' as const,
    },
    children,
  );
};

RowComponent.displayName = 'RowComponent';
