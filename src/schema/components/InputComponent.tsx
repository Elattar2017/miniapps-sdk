/**
 * InputComponent - Text input field with placeholder, value binding, and onChange handler
 * @module schema/components/InputComponent
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SDKView, SDKText, SDKTextInput } from '../../adapters';
import { ValidationEngine } from '../ValidationEngine';
import type { SchemaComponentProps } from '../../types';

const validationEngine = new ValidationEngine();

export const InputComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  // Most props pre-resolved by SchemaInterpreter
  const placeholder = node.placeholder ?? (node.props?.placeholder as string | undefined) ?? '';
  const label = node.label ?? (node.props?.label as string | undefined);
  const keyboardType = (node.props?.keyboardType as string | undefined) ?? 'default';
  const secureEntry = (node.props?.secureEntry as boolean | undefined) ?? false;

  // node.value is pre-resolved by SchemaInterpreter to the actual state value.
  // The original binding key (e.g. "$state.fieldName") is preserved in node.props.value
  // so we can use it for two-way state binding in handleChange.
  const rawBindingKey = (node.props?.value as string | undefined) ?? '';
  const currentValue = useMemo(() => {
    const resolved = node.value ?? '';
    return resolved == null ? '' : String(resolved);
  }, [node.value]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const fieldRules = node.id ? context.validationRules?.[node.id] : undefined;
  const contextErrors = node.id ? context.validationErrors?.[node.id] : undefined;
  const activeErrors = contextErrors ?? validationErrors;
  const hasErrors = activeErrors.length > 0;

  const handleChange = useCallback(
    (text: string) => {
      // Dispatch onChange action if defined
      if (node.onChange) {
        context.onAction({
          ...node.onChange,
          payload: { ...node.onChange.payload, value: text },
        });
      }

      // Also update state directly if value is bound to a state key
      if (typeof rawBindingKey === 'string' && rawBindingKey.startsWith('$state.')) {
        const stateKey = rawBindingKey.slice('$state.'.length);
        context.onStateChange(stateKey, text);
      }
    },
    [node.onChange, rawBindingKey, context],
  );

  const handleBlur = useCallback(() => {
    if (fieldRules && fieldRules.length > 0) {
      const result = validationEngine.validate(currentValue, fieldRules);
      setValidationErrors(result.errors);
    }

    if (node.onBlur) {
      context.onAction(node.onBlur);
    }
  }, [node.onBlur, context, fieldRules, currentValue]);

  const handleFocus = useCallback(() => {
    if (node.onFocus) {
      context.onAction(node.onFocus);
    }
  }, [node.onFocus, context]);

  const { colors } = context.designTokens;
  const containerStyle = node.style ?? {};
  const inputStyle = {
    fontSize: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: hasErrors ? (colors.error ?? '#DC2626') : (colors.border ?? '#D1D5DB'),
    borderRadius: 6,
    color: colors.text ?? '#111827',
    backgroundColor: colors.surface ?? '#FFFFFF',
    ...(containerStyle as Record<string, unknown>),
  };

  const elements: React.ReactElement[] = [];

  // Label
  if (label) {
    elements.push(
      React.createElement(
        SDKText,
        {
          key: 'label',
          style: {
            fontSize: 14,
            fontWeight: '500' as const,
            color: colors.textSecondary ?? '#374151',
            marginBottom: 4,
          },
          accessibilityRole: 'text' as const,
        },
        label,
      ),
    );
  }

  // Input
  elements.push(
    React.createElement(SDKTextInput, {
      key: 'input',
      style: inputStyle,
      value: currentValue,
      placeholder,
      placeholderTextColor: colors.textSecondary ?? '#9CA3AF',
      keyboardType: keyboardType as 'default' | 'numeric' | 'email-address' | 'phone-pad',
      secureTextEntry: secureEntry,
      onChangeText: handleChange,
      onBlur: handleBlur,
      onFocus: handleFocus,
      accessibilityLabel: label ?? placeholder,
    }),
  );

  // Validation error messages
  if (hasErrors) {
    for (let i = 0; i < activeErrors.length; i++) {
      elements.push(
        React.createElement(
          SDKText,
          {
            key: `error-${i}`,
            style: {
              fontSize: 12,
              color: colors.error ?? '#DC2626',
              marginTop: 4,
            },
            accessibilityRole: 'alert' as const,
          },
          activeErrors[i],
        ),
      );
    }
  }

  // Extract layout-level styles for the outer wrapper; remaining styles apply to the input itself
  const outerStyle: Record<string, unknown> = { flex: 1, marginBottom: 12 };
  if (node.style) {
    for (const key of ['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
      'marginHorizontal', 'marginVertical', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'flex'] as const) {
      if ((node.style as Record<string, unknown>)[key] != null) {
        outerStyle[key] = (node.style as Record<string, unknown>)[key];
      }
    }
    // Developer-set margin overrides the default marginBottom: 12
    if ((node.style as Record<string, unknown>).margin != null ||
        (node.style as Record<string, unknown>).marginBottom != null ||
        (node.style as Record<string, unknown>).marginVertical != null) {
      delete outerStyle.marginBottom;
    }
  }

  return React.createElement(SDKView, { style: outerStyle }, ...elements);
};

InputComponent.displayName = 'InputComponent';
