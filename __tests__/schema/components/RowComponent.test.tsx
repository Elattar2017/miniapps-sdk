/**
 * RowComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { RowComponent } from '../../../src/schema/components/RowComponent';
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

describe('RowComponent', () => {
  it('renders with flexDirection row', () => {
    const node: SchemaNode = { type: 'row' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RowComponent, { node, context: makeContext() }, 'child')); });
    const row = tree!.root.findAll((el: any) => el.props.style?.flexDirection === 'row');
    expect(row.length).toBeGreaterThan(0);
  });

  it('applies gap', () => {
    const node: SchemaNode = { type: 'row', gap: 12 };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RowComponent, { node, context: makeContext() }, 'child')); });
    const row = tree!.root.findAll((el: any) => el.props.style?.gap === 12);
    expect(row.length).toBeGreaterThan(0);
  });

  it('applies alignItems and justifyContent', () => {
    const node: SchemaNode = { type: 'row', alignItems: 'center', justifyContent: 'space-between' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RowComponent, { node, context: makeContext() }, 'child')); });
    const row = tree!.root.findAll((el: any) =>
      el.props.style?.alignItems === 'center' && el.props.style?.justifyContent === 'space-between',
    );
    expect(row.length).toBeGreaterThan(0);
  });

  it('applies flexWrap when wrap is true', () => {
    const node: SchemaNode = { type: 'row', wrap: true };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(RowComponent, { node, context: makeContext() }, 'child')); });
    const row = tree!.root.findAll((el: any) => el.props.style?.flexWrap === 'wrap');
    expect(row.length).toBeGreaterThan(0);
  });

  it('renders children', () => {
    const node: SchemaNode = { type: 'row' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(RowComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c1' }, 'Child 1'),
        React.createElement('Text', { key: 'c2' }, 'Child 2'),
      ));
    });
    const children = tree!.root.findAll((el: any) => el.children?.includes('Child 1'));
    expect(children.length).toBeGreaterThan(0);
  });
});
