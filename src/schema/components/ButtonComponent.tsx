/**
 * ButtonComponent - Touchable button with label, variant, disabled/loading states
 * @module schema/components/ButtonComponent
 */

import React, { useCallback } from 'react';
import { SDKTouchableOpacity, SDKText, SDKActivityIndicator } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

/** Base layout shared by all variants (colors resolved at render time from designTokens) */
const VARIANT_LAYOUT: Record<string, { container: Record<string, unknown>; text: Record<string, unknown> }> = {
  primary: {
    container: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    text: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  },
  secondary: {
    container: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    text: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    text: {
      fontSize: 16,
      fontWeight: '600',
    },
  },
  text: {
    container: {
      backgroundColor: 'transparent',
      paddingVertical: 8,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    text: {
      fontSize: 16,
      fontWeight: '600',
    },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      padding: 8,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    text: {
      fontSize: 16,
      fontWeight: '600',
    },
  },
};

/** Resolve variant colors from designTokens at render time */
function resolveVariantStyles(
  variant: string,
  colors: { primary: string; secondary?: string },
): { container: Record<string, unknown>; text: Record<string, unknown> } {
  const layout = VARIANT_LAYOUT[variant] ?? VARIANT_LAYOUT.primary;
  const primary = colors.primary;
  const secondary = colors.secondary ?? '#6B7280';

  switch (variant) {
    case 'primary':
      return {
        container: { ...layout.container, backgroundColor: primary },
        text: { ...layout.text, color: '#FFFFFF' },
      };
    case 'secondary':
      return {
        container: { ...layout.container, backgroundColor: secondary },
        text: { ...layout.text, color: '#FFFFFF' },
      };
    case 'outline':
      return {
        container: { ...layout.container, borderColor: primary },
        text: { ...layout.text, color: primary },
      };
    case 'text':
      return {
        container: layout.container,
        text: { ...layout.text, color: primary },
      };
    case 'ghost':
      return {
        container: layout.container,
        text: { ...layout.text, color: primary },
      };
    default:
      return {
        container: { ...layout.container, backgroundColor: primary },
        text: { ...layout.text, color: '#FFFFFF' },
      };
  }
}

export const ButtonComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  // node.disabled and node.loading are pre-resolved by SchemaInterpreter
  const label = node.label ?? (node.props?.label as string) ?? '';
  const variant = (node.variant ?? (node.props?.variant as string)) ?? 'primary';

  const isDisabled = Boolean(node.disabled) && node.disabled !== 'false';
  const isLoading = Boolean(node.loading) && node.loading !== 'false';

  const handlePress = useCallback(() => {
    if (isDisabled || isLoading) return;
    if (node.onPress) {
      context.onAction(node.onPress);
    }
  }, [node.onPress, context, isDisabled, isLoading]);

  // Resolve variant colors from designTokens, then merge with schema-defined overrides
  const fullWidth = node.fullWidth ?? (node.props?.fullWidth as boolean | undefined);
  const variantStyle = resolveVariantStyles(variant, context.designTokens.colors);
  const containerStyle = {
    ...variantStyle.container,
    alignSelf: fullWidth ? 'stretch' as const : 'flex-start' as const,
    ...(node.style ?? {}),
    opacity: isDisabled ? 0.5 : 1,
  };
  const textStyle = {
    ...variantStyle.text,
    // Allow color override from node style
    ...(node.style?.color ? { color: node.style.color } : {}),
  };

  const children: React.ReactElement[] = [];

  if (isLoading) {
    children.push(
      React.createElement(SDKActivityIndicator, {
        key: 'loading',
        size: 'small',
        color: textStyle.color as string,
        style: { marginRight: 8 },
      }),
    );
  }

  children.push(
    React.createElement(
      SDKText,
      {
        key: 'label',
        style: textStyle as Record<string, unknown>,
        accessibilityRole: 'text' as const,
      },
      label,
    ),
  );

  return React.createElement(
    SDKTouchableOpacity,
    {
      onPress: handlePress,
      disabled: isDisabled || isLoading,
      activeOpacity: 0.7,
      style: containerStyle,
      accessibilityRole: 'button' as const,
      accessibilityLabel: label,
      accessibilityState: { disabled: isDisabled || isLoading },
    },
    ...children,
  );
};

ButtonComponent.displayName = 'ButtonComponent';
