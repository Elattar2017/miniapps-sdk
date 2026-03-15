/**
 * TextComponent - Renders text content (expressions pre-resolved by SchemaInterpreter)
 * @module schema/components/TextComponent
 */

import React from 'react';
import { SDKText, SDKTouchableOpacity } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const TextComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  // node.value is pre-resolved by SchemaInterpreter's resolveNodeExpressions
  const resolvedValue = node.value ?? (node.props?.value as string) ?? '';
  const displayValue = resolvedValue == null ? '' : String(resolvedValue);

  const style = node.style ?? {};
  const numberOfLines = node.numberOfLines ?? (node.props?.numberOfLines as number | undefined);

  // If the node has an onPress handler, wrap in a touchable
  if (node.onPress) {
    const handlePress = () => {
      if (node.onPress) {
        context.onAction(node.onPress);
      }
    };

    return React.createElement(
      SDKTouchableOpacity,
      {
        onPress: handlePress,
        activeOpacity: 0.7,
        accessibilityRole: 'link' as const,
      },
      React.createElement(
        SDKText,
        {
          style,
          numberOfLines,
          accessibilityRole: 'text' as const,
        },
        displayValue,
      ),
    );
  }

  return React.createElement(
    SDKText,
    {
      style,
      numberOfLines,
      accessibilityRole: 'text' as const,
    },
    displayValue,
  );
};

TextComponent.displayName = 'TextComponent';
