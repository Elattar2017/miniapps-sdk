/**
 * ModuleTile - A single module tile for the ActionZone
 * @module components/ModuleTile
 *
 * Renders a module's icon and name as a tappable tile.
 * Used inside ActionZone to represent each available module.
 */

import React, { useContext } from 'react';
import { SDKView, SDKText, SDKImage, SDKTouchableOpacity } from '../adapters';
import type { ModuleSummary } from '../types';
import { iconRegistry } from '../schema/icons/IconRegistry';
import { KernelContext } from '../kernel/KernelContext';

export interface ModuleTileProps {
  module: ModuleSummary;
  onPress: () => void;
}

/** First letter fallback when icon URL is not available or fails to load */
function IconFallback({ name }: { name: string }): React.JSX.Element {
  const letter = name.charAt(0).toUpperCase();
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const colorIndex = name.length % colors.length;

  return React.createElement(
    SDKView,
    {
      style: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: colors[colorIndex],
        justifyContent: 'center',
        alignItems: 'center',
      },
    },
    React.createElement(
      SDKText,
      { style: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' } },
      letter,
    ),
  );
}

export function ModuleTile({ module: mod, onPress }: ModuleTileProps): React.JSX.Element {
  const kernelCtx = useContext(KernelContext);
  const apiBaseUrl = kernelCtx?.config?.apiBaseUrl ?? '';
  const iconValue = mod.icon ?? '';

  // Determine icon type: SVG icon name, image URL, or fallback
  const isIconName = iconValue.length > 0 && !iconValue.includes('/') && !iconValue.includes('.');
  const isRelativePath = iconValue.startsWith('/');
  const isAbsoluteUrl = iconValue.startsWith('http');

  let icon: React.JSX.Element;
  if (isIconName) {
    // Named icon (e.g. "wallet", "bar-chart") — render from IconRegistry
    const resolved = iconRegistry.resolve(iconValue, 24, '#FFFFFF');
    if (resolved) {
      icon = React.createElement(SDKView, {
        style: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center' },
      }, resolved);
    } else {
      icon = React.createElement(IconFallback, { name: mod.name });
    }
  } else if (isRelativePath || isAbsoluteUrl) {
    // Image URL — prepend base URL for relative paths
    const uri = isRelativePath ? `${apiBaseUrl}${iconValue}` : iconValue;
    icon = React.createElement(SDKImage, {
      source: { uri },
      style: { width: 48, height: 48, borderRadius: 12 },
      resizeMode: 'cover',
    });
  } else {
    icon = React.createElement(IconFallback, { name: mod.name });
  }

  return React.createElement(
    SDKTouchableOpacity,
    {
      onPress,
      activeOpacity: 0.7,
      style: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
        paddingVertical: 8,
      },
    },
    icon,
    React.createElement(
      SDKText,
      {
        numberOfLines: 1,
        style: {
          marginTop: 6,
          fontSize: 11,
          color: '#374151',
          textAlign: 'center',
          maxWidth: 72,
        },
      },
      mod.name,
    ),
  );
}
