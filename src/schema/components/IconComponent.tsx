/**
 * IconComponent - Renders icons using the pluggable IconRegistry
 * @module schema/components/IconComponent
 *
 * Uses the IconRegistry to resolve icon names to React elements.
 * Falls back to rendering the first character of the icon name if
 * no provider can resolve it.
 */

import React, { useCallback } from 'react';
import { SDKText, SDKTouchableOpacity } from '../../adapters';
import { iconRegistry } from '../icons';
import type { SchemaComponentProps } from '../../types';

export const IconComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const name = node.name ?? (node.props?.name as string) ?? '';
  const size = (typeof node.size === 'number' ? node.size : undefined) ??
    (node.props?.size as number | undefined) ?? 24;
  const color = node.color ?? (node.props?.color as string | undefined) ?? '#111827';

  const handlePress = useCallback(() => {
    if (node.onPress) {
      context.onAction(node.onPress);
    }
  }, [node.onPress, context]);

  // Try the icon registry first
  const registryIcon = iconRegistry.resolve(name, size, color);

  // Fallback: first character uppercase
  const fallbackChar = name.charAt(0).toUpperCase();

  const fallbackStyle: Record<string, unknown> = {
    fontSize: size,
    color,
    textAlign: 'center',
    lineHeight: size * 1.2,
    width: size,
    height: size * 1.2,
    ...(node.style ?? {}),
  };

  const iconContent = registryIcon ?? React.createElement(SDKText, { style: fallbackStyle }, fallbackChar);

  if (node.onPress) {
    return React.createElement(
      SDKTouchableOpacity,
      {
        onPress: handlePress,
        activeOpacity: 0.7,
        hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
        accessibilityRole: 'button' as const,
        accessibilityLabel: name,
      },
      iconContent,
    );
  }

  // When not pressable with a registry icon, wrap in a View-like container for accessibility
  if (registryIcon) {
    // Apply layout styles (margin, opacity, alignSelf) from node.style to the wrapper
    const wrapperStyle: Record<string, unknown> = {};
    if (node.style) {
      for (const key of ['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
        'marginHorizontal', 'marginVertical', 'opacity', 'alignSelf'] as const) {
        if ((node.style as Record<string, unknown>)[key] != null) {
          wrapperStyle[key] = (node.style as Record<string, unknown>)[key];
        }
      }
    }
    return React.createElement(
      SDKText,
      {
        style: Object.keys(wrapperStyle).length > 0 ? wrapperStyle : undefined,
        accessibilityRole: 'image' as const,
        accessibilityLabel: name,
      },
      registryIcon,
    );
  }

  return React.createElement(
    SDKText,
    {
      style: fallbackStyle,
      accessibilityRole: 'image' as const,
      accessibilityLabel: name,
    },
    fallbackChar,
  );
};

IconComponent.displayName = 'IconComponent';
