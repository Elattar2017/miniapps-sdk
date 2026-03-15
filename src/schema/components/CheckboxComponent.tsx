/**
 * CheckboxComponent - Toggle checkbox with label
 * @module schema/components/CheckboxComponent
 */

import React, { useCallback } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const CheckboxComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const label = node.label ?? '';
  const isDisabled = Boolean(node.disabled) && node.disabled !== 'false';
  const currentValue = Boolean(context.state[node.id ?? '']);

  const primaryColor = context.designTokens.colors.primary;
  const textColor = context.designTokens.colors.text ?? '#111827';
  const borderColor = context.designTokens.colors.border ?? '#E5E7EB';

  const handlePress = useCallback(() => {
    if (!isDisabled && node.id) {
      context.onStateChange(node.id, !currentValue);
    }
  }, [isDisabled, node.id, currentValue, context]);

  const checkboxIndicator = React.createElement(
    SDKView,
    {
      style: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: currentValue ? primaryColor : borderColor,
        borderRadius: 4,
        backgroundColor: currentValue ? primaryColor : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
      },
    },
    currentValue
      ? React.createElement(
          SDKText,
          {
            style: {
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: '700',
            },
          },
          '\u2713',
        )
      : null,
  );

  const labelElement = label
    ? React.createElement(
        SDKText,
        {
          style: {
            fontSize: 14,
            color: textColor,
            flex: 1,
          },
          accessibilityRole: 'text' as const,
        },
        label,
      )
    : null;

  return React.createElement(
    SDKTouchableOpacity,
    {
      onPress: handlePress,
      disabled: isDisabled,
      activeOpacity: 0.7,
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        opacity: isDisabled ? 0.5 : 1,
        ...(node.style ?? {}),
      },
      accessibilityRole: 'checkbox' as const,
      accessibilityLabel: label,
      accessibilityState: { checked: currentValue, disabled: isDisabled },
    },
    checkboxIndicator,
    labelElement,
  );
};

CheckboxComponent.displayName = 'CheckboxComponent';
