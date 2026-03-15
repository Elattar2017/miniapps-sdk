/**
 * CrosshairComponent - Center crosshair marker overlay for camera viewfinders
 * @module schema/components/CrosshairComponent
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const CrosshairComponent: React.FC<SchemaComponentProps> = ({ node }) => {
  const size = (node.size ?? (node.props?.size as number | undefined) ?? 40) as number;
  const thickness = (node.thickness ?? (node.props?.thickness as number | undefined) ?? 2) as number;
  const color = (node.color ?? (node.props?.color as string | undefined) ?? '#FFFFFF') as string;
  const showCircle = (node.showCircle ?? (node.props?.showCircle as boolean | undefined) ?? false) as boolean;
  const circleRadius = (node.circleRadius ?? (node.props?.circleRadius as number | undefined) ?? 20) as number;
  const gap = (node.gap ?? (node.props?.gap as number | undefined) ?? 6) as number;

  const halfSize = size / 2;
  const segmentLength = halfSize - gap;

  const elements: React.ReactElement[] = [];

  // Horizontal left segment
  elements.push(
    React.createElement(SDKView, {
      key: 'h-left',
      style: {
        position: 'absolute' as const,
        top: halfSize - thickness / 2,
        left: 0,
        width: segmentLength,
        height: thickness,
        backgroundColor: color,
      },
    }),
  );

  // Horizontal right segment
  elements.push(
    React.createElement(SDKView, {
      key: 'h-right',
      style: {
        position: 'absolute' as const,
        top: halfSize - thickness / 2,
        right: 0,
        width: segmentLength,
        height: thickness,
        backgroundColor: color,
      },
    }),
  );

  // Vertical top segment
  elements.push(
    React.createElement(SDKView, {
      key: 'v-top',
      style: {
        position: 'absolute' as const,
        left: halfSize - thickness / 2,
        top: 0,
        width: thickness,
        height: segmentLength,
        backgroundColor: color,
      },
    }),
  );

  // Vertical bottom segment
  elements.push(
    React.createElement(SDKView, {
      key: 'v-bottom',
      style: {
        position: 'absolute' as const,
        left: halfSize - thickness / 2,
        bottom: 0,
        width: thickness,
        height: segmentLength,
        backgroundColor: color,
      },
    }),
  );

  // Optional circle
  if (showCircle) {
    elements.push(
      React.createElement(SDKView, {
        key: 'circle',
        style: {
          position: 'absolute' as const,
          top: halfSize - circleRadius,
          left: halfSize - circleRadius,
          width: circleRadius * 2,
          height: circleRadius * 2,
          borderRadius: circleRadius,
          borderWidth: thickness,
          borderColor: color,
        },
      }),
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
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
      },
    },
    React.createElement(
      SDKView,
      {
        style: {
          width: size,
          height: size,
          position: 'relative' as const,
        },
      },
      ...elements,
    ),
  );
};

CrosshairComponent.displayName = 'CrosshairComponent';
