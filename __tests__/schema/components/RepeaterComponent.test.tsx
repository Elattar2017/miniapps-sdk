/**
 * RepeaterComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { RepeaterComponent } from '../../../src/schema/components/RepeaterComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(): RenderContext {
  return {
    tenantId: 't', moduleId: 'm', screenId: 's',
    data: {}, state: {}, user: { id: 'u' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
  };
}

describe('RepeaterComponent', () => {
  it('shows empty message when no children', () => {
    const node: SchemaNode = { type: 'repeater', emptyMessage: 'Nothing here' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RepeaterComponent, { node, context: makeContext() })); });
    const text = tree!.root.findAll((el: any) => el.children?.includes('Nothing here'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('shows default empty message', () => {
    const node: SchemaNode = { type: 'repeater' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RepeaterComponent, { node, context: makeContext() })); });
    const text = tree!.root.findAll((el: any) => el.children?.includes('No items'));
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders children when provided (pre-built by SchemaInterpreter)', () => {
    const node: SchemaNode = { type: 'repeater' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(RepeaterComponent, { node, context: makeContext() },
        React.createElement('View', { key: '0' }, 'Item 1'),
        React.createElement('View', { key: '1' }, 'Item 2'),
      ));
    });
    const items = tree!.root.findAll((el: any) => el.children?.includes('Item 1'));
    expect(items.length).toBeGreaterThan(0);
    const items2 = tree!.root.findAll((el: any) => el.children?.includes('Item 2'));
    expect(items2.length).toBeGreaterThan(0);
  });

  it('applies container style', () => {
    const node: SchemaNode = { type: 'repeater', style: { gap: 8, padding: 12 } };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(RepeaterComponent, { node, context: makeContext() },
        React.createElement('View', { key: '0' }, 'Item'),
      ));
    });
    const container = tree!.root.findAll((el: any) => el.props.style?.gap === 8 && el.props.style?.padding === 12);
    expect(container.length).toBeGreaterThan(0);
  });

  it('has list accessibility role when items present', () => {
    const node: SchemaNode = { type: 'repeater' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(RepeaterComponent, { node, context: makeContext() },
        React.createElement('View', { key: '0' }, 'Item'),
      ));
    });
    const list = tree!.root.findAll((el: any) => el.props.accessibilityRole === 'list');
    expect(list.length).toBeGreaterThan(0);
  });
});
