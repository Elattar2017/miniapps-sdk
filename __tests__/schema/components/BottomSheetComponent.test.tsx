/**
 * BottomSheetComponent Test Suite
 */

import React from 'react';
import { create, ReactTestRenderer } from 'react-test-renderer';
import { BottomSheetComponent } from '../../../src/schema/components/BottomSheetComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test-tenant',
    moduleId: 'test-module',
    screenId: 'test-screen',
    data: {},
    state: {},
    user: { id: 'user-1' },
    designTokens: {
      colors: {
        primary: '#0066CC',
        background: '#FFFFFF',
        surface: '#FFFFFF',
        text: '#111827',
        textSecondary: '#6B7280',
        border: '#E5E7EB',
      },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SchemaNode>): SchemaNode {
  return {
    type: 'bottom_sheet',
    isOpen: 'true',
    ...overrides,
  } as SchemaNode;
}

describe('BottomSheetComponent', () => {
  it('returns null when isOpen is falsy', () => {
    const node = makeNode({ isOpen: '' });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    expect(renderer.toJSON()).toBeNull();
  });

  it('returns null when isOpen is undefined', () => {
    const node = makeNode({ isOpen: undefined });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    expect(renderer.toJSON()).toBeNull();
  });

  it('renders Modal when isOpen is truthy', () => {
    const node = makeNode({ isOpen: 'true' });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    const tree = renderer.toJSON();
    expect(tree).not.toBeNull();
    // Modal is the outermost component
    expect((tree as { type: string }).type).toBe('Modal');
  });

  it('shows title when provided', () => {
    const node = makeNode({ isOpen: 'true', title: 'My Sheet' });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('My Sheet');
  });

  it('renders children inside sheet', () => {
    const node = makeNode({ isOpen: 'true' });
    const ctx = makeContext();
    const child = React.createElement('View', { testID: 'child-content' }, 'Hello');
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx, children: child }),
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Hello');
  });

  it('fires onDismiss on backdrop press when dismissable', () => {
    const onAction = jest.fn();
    const dismissAction = { action: 'update_state', key: 'showSheet', value: false };
    const node = makeNode({
      isOpen: 'true',
      dismissable: true,
      onDismiss: dismissAction,
    });
    const ctx = makeContext({ onAction });
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );

    // Find the backdrop TouchableOpacity (the one with absolute positioning)
    const root = renderer.root;
    const touchables = root.findAllByType('TouchableOpacity' as unknown as React.ComponentType);
    // The backdrop is the first touchable with absolute position
    const backdrop = touchables.find((t) => {
      const style = t.props.style;
      return style && style.position === 'absolute';
    });
    expect(backdrop).toBeDefined();
    backdrop!.props.onPress();
    expect(onAction).toHaveBeenCalledWith(dismissAction);
  });

  it('does NOT fire onDismiss when dismissable is false', () => {
    const onAction = jest.fn();
    const dismissAction = { action: 'update_state', key: 'showSheet', value: false };
    const node = makeNode({
      isOpen: 'true',
      dismissable: false,
      onDismiss: dismissAction,
    });
    const ctx = makeContext({ onAction });
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );

    // The backdrop touchable should have onPress undefined
    const root = renderer.root;
    const touchables = root.findAllByType('TouchableOpacity' as unknown as React.ComponentType);
    const backdrop = touchables.find((t) => {
      const style = t.props.style;
      return style && style.position === 'absolute';
    });
    expect(backdrop).toBeDefined();
    expect(backdrop!.props.onPress).toBeUndefined();
  });

  it('shows handle by default', () => {
    const node = makeNode({ isOpen: 'true' });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    // Find the handle bar (View with width: 40, height: 5)
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    const handleBar = views.find((v) => {
      const style = v.props.style;
      return style && style.width === 40 && style.height === 5;
    });
    expect(handleBar).toBeDefined();
  });

  it('hides handle when showHandle is false', () => {
    const node = makeNode({ isOpen: 'true', showHandle: false });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    const handleBar = views.find((v) => {
      const style = v.props.style;
      return style && style.width === 40 && style.height === 5;
    });
    expect(handleBar).toBeUndefined();
  });

  it('applies custom style to sheet container', () => {
    const node = makeNode({
      isOpen: 'true',
      style: { backgroundColor: '#FF0000' },
    });
    const ctx = makeContext();
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('#FF0000');
  });

  it('fires onDismiss via onRequestClose (Android back)', () => {
    const onAction = jest.fn();
    const dismissAction = { action: 'update_state', key: 'showSheet', value: false };
    const node = makeNode({
      isOpen: 'true',
      dismissable: true,
      onDismiss: dismissAction,
    });
    const ctx = makeContext({ onAction });
    const renderer = create(
      React.createElement(BottomSheetComponent, { node, context: ctx }),
    );

    // The Modal's onRequestClose
    const root = renderer.root;
    const modal = root.findByType('Modal' as unknown as React.ComponentType);
    expect(modal.props.onRequestClose).toBeDefined();
    modal.props.onRequestClose();
    expect(onAction).toHaveBeenCalledWith(dismissAction);
  });
});
