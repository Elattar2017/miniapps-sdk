/**
 * ScanFrameComponent - Rectangular frame guide overlay for camera viewfinders
 * @module schema/components/ScanFrameComponent
 */

import React from 'react';
import { SDKView, SDKText } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ScanFrameComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const borderStyle = (node.borderStyle ?? node.props?.borderStyle ?? 'dashed') as string;
  const borderColor = ((node.props?.borderColor as string | undefined) ?? node.color ?? '#FFFFFF') as string;
  const borderWidth = ((node.props?.borderWidth as number | undefined) ?? 2) as number;
  const cornerRadius = (node.borderRadius ?? (node.props?.cornerRadius as number | undefined) ?? 8) as number;
  const inset = (node.inset ?? (node.props?.inset as number | undefined) ?? 20) as number;
  const aspectRatio = (node.aspectRatio ?? node.props?.aspectRatio) as string | undefined;
  const label = (node.label ?? node.props?.label) as string | undefined;
  const labelColor = (node.labelColor ?? (node.props?.labelColor as string | undefined) ?? '#FFFFFF') as string;

  // Build frame style
  const frameStyle: Record<string, unknown> = {
    position: 'absolute',
    borderWidth,
    borderColor,
    borderStyle,
    borderRadius: cornerRadius,
  };

  if (aspectRatio) {
    // Parse aspect ratio string like '3:2'
    const parts = aspectRatio.split(':');
    const ratioW = parseFloat(parts[0]) || 3;
    const ratioH = parseFloat(parts[1]) || 2;
    // Use percentage-based width and compute aspect ratio for RN
    frameStyle.width = '80%';
    frameStyle.aspectRatio = ratioW / ratioH;
    frameStyle.alignSelf = 'center';
  } else {
    frameStyle.top = inset;
    frameStyle.left = inset;
    frameStyle.right = inset;
    frameStyle.bottom = inset;
  }

  const children: React.ReactElement[] = [
    React.createElement(SDKView, { key: 'frame', style: frameStyle }),
  ];

  if (label) {
    children.push(
      React.createElement(
        SDKText,
        {
          key: 'label',
          style: {
            color: labelColor,
            fontSize: 12,
            marginTop: 8,
            textAlign: 'center',
          },
        },
        label,
      ),
    );
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
        flex: 1,
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
      },
    },
    ...children,
  );
};

ScanFrameComponent.displayName = 'ScanFrameComponent';
