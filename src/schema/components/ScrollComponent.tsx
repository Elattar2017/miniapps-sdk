/**
 * ScrollComponent - Scrollable container for overflow content
 * @module schema/components/ScrollComponent
 */

import React, { useCallback } from 'react';
import { SDKScrollView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ScrollComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const direction = node.direction ?? (node.props?.direction as string | undefined) ?? 'vertical';
  const showIndicator = node.showIndicator ?? (node.props?.showIndicator as boolean | undefined) ?? true;
  const maxHeight = node.maxHeight ?? (node.props?.maxHeight as number | undefined);
  const padding = node.padding ?? (node.props?.padding as number | undefined);

  const isHorizontal = direction === 'horizontal';

  const handleScroll = useCallback(() => {
    if (node.onScroll) {
      context.onAction(node.onScroll);
    }
  }, [node.onScroll, context]);

  const style: Record<string, unknown> = {
    flex: 1,
    ...(maxHeight !== undefined ? { maxHeight } : {}),
    ...(node.style ?? {}),
  };

  const contentContainerStyle: Record<string, unknown> = {
    ...(isHorizontal ? { flexDirection: 'row' as const } : {}),
    ...(padding !== undefined ? { padding } : {}),
  };

  return React.createElement(
    SDKScrollView,
    {
      style,
      horizontal: isHorizontal,
      showsVerticalScrollIndicator: !isHorizontal && showIndicator,
      showsHorizontalScrollIndicator: isHorizontal && showIndicator,
      onScroll: node.onScroll ? handleScroll : undefined,
      scrollEventThrottle: 16,
      contentContainerStyle: Object.keys(contentContainerStyle).length > 0
        ? contentContainerStyle
        : undefined,
      accessibilityRole: 'adjustable' as const,
      accessibilityLabel: node.accessibilityLabel ?? 'Scrollable content',
    },
    children,
  );
};

ScrollComponent.displayName = 'ScrollComponent';
