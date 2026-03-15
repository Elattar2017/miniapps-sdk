/**
 * ModuleTile - A single module tile for the ActionZone
 * @module components/ModuleTile
 *
 * Renders a module's icon and name as a tappable tile.
 * Used inside ActionZone to represent each available module.
 */

import React from 'react';
import { SDKView, SDKText, SDKImage, SDKTouchableOpacity } from '../adapters';
import type { ModuleSummary } from '../types';

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
  const hasIcon = mod.icon && mod.icon.length > 0;

  const icon = hasIcon
    ? React.createElement(SDKImage, {
        source: { uri: mod.icon },
        style: { width: 48, height: 48, borderRadius: 12 },
        resizeMode: 'cover',
      })
    : React.createElement(IconFallback, { name: mod.name });

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
