jest.mock("react-native");

import React from 'react';
import { IconRegistry, UnicodeIconProvider, iconRegistry } from '../../../src/schema/icons';
import type { IconProvider } from '../../../src/schema/icons';

// Suppress console output
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IconRegistry', () => {
  let registry: IconRegistry;

  beforeEach(() => {
    registry = new IconRegistry();
  });

  describe('registerProvider', () => {
    it('adds a provider to the registry', () => {
      const provider: IconProvider = { name: 'test', resolve: () => null };
      registry.registerProvider(provider);
      expect(registry.hasProvider('test')).toBe(true);
    });

    it('replaces existing provider with same name', () => {
      const provider1: IconProvider = { name: 'test', resolve: () => null };
      const provider2: IconProvider = { name: 'test', resolve: () => React.createElement('text', {}, 'replaced') };
      registry.registerProvider(provider1);
      registry.registerProvider(provider2);
      expect(registry.getRegisteredProviders()).toEqual(['test']);
      // Verify it's the second provider
      const result = registry.resolve('any', 24, '#000');
      expect(result).not.toBeNull();
    });

    it('allows multiple providers with different names', () => {
      registry.registerProvider({ name: 'a', resolve: () => null });
      registry.registerProvider({ name: 'b', resolve: () => null });
      expect(registry.getRegisteredProviders()).toEqual(['a', 'b']);
    });
  });

  describe('unregisterProvider', () => {
    it('removes a provider by name', () => {
      registry.registerProvider({ name: 'test', resolve: () => null });
      registry.unregisterProvider('test');
      expect(registry.hasProvider('test')).toBe(false);
    });

    it('does nothing when unregistering non-existent provider', () => {
      registry.unregisterProvider('nonexistent');
      expect(registry.getRegisteredProviders()).toEqual([]);
    });
  });

  describe('resolve', () => {
    it('returns null when no providers registered', () => {
      expect(registry.resolve('check', 24, '#000')).toBeNull();
    });

    it('returns first non-null result from providers', () => {
      const provider1: IconProvider = { name: 'first', resolve: () => null };
      const provider2: IconProvider = { name: 'second', resolve: () => React.createElement('text', {}, 'found') };
      registry.registerProvider(provider1);
      registry.registerProvider(provider2);
      const result = registry.resolve('any', 24, '#000');
      expect(result).not.toBeNull();
    });

    it('tries last-registered provider first (highest priority)', () => {
      const calls: string[] = [];
      registry.registerProvider({
        name: 'first',
        resolve: (name) => { calls.push('first:' + name); return React.createElement('text', {}, 'first'); },
      });
      registry.registerProvider({
        name: 'second',
        resolve: (name) => { calls.push('second:' + name); return React.createElement('text', {}, 'second'); },
      });
      registry.resolve('icon', 24, '#000');
      // Last registered provider has highest priority, resolves first
      expect(calls).toEqual(['second:icon']);
    });

    it('falls back to earlier provider when later returns null', () => {
      const calls: string[] = [];
      registry.registerProvider({
        name: 'first',
        resolve: () => { calls.push('first'); return React.createElement('text', {}, 'found'); },
      });
      registry.registerProvider({
        name: 'second',
        resolve: () => { calls.push('second'); return null; },
      });
      const result = registry.resolve('icon', 24, '#000');
      expect(calls).toEqual(['second', 'first']);
      expect(result).not.toBeNull();
    });

    it('passes size and color to provider', () => {
      let receivedSize = 0;
      let receivedColor = '';
      registry.registerProvider({
        name: 'test',
        resolve: (_name, size, color) => {
          receivedSize = size;
          receivedColor = color;
          return null;
        },
      });
      registry.resolve('icon', 32, '#FF0000');
      expect(receivedSize).toBe(32);
      expect(receivedColor).toBe('#FF0000');
    });
  });

  describe('getRegisteredProviders', () => {
    it('returns empty array when no providers', () => {
      expect(registry.getRegisteredProviders()).toEqual([]);
    });

    it('returns provider names in order', () => {
      registry.registerProvider({ name: 'alpha', resolve: () => null });
      registry.registerProvider({ name: 'beta', resolve: () => null });
      registry.registerProvider({ name: 'gamma', resolve: () => null });
      expect(registry.getRegisteredProviders()).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('hasProvider', () => {
    it('returns false for non-existent provider', () => {
      expect(registry.hasProvider('nonexistent')).toBe(false);
    });

    it('returns true for registered provider', () => {
      registry.registerProvider({ name: 'test', resolve: () => null });
      expect(registry.hasProvider('test')).toBe(true);
    });
  });

  describe('clearProviders', () => {
    it('removes all providers', () => {
      registry.registerProvider({ name: 'a', resolve: () => null });
      registry.registerProvider({ name: 'b', resolve: () => null });
      registry.clearProviders();
      expect(registry.getRegisteredProviders()).toEqual([]);
    });
  });
});

describe('UnicodeIconProvider', () => {
  let provider: UnicodeIconProvider;

  beforeEach(() => {
    provider = new UnicodeIconProvider();
  });

  it('has name "unicode"', () => {
    expect(provider.name).toBe('unicode');
  });

  it('resolves known icon names to elements', () => {
    const result = provider.resolve('check', 24, '#000');
    expect(result).not.toBeNull();
  });

  it('returns null for unknown icon names', () => {
    const result = provider.resolve('unknown-icon-xyz', 24, '#000');
    expect(result).toBeNull();
  });

  it('resolves all 20 standard icons', () => {
    const names = [
      'arrow-left', 'arrow-right', 'arrow-up', 'arrow-down',
      'check', 'close', 'search', 'menu', 'home', 'star',
      'heart', 'settings', 'user', 'info', 'warning', 'error',
      'add', 'remove', 'edit', 'delete',
    ];
    for (const name of names) {
      expect(provider.resolve(name, 24, '#000')).not.toBeNull();
    }
  });
});

describe('iconRegistry singleton', () => {
  it('has unicode provider registered by default', () => {
    expect(iconRegistry.hasProvider('unicode')).toBe(true);
  });

  it('resolves standard icons', () => {
    const result = iconRegistry.resolve('check', 24, '#000');
    expect(result).not.toBeNull();
  });
});
