/**
 * LoadingComponent - Loading indicator with multiple variants
 * @module schema/components/LoadingComponent
 *
 * Variants:
 * - spinner (default): ActivityIndicator with optional text label
 * - progress: Determinate or indeterminate progress bar with text alignment
 * - overlay: Full-screen backdrop with centered spinner in rounded box
 * - skeleton: Shimmer placeholder shapes with presets (list-item, card, profile, paragraph, custom)
 *
 * Color priority: node.color > colors.spinner > colors.primary > fallback
 * Track color:    colors.spinnerTrack > colors.border > #E5E7EB
 * Style override:  node.style.{padding, margin, backgroundColor, borderRadius}
 */

import React, { useEffect, useRef } from 'react';
import { SDKView, SDKText, SDKActivityIndicator } from '../../adapters';
import {
  SDKAnimated,
  SDKAnimatedView,
  SDKAnimatedValue,
  createFadeAnimation,
} from '../../adapters/AnimationAdapter';
import { i18n } from '../../i18n';
import type { SchemaComponentProps } from '../../types';
import type { SkeletonShape } from '../../types/schema.types';

/** Map schema size values to RN ActivityIndicator sizes */
const SIZE_MAP: Record<string, 'small' | 'large'> = {
  sm: 'small',
  md: 'small',
  lg: 'large',
};

// ---------------------------------------------------------------------------
// Spinner variant
// ---------------------------------------------------------------------------

function renderSpinner(
  indicatorSize: 'small' | 'large',
  color: string,
  loadingText: string | undefined,
  direction: 'vertical' | 'horizontal',
  containerStyle: Record<string, unknown>,
): React.ReactElement {
  const isHorizontal = direction === 'horizontal';

  const children: React.ReactElement[] = [
    React.createElement(SDKActivityIndicator, {
      key: 'spinner',
      size: indicatorSize,
      color,
    }),
  ];

  if (loadingText) {
    children.push(
      React.createElement(SDKText, {
        key: 'text',
        style: {
          fontSize: 12,
          color: '#9CA3AF',
          marginTop: isHorizontal ? 0 : 8,
          marginLeft: isHorizontal ? 8 : 0,
        },
      }, loadingText),
    );
  }

  return React.createElement(
    SDKView,
    {
      style: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        paddingTop: 24,
        paddingBottom: 24,
        flexDirection: isHorizontal ? ('row' as const) : ('column' as const),
        ...containerStyle,
      },
      accessibilityRole: 'progressbar' as const,
      accessibilityLabel: loadingText ?? i18n.t('loading.label'),
    },
    ...children,
  );
}

// ---------------------------------------------------------------------------
// Animated progress fill (determinate)
// ---------------------------------------------------------------------------

const ProgressFill: React.FC<{ progress: number; color: string }> = ({ progress, color }) => {
  const animValue = useRef(new SDKAnimatedValue(0)).current;

  useEffect(() => {
    SDKAnimated.timing(animValue, {
      toValue: progress,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress, animValue]);

  const widthInterpolation = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return React.createElement(SDKAnimatedView, {
    testID: 'progress-fill',
    style: {
      height: 8,
      borderRadius: 4,
      backgroundColor: color,
      width: widthInterpolation,
    },
  });
};

ProgressFill.displayName = 'ProgressFill';

// ---------------------------------------------------------------------------
// Progress bar variant
// ---------------------------------------------------------------------------

function renderProgressBar(
  progress: number,
  color: string,
  trackColor: string,
  textSecondaryColor: string,
  loadingText: string | undefined,
  indeterminate: boolean,
  textAlign: 'left' | 'center' | 'right',
  showPercent: boolean,
  containerStyle: Record<string, unknown>,
): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, progress));

  const children: React.ReactElement[] = [];

  if (loadingText) {
    children.push(
      React.createElement(SDKText, {
        key: 'label',
        style: { fontSize: 14, color: textSecondaryColor, marginBottom: 8, textAlign: textAlign as 'left' | 'center' | 'right' },
      }, loadingText),
    );
  }

  // Track + fill
  if (indeterminate) {
    // Indeterminate: animated sliding bar
    children.push(
      React.createElement(IndeterminateBar, { key: 'track', color, trackColor }),
    );
  } else {
    children.push(
      React.createElement(
        SDKView,
        {
          key: 'track',
          style: {
            height: 8,
            backgroundColor: trackColor,
            borderRadius: 4,
            overflow: 'hidden' as const,
            width: '100%',
          },
        },
        React.createElement(ProgressFill, {
          key: 'fill',
          progress: clamped,
          color,
        }),
      ),
    );
  }

  // Percentage text
  if (showPercent && !indeterminate) {
    children.push(
      React.createElement(SDKText, {
        key: 'percent',
        style: {
          fontSize: 12,
          color: '#9CA3AF',
          marginTop: 4,
          textAlign: textAlign as 'left' | 'center' | 'right',
        },
      }, `${Math.round(clamped)}%`),
    );
  }

  return React.createElement(
    SDKView,
    {
      style: { padding: 16, width: '100%', ...containerStyle },
      accessibilityRole: 'progressbar' as const,
      accessibilityLabel: loadingText ?? i18n.t('loading.label'),
      accessibilityValue: indeterminate ? undefined : { min: 0, max: 100, now: clamped },
    },
    ...children,
  );
}

