/**
 * TextComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { TextComponent } from '../../../src/schema/components/TextComponent';
import type { SchemaComponentProps, RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test-tenant',
    moduleId: 'test-module',
    screenId: 'test-screen',
    data: {},
    state: {},
    user: { id: 'user-1' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SchemaNode>): SchemaNode {
  return { type: 'text', ...overrides };
}

describe('TextComponent', () => {
  it('renders static text value', () => {
    const node = makeNode({ value: 'Hello World' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    const json = tree!.toJSON() as Record<string, unknown>;
    expect(json).toBeTruthy();
    // Text child should contain the value
    const textContent = tree!.root.findAll((el: any) => el.children?.includes('Hello World'));
    expect(textContent.length).toBeGreaterThan(0);
  });

  it('renders empty string when no value', () => {
    const node = makeNode({});
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders pre-resolved expression value', () => {
    // SchemaInterpreter resolves expressions before passing to component
    const node = makeNode({ value: '42 AED' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    const textContent = tree!.root.findAll((el: any) => el.children?.includes('42 AED'));
    expect(textContent.length).toBeGreaterThan(0);
  });

  it('applies style from node', () => {
    const node = makeNode({ value: 'Styled', style: { fontSize: 24, color: '#FF0000' } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    // Find the text element and check style
    const textEl = tree!.root.findAll((el: any) => el.props.style?.fontSize === 24);
    expect(textEl.length).toBeGreaterThan(0);
  });

  it('applies numberOfLines prop', () => {
    const node = makeNode({ value: 'Long text', numberOfLines: 2 });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    const textEl = tree!.root.findAll((el: any) => el.props.numberOfLines === 2);
    expect(textEl.length).toBeGreaterThan(0);
  });

  it('wraps in touchable when onPress is defined', () => {
    const onAction = jest.fn();
    const node = makeNode({
      value: 'Clickable',
      onPress: { action: 'navigate', screen: 'detail' },
    });
    const ctx = makeContext({ onAction });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    // Should have a touchable wrapper
    const touchable = tree!.root.findAll((el: any) => el.props.onPress !== undefined);
    expect(touchable.length).toBeGreaterThan(0);

    // Simulate press
    act(() => {
      touchable[0].props.onPress();
    });
    expect(onAction).toHaveBeenCalledWith({ action: 'navigate', screen: 'detail' });
  });

  it('reads value from props fallback', () => {
    const node = makeNode({ props: { value: 'From props' } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TextComponent, { node, context: ctx }));
    });
    const textContent = tree!.root.findAll((el: any) => el.children?.includes('From props'));
    expect(textContent.length).toBeGreaterThan(0);
  });
});
