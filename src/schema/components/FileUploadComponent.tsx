/**
 * FileUploadComponent - Declarative file selection button
 * @module schema/components/FileUploadComponent
 *
 * Renders a button that represents a file upload action.
 * This is declarative only - fires onAction with the file_select intent.
 * The actual file picking is handled by the host app / native bridge.
 */

import React, { useCallback } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import { i18n } from '../../i18n';
import type { SchemaComponentProps } from '../../types';

/** File metadata displayed by the component */
export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

/** Format bytes into human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, exp);
  return `${size.toFixed(exp > 0 ? 1 : 0)} ${units[exp]}`;
}

export const FileUploadComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const label = node.label ?? i18n.t('fileUpload.label');
  const isDisabled = Boolean(node.disabled) && node.disabled !== 'false';

  const primaryColor = context.designTokens.colors.primary;
  const textColor = context.designTokens.colors.text ?? '#111827';
  const borderColor = context.designTokens.colors.border ?? '#E5E7EB';

  const handlePress = useCallback(() => {
    if (!isDisabled && node.onPress) {
      context.onAction(node.onPress);
    }
  }, [isDisabled, node.onPress, context]);

  // File info from state (set by host/native after file selection)
  const fileInfo = context.state[node.id ?? ''] as FileMetadata | undefined;

  const buttonElement = React.createElement(
    SDKTouchableOpacity,
    {
      onPress: handlePress,
      disabled: isDisabled,
      activeOpacity: 0.7,
      style: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: isDisabled ? borderColor : primaryColor,
        borderRadius: 8,
        borderStyle: 'dashed' as const,
        backgroundColor: 'transparent',
        opacity: isDisabled ? 0.5 : 1,
      },
      accessibilityRole: 'button' as const,
      accessibilityLabel: label,
      accessibilityState: { disabled: isDisabled },
    },
    React.createElement(
      SDKText,
      {
        style: {
          fontSize: 14,
          color: isDisabled ? textColor : primaryColor,
          fontWeight: '600' as const,
        },
      },
      label,
    ),
  );

  const fileInfoElement = fileInfo
    ? React.createElement(
        SDKView,
        { style: { marginTop: 8, paddingHorizontal: 4 } },
        React.createElement(
          SDKText,
          {
            style: { fontSize: 13, color: textColor },
          },
          fileInfo.name,
        ),
        React.createElement(
          SDKText,
          {
            style: { fontSize: 11, color: textColor, opacity: 0.6, marginTop: 2 },
          },
          `${formatFileSize(fileInfo.size)} \u00B7 ${fileInfo.type}`,
        ),
      )
    : null;

  return React.createElement(
    SDKView,
    {
      style: { ...(node.style ?? {}) },
      accessibilityLabel: `File upload: ${label}`,
    },
    buttonElement,
    fileInfoElement,
  );
};

FileUploadComponent.displayName = 'FileUploadComponent';
