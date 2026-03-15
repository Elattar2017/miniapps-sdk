/**
 * BottomSheetComponent - Overlay sheet that slides up from the bottom
 * @module schema/components/BottomSheetComponent
 *
 * Controlled by an `isOpen` expression prop (resolved by SchemaInterpreter).
 * Uses RN Modal for proper z-index and Android back button support.
 * Children are wrapped in a ScrollView for automatic overflow scrolling.
 */

import React, { useCallback } from 'react';
import { Dimensions } from 'react-native';
import {
  SDKView,
  SDKText,
  SDKModal,
  SDKTouchableOpacity,
  SDKScrollView,
} from '../../adapters';
import type { SchemaComponentProps } from '../../types';

/** Parse a percentage string (e.g. '60%') into a fraction of window height */
function parseSheetHeight(sheetHeight: string | undefined): number | undefined {
  if (!sheetHeight || sheetHeight === 'auto') return undefined;
  const match = sheetHeight.match(/^(\d+)%$/);
  if (match) {
    const pct = parseInt(match[1], 10);
    const windowHeight = Dimensions.get('window').height;
    return windowHeight * (pct / 100);
  }
  return undefined;
}

export const BottomSheetComponent: React.FC<SchemaComponentProps> = ({
  node,
  context,
  children,
}) => {
  const isOpen = Boolean(node.isOpen);
  const title = node.title as string | undefined;
  const sheetHeight = (node.sheetHeight as string | undefined) ?? '50%';
  const showHandle = node.showHandle !== false;
  const dismissable = node.dismissable !== false;

  const handleDismiss = useCallback(() => {
    if (dismissable && node.onDismiss) {
      context.onAction(node.onDismiss);
    }
  }, [dismissable, node.onDismiss, context]);

  if (!isOpen) {
    return null;
  }

  const resolvedHeight = parseSheetHeight(sheetHeight);
  const maxHeight = Dimensions.get('window').height * 0.9;

  // Design token colors
  const surfaceColor =
    (context.designTokens?.colors as Record<string, string> | undefined)?.surface ?? '#FFFFFF';
  const textColor =
    (context.designTokens?.colors as Record<string, string> | undefined)?.text ?? '#111827';

  // Sheet container style
  const sheetStyle: Record<string, unknown> = {
    backgroundColor: surfaceColor,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 20,
    paddingHorizontal: 20,
    ...(resolvedHeight ? { height: Math.min(resolvedHeight, maxHeight) } : { maxHeight }),
    ...(node.style ?? {}),
  };

  // Handle bar
  const handleBar = showHandle
    ? React.createElement(SDKView, {
        style: {
          width: 40,
          height: 5,
          borderRadius: 3,
          backgroundColor: '#D1D5DB',
          alignSelf: 'center',
          marginBottom: 12,
        },
        accessibilityRole: 'none' as const,
      })
    : null;

  // Title row with optional close button
  const titleRow = title
    ? React.createElement(
        SDKView,
        {
          style: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          },
        },
        React.createElement(
          SDKText,
          {
            style: {
              fontSize: 18,
              fontWeight: '600',
              color: textColor,
              flex: 1,
            },
          },
          title,
        ),
        dismissable
          ? React.createElement(
              SDKTouchableOpacity,
              {
                onPress: handleDismiss,
                style: { padding: 4 },
                accessibilityRole: 'button' as const,
                accessibilityLabel: 'Close',
              },
              React.createElement(
                SDKText,
                { style: { fontSize: 20, color: '#9CA3AF', lineHeight: 20 } },
                '\u2715',
              ),
            )
          : null,
      )
    : null;

  // Content wrapped in ScrollView
  const content = React.createElement(
    SDKScrollView,
    {
      style: { flex: 1 },
      contentContainerStyle: { flexGrow: 1 },
      showsVerticalScrollIndicator: true,
    },
    children,
  );

  // Sheet panel
  const sheet = React.createElement(
    SDKView,
    {
      style: sheetStyle,
      accessibilityRole: 'none' as const,
      accessibilityLabel: node.accessibilityLabel ?? title ?? 'Bottom sheet',
    },
    handleBar,
    titleRow,
    content,
  );

  // Backdrop
  const backdrop = React.createElement(SDKTouchableOpacity, {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    activeOpacity: 1,
    onPress: dismissable ? handleDismiss : undefined,
    accessibilityRole: 'none' as const,
  });

  // Outer container positions sheet at bottom
  const container = React.createElement(
    SDKView,
    {
      style: {
        flex: 1,
        justifyContent: 'flex-end',
      },
    },
    backdrop,
    sheet,
  );

  // Modal wrapper
  return React.createElement(
    SDKModal,
    {
      visible: true,
      transparent: true,
      animationType: 'slide',
      onRequestClose: handleDismiss,
    },
    container,
  );
};

BottomSheetComponent.displayName = 'BottomSheetComponent';
