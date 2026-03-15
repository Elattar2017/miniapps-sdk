/**
 * FaceGuideComponent - Centered oval or circle guide overlay for face detection
 * @module schema/components/FaceGuideComponent
 */

import React from 'react';
import { SDKView, SDKText } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const FaceGuideComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const shape = (node.shape ?? node.props?.shape ?? 'oval') as string;
  const guideColor = (node.guideColor ?? (node.props?.guideColor as string | undefined) ?? '#FFFFFF') as string;
  const guideWidth = (node.guideWidth ?? (node.props?.guideWidth as number | undefined) ?? 2) as number;
  const size = (node.size ?? (node.props?.size as number | undefined) ?? 70) as number;
  const label = (node.label ?? node.props?.label) as string | undefined;
  const labelPosition = (node.labelPosition ?? node.props?.labelPosition ?? 'bottom') as string;
  const labelColor = (node.labelColor ?? (node.props?.labelColor as string | undefined) ?? '#FFFFFF') as string;

  const guideStyle: Record<string, unknown> = {
    width: `${size}%`,
    aspectRatio: shape === 'circle' ? 1 : 0.75,
    borderWidth: guideWidth,
    borderColor: guideColor,
    borderRadius: 9999,
  };

  const labelElement = label
    ? React.createElement(
        SDKText,
        {
          key: 'label',
          style: {
            color: labelColor,
            fontSize: 14,
            textAlign: 'center' as const,
            marginTop: labelPosition === 'bottom' ? 12 : 0,
            marginBottom: labelPosition === 'top' ? 12 : 0,
          },
        },
        label,
      )
    : null;

  const children: (React.ReactElement | null)[] = [];

  if (labelPosition === 'top' && labelElement) {
    children.push(labelElement);
  }

  children.push(React.createElement(SDKView, { key: 'guide', style: guideStyle }));

  if (labelPosition === 'bottom' && labelElement) {
    children.push(labelElement);
  }

  return React.createElement(
    SDKView,
    {
      style: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none' as const,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
      },
    },
    ...children,
  );
};

FaceGuideComponent.displayName = 'FaceGuideComponent';
