/**
 * ImageComponent - Displays an image from a URL or asset reference
 * @module schema/components/ImageComponent
 */

import React, { useCallback, useMemo } from 'react';
import { SDKImage, SDKTouchableOpacity, getScreenDimensions } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ImageComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const rawSource = node.source ?? (node.props?.source as string) ?? '';
  const resizeMode = node.resizeMode ?? (node.props?.resizeMode as string) ?? 'cover';
  const alt = node.alt ?? (node.props?.alt as string) ?? '';

  // Resolve asset:// protocol references to full URLs
  const source = useMemo(() => {
    if (typeof rawSource === 'string' && rawSource.startsWith('asset://') && context.resolveAssetUrl) {
      return context.resolveAssetUrl(context.moduleId, rawSource) ?? '';
    }
    return rawSource;
  }, [rawSource, context.moduleId, context.resolveAssetUrl]);

  const imageSource = useMemo(() => {
    if (typeof source === 'string' && source.length > 0) {
      return { uri: source };
    }
    return undefined;
  }, [source]);

  const handlePress = useCallback(() => {
    if (node.onPress) {
      context.onAction(node.onPress);
    }
  }, [node.onPress, context]);

  const handleLoad = useCallback(() => {
    if (node.onLoad) {
      context.onAction(node.onLoad);
    }
  }, [node.onLoad, context]);

  const handleError = useCallback(() => {
    if (node.onError) {
      context.onAction(node.onError);
    }
  }, [node.onError, context]);

  // Read dimensions from direct props first (bypasses style stripping),
  // then fall back to node.style, then defaults
  const nodeWidth = node.width ?? (node.props?.width as string | number | undefined);
  const nodeHeight = node.height ?? (node.props?.height as string | number | undefined);
  const nodeBorderRadius = node.borderRadius ?? (node.props?.borderRadius as number | undefined);

  const style: Record<string, unknown> = {
    width: 100,
    height: 100,
    ...(node.style ?? {}),
  };

  // Direct props override style values
  if (nodeWidth !== undefined) style.width = nodeWidth;
  if (nodeHeight !== undefined) style.height = nodeHeight;
  if (nodeBorderRadius !== undefined) style.borderRadius = nodeBorderRadius;

  // For percentage widths, keep as-is — RN flex layout handles them
  // when the parent has a defined size (which flex columns do).
  // Only 'full' is a special keyword meaning full screen dimensions.
  if (style.width === 'full') {
    try {
      style.width = getScreenDimensions().width;
    } catch { /* keep as-is */ }
  }
  if (style.height === 'full') {
    try {
      style.height = getScreenDimensions().height;
    } catch { /* keep as-is */ }
  }

  if (!imageSource) {
    return null;
  }

  const imageElement = React.createElement(SDKImage, {
    source: imageSource,
    style,
    resizeMode: resizeMode as 'cover' | 'contain' | 'stretch' | 'center',
    onLoad: handleLoad,
    onError: handleError,
    accessibilityLabel: alt,
    accessibilityRole: 'image' as const,
  });

  if (node.onPress) {
    return React.createElement(
      SDKTouchableOpacity,
      {
        onPress: handlePress,
        activeOpacity: 0.7,
      },
      imageElement,
    );
  }

  return imageElement;
};

ImageComponent.displayName = 'ImageComponent';
