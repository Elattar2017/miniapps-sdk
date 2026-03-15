/**
 * ButtonComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ButtonComponent } from '../../../src/schema/components/ButtonComponent';
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
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SchemaNode>): SchemaNode {
  return { type: 'button', ...overrides };
}

describe('ButtonComponent', () => {
  it('renders with label', () => {
    const node = makeNode({ label: 'Click Me' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const textContent = tree!.root.findAll((el: any) => el.children?.includes('Click Me'));
    expect(textContent.length).toBeGreaterThan(0);
  });

  it('reads label from props fallback', () => {
    const node = makeNode({ props: { label: 'Props Label' } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const textContent = tree!.root.findAll((el: any) => el.children?.includes('Props Label'));
    expect(textContent.length).toBeGreaterThan(0);
  });

  it('fires onAction when pressed', () => {
    const onAction = jest.fn();
    const node = makeNode({
      label: 'Submit',
      onPress: { action: 'navigate', screen: 'form' },
    });
    const ctx = makeContext({ onAction });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    expect(touchable.length).toBeGreaterThan(0);

    act(() => {
      touchable[0].props.onPress();
    });
    expect(onAction).toHaveBeenCalledWith({ action: 'navigate', screen: 'form' });
  });

  it('does not fire when disabled', () => {
    const onAction = jest.fn();
    const node = makeNode({
      label: 'Disabled',
      disabled: 'true',
      onPress: { action: 'navigate', screen: 'form' },
    });
    const ctx = makeContext({ onAction });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    act(() => {
      touchable[0].props.onPress();
    });
    expect(onAction).not.toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    const node = makeNode({ label: 'Loading', loading: 'true' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    // Should have an ActivityIndicator
    const indicators = tree!.root.findAll((el: any) => el.props.size === 'small' && el.props.color !== undefined);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('applies primary variant by default', () => {
    const node = makeNode({ label: 'Primary' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const touchable = tree!.root.findAll((el: any) => el.props.style?.backgroundColor === '#0066CC');
    expect(touchable.length).toBeGreaterThan(0);
  });

  it('applies outline variant', () => {
    const node = makeNode({ label: 'Outline', variant: 'outline' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const touchable = tree!.root.findAll((el: any) => el.props.style?.backgroundColor === 'transparent');
    expect(touchable.length).toBeGreaterThan(0);
  });

  it('applies reduced opacity when disabled', () => {
    const node = makeNode({ label: 'Off', disabled: 'true' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ButtonComponent, { node, context: ctx }));
    });
    const touchable = tree!.root.findAll((el: any) => el.props.style?.opacity === 0.5);
    expect(touchable.length).toBeGreaterThan(0);
  });
});
