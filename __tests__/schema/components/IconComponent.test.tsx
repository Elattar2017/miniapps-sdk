jest.mock("react-native");

/**
 * IconComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { IconComponent } from '../../../src/schema/components/IconComponent';
import { iconRegistry } from '../../../src/schema/icons';
import type { IconProvider } from '../../../src/schema/icons';
import type { RenderContext, SchemaNode } from '../../../src/types';

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 't', moduleId: 'm', screenId: 's',
    data: {}, state: {}, user: { id: 'u' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
    ...overrides,
  };
}

describe('IconComponent', () => {
  it('renders known icon character', () => {
    const node: SchemaNode = { type: 'icon', name: 'check' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
    const text = tree!.root.findAll((el: any) => el.children?.includes('\u2713'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders first letter for unknown icon', () => {
    const node: SchemaNode = { type: 'icon', name: 'custom-icon' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
    const text = tree!.root.findAll((el: any) => el.children?.includes('C'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('applies custom size', () => {
    const node: SchemaNode = { type: 'icon', name: 'star', size: 32 };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
    const icon = tree!.root.findAll((el: any) => el.props.style?.fontSize === 32);
    expect(icon.length).toBeGreaterThan(0);
  });

  it('applies custom color', () => {
    const node: SchemaNode = { type: 'icon', name: 'heart', color: '#FF0000' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
    const icon = tree!.root.findAll((el: any) => el.props.style?.color === '#FF0000');
    expect(icon.length).toBeGreaterThan(0);
  });

  it('wraps in touchable when onPress defined', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'icon', name: 'close',
      onPress: { action: 'go_back' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext({ onAction }) })); });
    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    expect(touchable.length).toBeGreaterThan(0);
    act(() => { touchable[0].props.onPress(); });
    expect(onAction).toHaveBeenCalledWith({ action: 'go_back' });
  });

  it('has accessibility label with icon name', () => {
    const node: SchemaNode = { type: 'icon', name: 'settings' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
    const icon = tree!.root.findAll((el: any) => el.props.accessibilityLabel === 'settings');
    expect(icon.length).toBeGreaterThan(0);
  });

  describe('IconRegistry integration', () => {
    let customProvider: IconProvider;

    beforeEach(() => {
      customProvider = {
        name: 'custom-test',
        resolve: (iconName: string, size: number, color: string) => {
          if (iconName === 'custom-rocket') {
            return React.createElement('text', { style: { fontSize: size, color } }, 'ROCKET');
          }
          return null;
        },
      };
    });

    afterEach(() => {
      // Clean up: remove custom provider after each test
      iconRegistry.unregisterProvider('custom-test');
    });

    it('renders icon using registry when provider is registered', () => {
      iconRegistry.registerProvider(customProvider);
      const node: SchemaNode = { type: 'icon', name: 'custom-rocket' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      const rocketText = tree!.root.findAll((el: any) => el.children?.includes('ROCKET'));
      expect(rocketText.length).toBeGreaterThan(0);
    });

    it('falls back when registry returns null for unknown icon', () => {
      iconRegistry.registerProvider(customProvider);
      const node: SchemaNode = { type: 'icon', name: 'totally-unknown' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      // Should fall back to first character uppercase: 'T'
      const fallback = tree!.root.findAll((el: any) => el.children?.includes('T'));
      expect(fallback.length).toBeGreaterThan(0);
    });

    it('custom provider overrides default for specific icon', () => {
      const overrideProvider: IconProvider = {
        name: 'custom-test',
        resolve: (iconName: string, size: number, color: string) => {
          if (iconName === 'check') {
            return React.createElement('text', { style: { fontSize: size, color } }, 'CUSTOM_CHECK');
          }
          return null;
        },
      };
      // Register override before unicode in a fresh scenario
      // Since unicode is already registered in the singleton, we need to
      // re-register our provider which will be appended after unicode.
      // The unicode provider resolves 'check' first. Let's unregister unicode, add custom, then re-add unicode.
      iconRegistry.unregisterProvider('unicode');
      iconRegistry.registerProvider(overrideProvider);
      // Now only custom-test is registered, and it handles 'check'
      const node: SchemaNode = { type: 'icon', name: 'check' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      const customCheck = tree!.root.findAll((el: any) => el.children?.includes('CUSTOM_CHECK'));
      expect(customCheck.length).toBeGreaterThan(0);
      // Restore unicode provider
      const { UnicodeIconProvider } = require('../../../src/schema/icons');
      iconRegistry.registerProvider(new UnicodeIconProvider());
    });

    it('renders correctly with default Unicode provider for known icon', () => {
      const node: SchemaNode = { type: 'icon', name: 'star' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      // Star unicode character
      const starText = tree!.root.findAll((el: any) => el.children?.includes('\u2605'));
      expect(starText.length).toBeGreaterThan(0);
    });

    it('pressable icon works with registry-provided icon', () => {
      iconRegistry.registerProvider(customProvider);
      const onAction = jest.fn();
      const node: SchemaNode = {
        type: 'icon', name: 'custom-rocket',
        onPress: { action: 'launch' },
      };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext({ onAction }) })); });
      const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
      expect(touchable.length).toBeGreaterThan(0);
      act(() => { touchable[0].props.onPress(); });
      expect(onAction).toHaveBeenCalledWith({ action: 'launch' });
      // Also verify the rocket text is rendered inside
      const rocketText = tree!.root.findAll((el: any) => el.children?.includes('ROCKET'));
      expect(rocketText.length).toBeGreaterThan(0);
    });

    it('non-pressable icon works with registry-provided icon', () => {
      iconRegistry.registerProvider(customProvider);
      const node: SchemaNode = { type: 'icon', name: 'custom-rocket' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      // Should have accessibility role image
      const accessible = tree!.root.findAll((el: any) => el.props.accessibilityRole === 'image');
      expect(accessible.length).toBeGreaterThan(0);
      // Should have accessibility label
      const labeled = tree!.root.findAll((el: any) => el.props.accessibilityLabel === 'custom-rocket');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('falls back to first char uppercase when no provider matches', () => {
      // Using an icon name that no provider can resolve
      const node: SchemaNode = { type: 'icon', name: 'zebra-icon' };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      const fallback = tree!.root.findAll((el: any) => el.children?.includes('Z'));
      expect(fallback.length).toBeGreaterThan(0);
    });

    it('fallback icon applies node.style overrides', () => {
      const node: SchemaNode = {
        type: 'icon',
        name: 'zebra-icon',
        style: { backgroundColor: '#FFCC00' },
      };
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(IconComponent, { node, context: makeContext() })); });
      const styled = tree!.root.findAll((el: any) => el.props.style?.backgroundColor === '#FFCC00');
      expect(styled.length).toBeGreaterThan(0);
    });
  });
});
