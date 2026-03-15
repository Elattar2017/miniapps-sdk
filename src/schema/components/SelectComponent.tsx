/**
 * SelectComponent - Dropdown select input with options list
 * @module schema/components/SelectComponent
 *
 * Uses inline dropdown (normal flow) to avoid React Native clipping
 * issues with overflow/zIndex inside borderRadius containers.
 */

import React, { useCallback, useState } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity, SDKScrollView } from '../../adapters';
import { i18n } from '../../i18n';
import type { SchemaComponentProps } from '../../types';

export const SelectComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const [isOpen, setIsOpen] = useState(false);

  const options = node.options ?? [];
  const placeholder = node.placeholder ?? i18n.t('select.placeholder');
  const isDisabled = Boolean(node.disabled) && node.disabled !== 'false';
  const currentValue = context.state[node.id ?? ''] as string | undefined;

  const selectedOption = options.find((opt) => opt.value === currentValue);
  const displayText = selectedOption ? selectedOption.label : placeholder;

  const borderColor = context.designTokens.colors.border ?? '#E5E7EB';
  const textColor = context.designTokens.colors.text ?? '#111827';
  const textSecondaryColor = context.designTokens.colors.textSecondary ?? '#6B7280';
  const primaryColor = context.designTokens.colors.primary;
  const surfaceColor = context.designTokens.colors.surface ?? '#F9FAFB';

  const handleToggle = useCallback(() => {
    if (!isDisabled) {
      setIsOpen((prev) => !prev);
    }
  }, [isDisabled]);

  const handleSelect = useCallback(
    (value: string) => {
      if (node.id) {
        context.onStateChange(node.id, value);
      }
      setIsOpen(false);
    },
    [node.id, context],
  );

  const triggerStyle: Record<string, unknown> = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: isOpen ? primaryColor : borderColor,
    borderRadius: context.designTokens.borderRadius.default,
    backgroundColor: '#FFFFFF',
    opacity: isDisabled ? 0.5 : 1,
    ...(node.style ?? {}),
  };

  const trigger = React.createElement(
    SDKTouchableOpacity,
    {
      onPress: handleToggle,
      disabled: isDisabled,
      activeOpacity: 0.7,
      style: triggerStyle,
      accessibilityRole: 'button' as const,
      accessibilityLabel: `Select: ${displayText}`,
      accessibilityState: { expanded: isOpen, disabled: isDisabled },
    },
    React.createElement(
      SDKText,
      {
        style: {
          fontSize: 14,
          color: selectedOption ? textColor : textSecondaryColor,
          flex: 1,
        },
      },
      displayText,
    ),
    React.createElement(
      SDKText,
      {
        style: {
          fontSize: 12,
          color: textSecondaryColor,
          marginLeft: 8,
        },
      },
      isOpen ? '\u25B2' : '\u25BC',
    ),
  );

  const children: React.ReactElement[] = [trigger];

  if (isOpen) {
    const optionElements = options.map((option, index) => {
      const isSelected = option.value === currentValue;
      const isOptionDisabled = option.disabled === true;

      return React.createElement(
        SDKTouchableOpacity,
        {
          key: `option-${index}`,
          onPress: () => {
            if (!isOptionDisabled) {
              handleSelect(option.value);
            }
          },
          disabled: isOptionDisabled,
          activeOpacity: 0.7,
          style: {
            paddingVertical: 10,
            paddingHorizontal: 16,
            backgroundColor: isSelected ? surfaceColor : '#FFFFFF',
            opacity: isOptionDisabled ? 0.5 : 1,
          },
          accessibilityRole: 'radio' as const,
          accessibilityState: { selected: isSelected, disabled: isOptionDisabled },
          accessibilityLabel: option.label,
        },
        React.createElement(
          SDKText,
          {
            style: {
              fontSize: 14,
              color: isSelected ? primaryColor : textColor,
              fontWeight: isSelected ? '600' : '400',
            },
          },
          option.label,
        ),
      );
    });

    // Inline dropdown (normal flow) — avoids RN clipping inside borderRadius parents
    const dropdown = React.createElement(
      SDKScrollView,
      {
        key: 'dropdown',
        style: {
          borderWidth: 1,
          borderColor,
          borderRadius: context.designTokens.borderRadius.default,
          marginTop: 4,
          maxHeight: 200,
          backgroundColor: '#FFFFFF',
        },
        accessibilityRole: 'list' as const,
      },
      ...optionElements,
    );

    children.push(dropdown);
  }

  return React.createElement(
    SDKView,
    {
      style: { flex: 1, minWidth: 100 },
    },
    ...children,
  );
};

SelectComponent.displayName = 'SelectComponent';
