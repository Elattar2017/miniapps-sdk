jest.mock("react-native");

/**
 * IconComponent Integration Test Suite
 *
 * Behavioral integration tests for IconComponent.
 * Tests rendering, press handling, accessibility, and fallback behavior.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { IconComponent } from '../../../src/schema/components/IconComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test-tenant',
    moduleId: 'test-module',
    screenId: 'test-screen',
    data: {},
    state: {},
    user: { id: 'user-1' },
    designTokens: {
      colors: { primary: '#0066CC', background: '#FFFFFF', surface: '#F9FAFB', text: '#111827', border: '#E5E7EB' },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

describe('IconComponent Integration', () => {
  it('renders without crashing for known icon', () => {
    const node: SchemaNode = { type: 'icon', name: 'check' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders without crashing for unknown icon', () => {
    const node: SchemaNode = { type: 'icon', name: 'unknown-xyz' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders as button when onPress is provided', () => {
    const node: SchemaNode = { type: 'icon', name: 'close', onPress: { action: 'go_back' } };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const buttons = tree!.root.findAll(el => el.props.accessibilityRole === 'button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders as image when no onPress', () => {
    const node: SchemaNode = { type: 'icon', name: 'star' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const images = tree!.root.findAll(el => el.props.accessibilityRole === 'image');
    expect(images.length).toBeGreaterThan(0);
  });

  it('fires onAction when pressed', () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: 'icon', name: 'close', onPress: { action: 'go_back' } };
    const ctx = makeContext({ onAction });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const button = tree!.root.findAll(el => el.props.accessibilityRole === 'button')[0];
    act(() => { button.props.onPress(); });
    expect(onAction).toHaveBeenCalledWith({ action: 'go_back' });
  });

  it('sets accessibilityLabel to icon name', () => {
    const node: SchemaNode = { type: 'icon', name: 'settings' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'settings');
    expect(labeled.length).toBeGreaterThan(0);
  });

  it('uses default size 24', () => {
    const node: SchemaNode = { type: 'icon', name: 'check' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const sized = tree!.root.findAll(el => el.props.style?.fontSize === 24);
    expect(sized.length).toBeGreaterThan(0);
  });

  it('uses custom size', () => {
    const node: SchemaNode = { type: 'icon', name: 'check', size: 48 };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const sized = tree!.root.findAll(el => el.props.style?.fontSize === 48);
    expect(sized.length).toBeGreaterThan(0);
  });

  it('uses custom color', () => {
    const node: SchemaNode = { type: 'icon', name: 'check', color: '#FF0000' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const colored = tree!.root.findAll(el => el.props.style?.color === '#FF0000');
    expect(colored.length).toBeGreaterThan(0);
  });

  it('has hitSlop on pressable icons', () => {
    const node: SchemaNode = { type: 'icon', name: 'close', onPress: { action: 'go_back' } };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const withHitSlop = tree!.root.findAll(el => el.props.hitSlop != null);
    expect(withHitSlop.length).toBeGreaterThan(0);
  });

  it('renders empty string icon name gracefully', () => {
    const node: SchemaNode = { type: 'icon', name: '' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('reads name from props.name as fallback', () => {
    const node: SchemaNode = { type: 'icon', props: { name: 'home' } };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(IconComponent, { node, context: ctx }));
    });
    const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'home');
    expect(labeled.length).toBeGreaterThan(0);
  });
});
