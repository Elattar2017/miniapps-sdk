/**
 * BadgeComponent Test Suite
 * Tests display, icon, selectable, active state, and accessibility
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { BadgeComponent } from '../../../src/schema/components/BadgeComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 't', moduleId: 'm', screenId: 's',
    data: {}, state: {}, user: { id: 'u' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
    ...overrides,
  };
}

function renderNode(node: SchemaNode, ctx?: RenderContext): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(React.createElement(BadgeComponent, { node, context: ctx ?? makeContext() })); });
  return tree!;
}

describe('BadgeComponent', () => {
  // =========================================================================
  // Basic display (existing tests)
  // =========================================================================
  it('renders with pre-resolved value', () => {
    const tree = renderNode({ type: 'badge', value: '5' });
    const text = tree.root.findAll((el: any) => el.children?.includes('5'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('applies primary color preset', () => {
    const tree = renderNode({ type: 'badge', value: 'New', color: 'primary' });
    const badge = tree.root.findAll((el: any) => el.props.style?.backgroundColor === '#0066CC');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('applies error color preset', () => {
    const tree = renderNode({ type: 'badge', value: 'Error', color: 'error' });
    const badge = tree.root.findAll((el: any) => el.props.style?.backgroundColor === '#DC2626');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('applies custom hex color', () => {
    const tree = renderNode({ type: 'badge', value: '!', color: '#8B5CF6' });
    const badge = tree.root.findAll((el: any) => el.props.style?.backgroundColor === '#8B5CF6');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('renders outlined variant', () => {
    const tree = renderNode({ type: 'badge', value: 'Tag', variant: 'outlined' } as SchemaNode);
    const badge = tree.root.findAll((el: any) => el.props.style?.backgroundColor === 'transparent');
    expect(badge.length).toBeGreaterThan(0);
  });

  it('has accessibility label', () => {
    const tree = renderNode({ type: 'badge', value: '3' });
    const badge = tree.root.findAll((el: any) => el.props.accessibilityLabel === 'Badge: 3');
    expect(badge.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // Icon rendering
  // =========================================================================
  describe('icon support', () => {
    it('renders icon on the left by default', () => {
      const tree = renderNode({ type: 'badge', value: 'Tag', icon: 'star' } as SchemaNode);
      const root = tree.root;
      // Container should have flexDirection row
      const rowContainers = root.findAll((el: any) => el.props.style?.flexDirection === 'row');
      expect(rowContainers.length).toBeGreaterThan(0);
      // Should have an icon element with marginRight
      const iconWrappers = root.findAll((el: any) => el.props.style?.marginRight === 4);
      expect(iconWrappers.length).toBeGreaterThan(0);
    });

    it('renders icon on the right when iconPosition is right', () => {
      const tree = renderNode({ type: 'badge', value: 'Tag', icon: 'star', iconPosition: 'right' } as SchemaNode);
      const iconWrappers = tree.root.findAll((el: any) => el.props.style?.marginLeft === 4);
      expect(iconWrappers.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Selectable behavior
  // =========================================================================
  describe('selectable behavior', () => {
    it('wraps in TouchableOpacity when selectable', () => {
      const tree = renderNode({ type: 'badge', value: 'Electronics', selectable: true, groupId: 'category' } as SchemaNode);
      // When selectable, accessibilityRole should be 'button'
      const buttons = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('renders as View (non-interactive) when not selectable and no onPress', () => {
      const tree = renderNode({ type: 'badge', value: 'Static' });
      const buttons = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button');
      expect(buttons.length).toBe(0);
      const texts = tree.root.findAll((el: any) => el.props.accessibilityRole === 'text');
      expect(texts.length).toBeGreaterThan(0);
    });

    it('calls onStateChange with groupId and value on press', () => {
      const ctx = makeContext();
      const tree = renderNode({ type: 'badge', value: 'Electronics', selectable: true, groupId: 'category' } as SchemaNode, ctx);
      // Find the touchable and simulate press
      const touchables = tree.root.findAll((el: any) => typeof el.props.onPress === 'function');
      expect(touchables.length).toBeGreaterThan(0);
      act(() => { touchables[0].props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('category', 'Electronics');
    });

    it('toggles off — pressing active badge sets empty string', () => {
      const ctx = makeContext({ state: { category: 'Electronics' } });
      const tree = renderNode({ type: 'badge', value: 'Electronics', selectable: true, groupId: 'category' } as SchemaNode, ctx);
      const touchables = tree.root.findAll((el: any) => typeof el.props.onPress === 'function');
      act(() => { touchables[0].props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('category', '');
    });

    it('applies activeColor when badge is selected', () => {
      const ctx = makeContext({ state: { category: 'Electronics' } });
      const tree = renderNode({
        type: 'badge', value: 'Electronics', selectable: true,
        groupId: 'category', activeColor: 'success',
      } as SchemaNode, ctx);
      // Active with 'success' preset → bg should be #16A34A
      const activeElements = tree.root.findAll((el: any) => el.props.style?.backgroundColor === '#16A34A');
      expect(activeElements.length).toBeGreaterThan(0);
    });

    it('applies activeVariant when badge is selected', () => {
      const ctx = makeContext({ state: { category: 'Tag' } });
      const tree = renderNode({
        type: 'badge', value: 'Tag', selectable: true,
        groupId: 'category', activeVariant: 'outlined',
      } as SchemaNode, ctx);
      // Active with outlined variant → bg transparent, border visible
      const outlinedElements = tree.root.findAll((el: any) =>
        el.props.style?.backgroundColor === 'transparent' && el.props.style?.borderWidth === 1,
      );
      expect(outlinedElements.length).toBeGreaterThan(0);
    });

    it('has accessibility selected state when active', () => {
      const ctx = makeContext({ state: { category: 'Electronics' } });
      const tree = renderNode({ type: 'badge', value: 'Electronics', selectable: true, groupId: 'category' } as SchemaNode, ctx);
      const selected = tree.root.findAll((el: any) => el.props.accessibilityState?.selected === true);
      expect(selected.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Combined selectable + onPress
  // =========================================================================
  describe('combined selectable + onPress', () => {
    it('fires both onStateChange and onAction on press', () => {
      const ctx = makeContext();
      const onPressAction = { action: 'analytics' as const, event: 'badge_click' };
      const tree = renderNode({
        type: 'badge', value: 'Gold',
        selectable: true, groupId: 'plan',
        onPress: onPressAction,
      } as SchemaNode, ctx);
      const touchables = tree.root.findAll((el: any) => typeof el.props.onPress === 'function');
      act(() => { touchables[0].props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('plan', 'Gold');
      expect(ctx.onAction).toHaveBeenCalledWith(onPressAction);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('reads props from node.props fallback', () => {
      const tree = renderNode({
        type: 'badge',
        props: { value: 'From props', icon: 'check' },
      } as SchemaNode);
      const texts = tree.root.findAll((el: any) => el.children?.includes('From props'));
      expect(texts.length).toBeGreaterThan(0);
    });

    it('onPress only (no selectable) renders as button', () => {
      const ctx = makeContext();
      const tree = renderNode({
        type: 'badge', value: 'Click me',
        onPress: { action: 'navigate' as const, screen: 'details' },
      } as SchemaNode, ctx);
      const buttons = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
