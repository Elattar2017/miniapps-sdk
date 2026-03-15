/**
 * ColumnComponent - Vertical flex container for stacked children
 * @module schema/components/ColumnComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ColumnComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  const gap = node.gap ?? (node.props?.gap as number | undefined);
  const alignItems = node.alignItems ?? (node.props?.alignItems as string | undefined);
  const justifyContent = node.justifyContent ?? (node.props?.justifyContent as string | undefined);
  const padding = node.padding ?? (node.props?.padding as number | undefined);

  const style: Record<string, unknown> = {
    flexDirection: 'column',
    ...(gap !== undefined ? { gap } : {}),
    ...(alignItems !== undefined ? { alignItems } : {}),
    ...(justifyContent !== undefined ? { justifyContent } : {}),
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

ColumnComponent.displayName = 'ColumnComponent';
