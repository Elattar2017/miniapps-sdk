/**
 * CardComponent - Elevated container with shadow and rounded corners
 * @module schema/components/CardComponent
 */

import React, { useCallback } from 'react';
import { SDKView, SDKTouchableOpacity } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const CardComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const elevation = node.elevation ?? (node.props?.elevation as number | undefined) ?? 2;
  const borderRadius = node.borderRadius ?? (node.props?.borderRadius as number | undefined) ?? 8;

  const handlePress = useCallback(() => {
    if (node.onPress) {
      context.onAction(node.onPress);
    }
  }, [node.onPress, context]);

  const style: Record<string, unknown> = {
    backgroundColor: '#FFFFFF',
    borderRadius,
    padding: 16,
    // Android elevation
    elevation,
    // iOS shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: elevation },
    shadowOpacity: 0.1 + elevation * 0.03,
    shadowRadius: elevation * 1.5,
    ...(node.style ?? {}),
  };

  // If the card has an onPress handler, wrap in a touchable
  if (node.onPress) {
    return React.createElement(
      SDKTouchableOpacity,
      {
        onPress: handlePress,
        activeOpacity: 0.85,
        style,
        accessibilityRole: 'button' as const,
        accessibilityLabel: node.accessibilityLabel ?? node.label ?? 'Card',
        ...(node.accessibilityHint ? { accessibilityHint: node.accessibilityHint } : {}),
      },
      children,
    );
  }

  return React.createElement(
    SDKView,
    {
      style,
      accessibilityRole: 'summary' as const,
      accessibilityLabel: node.accessibilityLabel ?? node.label ?? 'Card',
      ...(node.accessibilityHint ? { accessibilityHint: node.accessibilityHint } : {}),
    },
    children,
  );
};

CardComponent.displayName = 'CardComponent';
