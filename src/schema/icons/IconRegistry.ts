/**
 * IconRegistry - Pluggable icon provider system
 * @module schema/icons/IconRegistry
 */

import React from 'react';
import { SDKText } from '../../adapters';

/** Interface for icon providers */
export interface IconProvider {
  /** Unique name for this provider */
  name: string;
  /** Resolve an icon name to a React element, or null if not supported */
  resolve(iconName: string, size: number, color: string): React.ReactElement | null;
}

/** Unicode icon character mapping (BMP-safe — no emoji, renders on all platforms) */
const ICON_MAP: Record<string, string> = {
  // Navigation arrows
  'arrow-left': '\u2190', 'arrow-right': '\u2192',
  'arrow-up': '\u2191', 'arrow-down': '\u2193',
  'chevron-left': '\u2039', 'chevron-right': '\u203A',
  'chevron-up': '\u2303', 'chevron-down': '\u2304',
  // Actions
  check: '\u2713', close: '\u2715', search: '\u26B2', menu: '\u2630',
  add: '\u002B', remove: '\u2212', edit: '\u270E', delete: '\u2716',
  refresh: '\u21BB', send: '\u27A4', filter: '\u25BC',
  download: '\u2B07', upload: '\u2B06', share: '\u2197', copy: '\u2398',
  // Objects
  home: '\u2302', star: '\u2605', heart: '\u2665', settings: '\u2699',
  user: '\u263A', info: '\u2139', warning: '\u26A0', error: '\u26D4',
  lock: '\u26BF', eye: '\u25C9', shield: '\u26E8',
  // Communication
  phone: '\u260E', message: '\u2709', mail: '\u2709',
  wifi: '\u2299', globe: '\u2641',
  // Common objects
  smartphone: '\u260E', 'credit-card': '\u2338',
  calendar: '\u2637', clock: '\u29D7',
};

/** Default provider using Unicode characters */
export class UnicodeIconProvider implements IconProvider {
  name = 'unicode';

  resolve(iconName: string, size: number, color: string): React.ReactElement | null {
    const char = ICON_MAP[iconName];
    if (!char) return null;

    return React.createElement(SDKText, {
      style: {
        fontSize: size,
        color,
        textAlign: 'center',
        lineHeight: size * 1.2,
        width: size,
        height: size * 1.2,
      },
    }, char);
  }
}

/** Icon registry that manages multiple icon providers */
export class IconRegistry {
  private providers: IconProvider[] = [];

  /** Register a new icon provider */
  registerProvider(provider: IconProvider): void {
    // Remove existing provider with same name
    this.providers = this.providers.filter(p => p.name !== provider.name);
    this.providers.push(provider);
  }

  /** Remove a provider by name */
  unregisterProvider(name: string): void {
    this.providers = this.providers.filter(p => p.name !== name);
  }

  /** Try to resolve an icon using registered providers (last registered = highest priority) */
  resolve(iconName: string, size: number, color: string): React.ReactElement | null {
    for (let i = this.providers.length - 1; i >= 0; i--) {
      const result = this.providers[i].resolve(iconName, size, color);
      if (result !== null) return result;
    }
    return null;
  }

  /** Get names of all registered providers */
  getRegisteredProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  /** Check if a provider is registered */
  hasProvider(name: string): boolean {
    return this.providers.some(p => p.name === name);
  }

  /** Clear all registered providers */
  clearProviders(): void {
    this.providers = [];
  }
}

/** Singleton icon registry instance */
export const iconRegistry = new IconRegistry();

// Register the default Unicode provider (lowest priority fallback)
iconRegistry.registerProvider(new UnicodeIconProvider());
