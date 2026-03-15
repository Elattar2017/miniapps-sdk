/**
 * TabNavigatorComponent + TabPaneComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

jest.mock('../../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKScrollView: 'SDKScrollView',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
  SDKKeyboardAvoidingView: 'SDKKeyboardAvoidingView',
}));

import { TabNavigatorComponent } from '../../../src/schema/components/TabNavigatorComponent';
import { TabPaneComponent } from '../../../src/schema/components/TabPaneComponent';
import type { SchemaComponentProps, RenderContext, SchemaNode, DesignTokens } from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_TOKENS: DesignTokens = {
  colors: { primary: '#0066CC', background: '#FFFFFF', text: '#111827', textSecondary: '#6B7280', border: '#E5E7EB', surface: '#F9FAFB', error: '#EF4444', success: '#10B981', warning: '#F59E0B', secondary: '#6366F1' },
  typography: { fontFamily: 'System', baseFontSize: 14 },
  spacing: { unit: 4 },
  borderRadius: { default: 8 },
};

function makeContext(stateOverrides?: Record<string, unknown>): RenderContext {
  return {
    tenantId: 'test',
    moduleId: 'mod1',
    screenId: 'screen1',
    data: {},
    state: stateOverrides ?? {},
    user: { id: 'u1', tenantId: 'test' },
    designTokens: DEFAULT_TOKENS,
    onAction: jest.fn(),
    onStateChange: jest.fn(),
  };
}

function makeTabNode(type: 'bottom_tab_navigator' | 'top_tab_navigator', overrides?: Partial<SchemaNode>): SchemaNode {
  return {
    type,
    id: 'tabs1',
    children: [
      { type: 'tab_pane', label: 'Home', icon: 'home' } as SchemaNode,
      { type: 'tab_pane', label: 'Settings', icon: 'settings' } as SchemaNode,
      { type: 'tab_pane', label: 'Profile' } as SchemaNode,
    ],
    ...overrides,
  } as SchemaNode;
}

function renderTabNav(
  node: SchemaNode,
  context: RenderContext,
  children?: React.ReactNode,
): ReactTestRenderer {
  const el = React.createElement(TabNavigatorComponent, { node, context, children } as SchemaComponentProps);
  let tree: ReactTestRenderer;
  act(() => { tree = create(el); });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TabNavigatorComponent', () => {
  describe('basic rendering', () => {
    it('renders bottom_tab_navigator with tab bar after content', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home content'),
        React.createElement('div', { key: 'pane1' }, 'Settings content'),
        React.createElement('div', { key: 'pane2' }, 'Profile content'),
      ];
      const tree = renderTabNav(node, ctx, children);
      const root = tree.root;

      // Should have tablist role
      const tablist = root.findAll((el) => el.props?.accessibilityRole === 'tablist');
      expect(tablist.length).toBe(1);

      // Should have 3 tab buttons
      const tabs = root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs.length).toBe(3);

      // Tab labels
      expect(tabs[0].props.accessibilityLabel).toBe('Home');
      expect(tabs[1].props.accessibilityLabel).toBe('Settings');
      expect(tabs[2].props.accessibilityLabel).toBe('Profile');
    });

    it('renders top_tab_navigator with tab bar before content', () => {
      const ctx = makeContext();
      const node = makeTabNode('top_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home content'),
        React.createElement('div', { key: 'pane1' }, 'Settings content'),
      ];
      const tree = renderTabNav(node, ctx, children);
      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs.length).toBe(3);
    });

    it('renders empty state when no children', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', { children: [] });
      const tree = renderTabNav(node, ctx);
      // Should still render without error
      expect(tree.root).toBeTruthy();
    });
  });

  describe('tab state management', () => {
    it('defaults to first tab (index 0)', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home content'),
        React.createElement('div', { key: 'pane1' }, 'Settings content'),
      ];
      const tree = renderTabNav(node, ctx, children);

      // First tab should be selected
      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
      expect(tabs[1].props.accessibilityState).toEqual({ selected: false });
    });

    it('initializes state on first render', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator');
      renderTabNav(node, ctx);
      expect(ctx.onStateChange).toHaveBeenCalledWith('__tabs_tabs1', 0);
    });

    it('reads activeTab from state', () => {
      const ctx = makeContext({ '__tabs_tabs1': 1 });
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home'),
        React.createElement('div', { key: 'pane1' }, 'Settings'),
        React.createElement('div', { key: 'pane2' }, 'Profile'),
      ];
      const tree = renderTabNav(node, ctx, children);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs[0].props.accessibilityState).toEqual({ selected: false });
      expect(tabs[1].props.accessibilityState).toEqual({ selected: true });
      expect(tabs[2].props.accessibilityState).toEqual({ selected: false });
    });

    it('calls onStateChange when tab is pressed', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home'),
        React.createElement('div', { key: 'pane1' }, 'Settings'),
      ];
      const tree = renderTabNav(node, ctx, children);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      act(() => { tabs[1].props.onPress(); });

      expect(ctx.onStateChange).toHaveBeenCalledWith('__tabs_tabs1', 1);
    });

    it('does not call onStateChange when pressing already active tab', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('bottom_tab_navigator');
      const tree = renderTabNav(node, ctx);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      (ctx.onStateChange as jest.Mock).mockClear();
      act(() => { tabs[0].props.onPress(); });

      expect(ctx.onStateChange).not.toHaveBeenCalled();
    });

    it('clamps out-of-bounds index to 0', () => {
      const ctx = makeContext({ '__tabs_tabs1': 99 });
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home'),
      ];
      const tree = renderTabNav(node, ctx, children);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
    });

    it('uses activeTab prop as initial value', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', { activeTab: 2 });
      renderTabNav(node, ctx);
      expect(ctx.onStateChange).toHaveBeenCalledWith('__tabs_tabs1', 2);
    });
  });

  describe('onTabChange event', () => {
    it('fires onTabChange with tabIndex and tabLabel', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('bottom_tab_navigator', {
        onTabChange: { action: 'update_state' } as SchemaNode['onTabChange'],
      });
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home'),
        React.createElement('div', { key: 'pane1' }, 'Settings'),
      ];
      const tree = renderTabNav(node, ctx, children);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      act(() => { tabs[1].props.onPress(); });

      expect(ctx.onAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'update_state', tabIndex: 1, tabLabel: 'Settings' }),
      );
    });
  });

  describe('variant styling', () => {
    it('applies default variant with border indicator', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('bottom_tab_navigator', { variant: 'default' });
      const tree = renderTabNav(node, ctx);
      // Should render without error
      expect(tree.root).toBeTruthy();
    });

    it('applies pills variant with rounded background', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('bottom_tab_navigator', { variant: 'pills' });
      const tree = renderTabNav(node, ctx);
      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      // Active tab should have pill styling
      expect(tabs[0].props.style.borderRadius).toBe(20);
    });

    it('applies underline variant', () => {
      const ctx = makeContext({ '__tabs_tabs1': 0 });
      const node = makeTabNode('top_tab_navigator', { variant: 'underline' });
      const tree = renderTabNav(node, ctx);
      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      // Active tab should have bottom border
      expect(tabs[0].props.style.borderBottomWidth).toBe(2);
    });
  });

  describe('icons and badges', () => {
    it('renders icons from iconRegistry', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator');
      const tree = renderTabNav(node, ctx);
      // Tabs with icons should exist (Home and Settings have icons)
      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs.length).toBe(3);
    });

    it('renders badge on tab', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', {
        children: [
          { type: 'tab_pane', label: 'Inbox', icon: 'mail', badge: 5 } as SchemaNode,
          { type: 'tab_pane', label: 'Settings' } as SchemaNode,
        ],
      });
      const tree = renderTabNav(node, ctx);
      // Find badge text
      const badgeTexts = tree.root.findAll(
        (el) => el.type === 'SDKText' && el.children?.includes('5'),
      );
      expect(badgeTexts.length).toBeGreaterThan(0);
    });
  });

  describe('content display', () => {
    it('shows only active tab content', () => {
      const ctx = makeContext({ '__tabs_tabs1': 1 });
      const node = makeTabNode('bottom_tab_navigator');
      const children = [
        React.createElement('div', { key: 'pane0' }, 'Home content'),
        React.createElement('div', { key: 'pane1' }, 'Settings content'),
        React.createElement('div', { key: 'pane2' }, 'Profile content'),
      ];
      const tree = renderTabNav(node, ctx, children);

      // Should contain Settings content but not Home or Profile
      const json = JSON.stringify(tree.toJSON());
      expect(json).toContain('Settings content');
      expect(json).not.toContain('Home content');
      expect(json).not.toContain('Profile content');
    });
  });

  describe('scrollable', () => {
    it('wraps tab bar in ScrollView when scrollable is true', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', { scrollable: true });
      const tree = renderTabNav(node, ctx);

      const scrollViews = tree.root.findAll((el) => el.type === 'SDKScrollView');
      expect(scrollViews.length).toBeGreaterThan(0);
      expect(scrollViews[0].props.horizontal).toBe(true);
    });

    it('does not use ScrollView when scrollable is false', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', { scrollable: false });
      const tree = renderTabNav(node, ctx);

      const scrollViews = tree.root.findAll((el) => el.type === 'SDKScrollView');
      expect(scrollViews.length).toBe(0);
    });
  });

  describe('filters non-tab_pane children', () => {
    it('only creates tab buttons for tab_pane children', () => {
      const ctx = makeContext();
      const node = makeTabNode('bottom_tab_navigator', {
        children: [
          { type: 'tab_pane', label: 'Tab 1' } as SchemaNode,
          { type: 'text', value: 'Stray text' } as SchemaNode,
          { type: 'tab_pane', label: 'Tab 2' } as SchemaNode,
        ],
      });
      const tree = renderTabNav(node, ctx);

      const tabs = tree.root.findAll((el) => el.props?.accessibilityRole === 'tab');
      expect(tabs.length).toBe(2);
    });
  });
});

describe('TabPaneComponent', () => {
  it('renders children in a view', () => {
    const node = { type: 'tab_pane', label: 'Test' } as SchemaNode;
    const ctx = makeContext();
    const child = React.createElement('div', { key: 'c' }, 'Pane content');
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TabPaneComponent, { node, context: ctx, children: child } as SchemaComponentProps));
    });
    const json = JSON.stringify(tree!.toJSON());
    expect(json).toContain('Pane content');
  });

  it('applies custom styles', () => {
    const node = { type: 'tab_pane', label: 'Test', style: { padding: 16 } } as SchemaNode;
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TabPaneComponent, { node, context: ctx } as SchemaComponentProps));
    });
    expect(tree!.root.findByType('SDKView' as any).props.style).toEqual({ flex: 1, padding: 16 });
  });

  it('has correct displayName', () => {
    expect(TabPaneComponent.displayName).toBe('TabPaneComponent');
  });
});