// ---------------------------------------------------------------------------
// Indeterminate progress bar (animated)
// ---------------------------------------------------------------------------

const IndeterminateBar: React.FC<{ color: string; trackColor: string }> = ({ color, trackColor }) => {
  const slideAnim = useRef(new SDKAnimatedValue(0)).current;

  useEffect(() => {
    const anim = SDKAnimated.loop(
      SDKAnimated.sequence([
        SDKAnimated.timing(slideAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        SDKAnimated.timing(slideAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [slideAnim]);

  // Slide the 40%-wide bar from left edge (-30%) to right edge (+130%)
  // using translateX relative to the track width. We approximate with a
  // large enough pixel range; the parent's overflow:hidden clips it.
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, 200],
  });

  return React.createElement(
    SDKView,
    {
      style: {
        height: 8,
        backgroundColor: trackColor,
        borderRadius: 4,
        overflow: 'hidden' as const,
        width: '100%',
      },
    },
    React.createElement(SDKAnimatedView, {
      testID: 'progress-indeterminate',
      style: {
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        width: '40%',
        transform: [{ translateX }],
      },
    }),
  );
};

IndeterminateBar.displayName = 'IndeterminateBar';

// ---------------------------------------------------------------------------
// Overlay variant
// ---------------------------------------------------------------------------

function renderOverlay(
  indicatorSize: 'small' | 'large',
  color: string,
  surfaceColor: string,
  textColor: string,
  loadingText: string | undefined,
  containerStyle: Record<string, unknown>,
): React.ReactElement {
  return React.createElement(
    SDKView,
    {
      style: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        zIndex: 999,
      },
      accessibilityRole: 'progressbar' as const,
      accessibilityLabel: loadingText ?? i18n.t('loading.label'),
      accessibilityLiveRegion: 'assertive' as const,
    },
    React.createElement(
      SDKView,
      {
        style: {
          backgroundColor: surfaceColor,
          borderRadius: 16,
          padding: 24,
          alignItems: 'center' as const,
          minWidth: 120,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
          ...containerStyle,
        },
      },
      React.createElement(SDKActivityIndicator, {
        key: 'spinner',
        size: indicatorSize,
        color,
      }),
      loadingText
        ? React.createElement(SDKText, {
            key: 'text',
            style: { fontSize: 14, color: textColor, marginTop: 12 },
          }, loadingText)
        : null,
    ),
  );
}

// ---------------------------------------------------------------------------
// Skeleton variant
// ---------------------------------------------------------------------------

const SkeletonItem: React.FC<{ shape: SkeletonShape; index: number; color: string; gap: number }> = ({
  shape,
  index,
  color,
  gap,
}) => {
  const shimmerAnim = useRef(new SDKAnimatedValue(0.4)).current;

  useEffect(() => {
    const anim = SDKAnimated.loop(
      SDKAnimated.sequence([
        createFadeAnimation({ value: shimmerAnim, toValue: 1, duration: 1000, useNativeDriver: true }),
        createFadeAnimation({ value: shimmerAnim, toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmerAnim]);

  // Text shape: render multiple lines
  if (shape.shape === 'text') {
    const lineCount = shape.lines ?? 3;
    const elements: React.ReactElement[] = [];
    for (let i = 0; i < lineCount; i++) {
      const lineWidth = i === lineCount - 1 ? '60%' : '100%';
      elements.push(
        React.createElement(SDKAnimatedView, {
          key: `skel-text-${index}-${i}`,
          style: {
            width: lineWidth,
            height: 14,
            borderRadius: 4,
            backgroundColor: color,
            opacity: shimmerAnim,
            marginBottom: i < lineCount - 1 ? gap : 0,
          },
        }),
      );
    }
    return React.createElement(
      SDKView,
      { style: { flex: 1 } },
      ...elements,
    );
  }

  // Circle shape
  if (shape.shape === 'circle') {
    const diameter = shape.size ?? 48;
    return React.createElement(SDKAnimatedView, {
      testID: `skeleton-item-${index}`,
      style: {
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        backgroundColor: color,
        opacity: shimmerAnim,
        flexShrink: 0,
      },
    });
  }

  // Rect shape (default)
  const rectWidth = shape.width ?? '100%';
  return React.createElement(SDKAnimatedView, {
    testID: `skeleton-item-${index}`,
    style: {
      width: rectWidth as number | `${number}%`,
      height: shape.height ?? 20,
      borderRadius: 4,
      backgroundColor: color,
      opacity: shimmerAnim,
    },
  });
};

SkeletonItem.displayName = 'SkeletonItem';

function buildSkeletonShapes(
  preset: string,
  rows: number,
  showAvatar: boolean,
  avatarSize: number,
  customLayout: SkeletonShape[] | undefined,
): SkeletonShape[] {
  if (preset === 'custom') return customLayout ?? [];
  if (preset === 'card') {
    const shapes: SkeletonShape[] = [];
    if (showAvatar) shapes.push({ shape: 'circle', size: avatarSize });
    shapes.push({ shape: 'rect', width: '100%', height: 120 });
    shapes.push({ shape: 'text', lines: rows });
    return shapes;
  }
  if (preset === 'profile') {
    return [
      { shape: 'circle', size: avatarSize },
      { shape: 'rect', width: '50%', height: 18 },
      { shape: 'text', lines: rows },
    ];
  }
  if (preset === 'paragraph') {
    return [{ shape: 'text', lines: rows }];
  }
  // list-item (default)
  const shapes: SkeletonShape[] = [];
  if (showAvatar) shapes.push({ shape: 'circle', size: avatarSize });
  shapes.push({ shape: 'text', lines: rows });
  return shapes;
}

function renderSkeleton(
  preset: string,
  rows: number,
  showAvatar: boolean,
  avatarSize: number,
  gap: number,
  customLayout: SkeletonShape[] | undefined,
  _color: string,
  trackColor: string,
  containerStyle: Record<string, unknown>,
): React.ReactElement {
  const shimmerColor = trackColor;
  const shapes = buildSkeletonShapes(preset, rows, showAvatar, avatarSize, customLayout);
  const isListItem = preset === 'list-item';

  return React.createElement(
    SDKView,
    {
      style: {
        padding: 16,
        flexDirection: isListItem ? ('row' as const) : ('column' as const),
        alignItems: isListItem ? ('center' as const) : undefined,
        gap,
        ...containerStyle,
      },
      accessibilityRole: 'progressbar' as const,
      accessibilityLabel: i18n.t('loading.label'),
    },
    ...shapes.map((shape, idx) =>
      React.createElement(SkeletonItem, {
        key: `skeleton-${idx}`,
        shape,
        index: idx,
        color: shimmerColor,
        gap,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LoadingComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const dt = context.designTokens;
  const loadingVariant = (node.loadingVariant as string | undefined) ??
    (node.props?.loadingVariant as string | undefined) ?? 'spinner';
  const sizeValue = (typeof node.size === 'string' ? node.size : undefined) ??
    (node.props?.size as string | undefined) ?? 'md';

  // Color priority: node.color > colors.spinner > colors.primary > fallback
  const color = node.color ??
    (node.props?.color as string | undefined) ??
    dt.colors.spinner ??
    dt.colors.primary ??
    '#7C3AED';

  // Track color: colors.spinnerTrack > colors.border > fallback
  const trackColor = dt.colors.spinnerTrack ?? dt.colors.border ?? '#E5E7EB';
  const surfaceColor = dt.colors.surface ?? '#FFFFFF';
  const textColor = dt.colors.text ?? '#374151';
  const textSecondaryColor = dt.colors.textSecondary ?? '#6B7280';

  const loadingText = (node.loadingText as string | undefined) ??
    (node.props?.loadingText as string | undefined);
  const rawProgress = node.progress ?? (node.props?.progress as string | number | undefined);
  const progressValue = typeof rawProgress === 'number' ? rawProgress :
    (typeof rawProgress === 'string' ? parseFloat(rawProgress) || 0 : 0);
  const direction = (node.loadingDirection as 'vertical' | 'horizontal' | undefined) ??
    (node.props?.loadingDirection as 'vertical' | 'horizontal' | undefined) ?? 'vertical';

  // Progress-specific
  const indeterminate = (node.indeterminate as boolean | undefined) ??
    (node.props?.indeterminate as boolean | undefined) ?? false;
  const textAlign = (node.textAlign as 'left' | 'center' | 'right' | undefined) ??
    (node.props?.textAlign as 'left' | 'center' | 'right' | undefined) ?? 'left';
  const showPercent = (node.showPercent as boolean | undefined) ??
    (node.props?.showPercent as boolean | undefined) ?? true;

  // Skeleton-specific
  const skeletonPreset = (node.skeletonPreset as string | undefined) ??
    (node.props?.skeletonPreset as string | undefined) ??
    ((node.skeletonLayout || node.props?.skeletonLayout) ? 'custom' : 'list-item');
  const skeletonRows = (typeof node.skeletonRows === 'number' ? node.skeletonRows : undefined) ??
    (typeof node.props?.skeletonRows === 'number' ? node.props.skeletonRows as number : undefined) ?? 3;
  const skeletonAvatar = (node.skeletonAvatar as boolean | undefined) ??
    (node.props?.skeletonAvatar as boolean | undefined) ?? true;
  const skeletonAvatarSize = (typeof node.skeletonAvatarSize === 'number' ? node.skeletonAvatarSize : undefined) ??
    (typeof node.props?.skeletonAvatarSize === 'number' ? node.props.skeletonAvatarSize as number : undefined) ?? 48;
  const skeletonGap = (typeof node.skeletonGap === 'number' ? node.skeletonGap : undefined) ??
    (typeof node.props?.skeletonGap === 'number' ? node.props.skeletonGap as number : undefined) ?? 8;
  const skeletonLayout = (node.skeletonLayout as SkeletonShape[] | undefined) ??
    (node.props?.skeletonLayout as SkeletonShape[] | undefined);

  const indicatorSize = SIZE_MAP[sizeValue] ?? 'small';

  // Style override from node.style
  const containerStyle: Record<string, unknown> = {};
  if (node.style?.padding != null) containerStyle.padding = Number(node.style.padding);
  if (node.style?.margin != null) containerStyle.margin = Number(node.style.margin);
  if (node.style?.backgroundColor) containerStyle.backgroundColor = String(node.style.backgroundColor);
  if (node.style?.borderRadius != null) containerStyle.borderRadius = Number(node.style.borderRadius);

  switch (loadingVariant) {
    case 'progress':
      return renderProgressBar(
        progressValue, color, trackColor, textSecondaryColor,
        loadingText, indeterminate, textAlign, showPercent, containerStyle,
      );
    case 'overlay':
      return renderOverlay(indicatorSize, color, surfaceColor, textColor, loadingText, containerStyle);
    case 'skeleton':
      return renderSkeleton(
        skeletonPreset, skeletonRows, skeletonAvatar, skeletonAvatarSize,
        skeletonGap, skeletonLayout, color, trackColor, containerStyle,
      );
    case 'spinner':
    default:
      return renderSpinner(indicatorSize, color, loadingText, direction, containerStyle);
  }
};

LoadingComponent.displayName = 'LoadingComponent';
