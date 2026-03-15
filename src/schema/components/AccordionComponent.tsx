/**
 * AccordionComponent - Container that groups collapsible accordion items
 * @module schema/components/AccordionComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const AccordionComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  const variant = (node.variant ?? (node.props?.variant as string | undefined)) ?? 'default';

  const style: Record<string, unknown> = {
    flexDirection: 'column' as const,
    ...(variant === 'separated' ? { gap: 8 } : {}),
    ...(variant === 'bordered' ? {
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 8,
      overflow: 'hidden',
    } : {}),
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

AccordionComponent.displayName = 'AccordionComponent';
