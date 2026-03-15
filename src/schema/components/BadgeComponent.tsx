/**
 * BadgeComponent - Interactive badge with icon, selectable filter, and active state
 * @module schema/components/BadgeComponent
 */

import React, { useMemo, useCallback } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import { iconRegistry } from '../icons';
import { i18n } from '../../i18n';
import type { SchemaComponentProps } from '../../types';

/** Color presets for named badge colors */
const COLOR_PRESETS: Record<string, { bg: string; text: string; border: string }> = {
  primary: { bg: '#0066CC', text: '#FFFFFF', border: '#0066CC' },
  secondary: { bg: '#6B7280', text: '#FFFFFF', border: '#6B7280' },
  success: { bg: '#16A34A', text: '#FFFFFF', border: '#16A34A' },
  warning: { bg: '#D97706', text: '#FFFFFF', border: '#D97706' },
  error: { bg: '#DC2626', text: '#FFFFFF', border: '#DC2626' },
};

/** Estimate relative luminance of a hex color to choose readable text */
function isLightColor(hex: string): boolean {
  const cleaned = hex.replace('#', '');
  if (cleaned.length < 6) return false;
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  // Relative luminance (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

function resolveColors(colorName: string): { bg: string; text: string; border: string } {
  if (COLOR_PRESETS[colorName]) return COLOR_PRESETS[colorName];
  const textColor = isLightColor(colorName) ? '#1F2937' : '#FFFFFF';
  return { bg: colorName, text: textColor, border: colorName };
}

export const BadgeComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const value = node.value ?? (node.props?.value as string) ?? '';
  const colorName = node.color ?? (node.props?.color as string | undefined) ?? 'primary';
  const variant = (node.variant ?? node.props?.variant as string | undefined) ?? 'filled';
  const icon = node.icon ?? (node.props?.icon as string | undefined);
  const iconPosition = (node.iconPosition ?? node.props?.iconPosition as string | undefined) ?? 'left';
  const selectable = node.selectable ?? (node.props?.selectable as boolean | undefined) ?? false;
  const groupId = node.groupId ?? (node.props?.groupId as string | undefined);
  const activeColor = node.activeColor ?? (node.props?.activeColor as string | undefined);
  const activeVariant = (node.activeVariant ?? node.props?.activeVariant as string | undefined);

  const displayValue = value == null ? '' : String(value);

  // Determine if this badge is currently active (selected)
  const isActive = useMemo(() => {
    if (!selectable || !groupId || !context) return false;
    return context.state[groupId] === displayValue;
  }, [selectable, groupId, context, displayValue]);

  // Resolve effective color and variant based on active state
  const effectiveColorName = isActive && activeColor ? activeColor : colorName;
  const effectiveVariant = isActive && activeVariant ? activeVariant : variant;
  const colors = useMemo(() => resolveColors(effectiveColorName), [effectiveColorName]);

  const isFilled = effectiveVariant === 'filled';

  const containerStyle: Record<string, unknown> = {
    backgroundColor: isFilled ? colors.bg : 'transparent',
    borderWidth: isFilled ? 0 : 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    ...(node.style as Record<string, unknown> | undefined),
  };

  const textStyle: Record<string, unknown> = {
    color: isFilled ? colors.text : colors.border,
    fontSize: 12,
    fontWeight: '600',
  };

  const iconColor = isFilled ? colors.text : colors.border;

  // Build children: icon + text in the right order
  const children: React.ReactElement[] = [];

  const iconElement = icon
    ? iconRegistry.resolve(icon, 12, iconColor as string) ?? null
    : null;

  if (iconElement && iconPosition === 'left') {
    children.push(
      React.createElement(SDKView, { key: 'icon-l', style: { marginRight: 4 } }, iconElement),
    );
  }

  children.push(
    React.createElement(SDKText, { key: 'text', style: textStyle }, displayValue),
  );

  if (iconElement && iconPosition === 'right') {
    children.push(
      React.createElement(SDKView, { key: 'icon-r', style: { marginLeft: 4 } }, iconElement),
    );
  }

  const handlePress = useCallback(() => {
    if (selectable && groupId && context) {
      // Toggle: if already active, deselect (set to empty string)
      const newValue = isActive ? '' : displayValue;
      context.onStateChange(groupId, newValue);
    }
    if (node.onPress && context) {
      context.onAction(node.onPress);
    }
  }, [selectable, groupId, context, isActive, displayValue, node.onPress]);

  const isInteractive = selectable || !!node.onPress;

  const a11yProps: Record<string, unknown> = {
    accessibilityRole: isInteractive ? 'button' : 'text',
    accessibilityLabel: i18n.t('badge.label', { value: displayValue }),
  };

  if (selectable) {
    (a11yProps as Record<string, unknown>).accessibilityState = { selected: isActive };
  }

  if (isInteractive) {
    return React.createElement(
      SDKTouchableOpacity,
      { style: containerStyle, onPress: handlePress, ...a11yProps },
      ...children,
    );
  }

  return React.createElement(
    SDKView,
    { style: containerStyle, ...a11yProps },
    ...children,
  );
};

BadgeComponent.displayName = 'BadgeComponent';
