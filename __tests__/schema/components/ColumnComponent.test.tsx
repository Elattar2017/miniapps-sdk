/**
 * ColumnComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ColumnComponent } from '../../../src/schema/components/ColumnComponent';
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

describe('ColumnComponent', () => {
  it('renders with flexDirection column', () => {
    const node: SchemaNode = { type: 'column' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ColumnComponent, { node, context: makeContext() }, 'child')); });
    const col = tree!.root.findAll((el: any) => el.props.style?.flexDirection === 'column');
    expect(col.length).toBeGreaterThan(0);
  });

  it('applies gap', () => {
    const node: SchemaNode = { type: 'column', gap: 8 };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ColumnComponent, { node, context: makeContext() }, 'child')); });
    const col = tree!.root.findAll((el: any) => el.props.style?.gap === 8);
    expect(col.length).toBeGreaterThan(0);
  });

  it('applies alignItems and justifyContent', () => {
    const node: SchemaNode = { type: 'column', alignItems: 'flex-end', justifyContent: 'center' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ColumnComponent, { node, context: makeContext() }, 'child')); });
    const col = tree!.root.findAll((el: any) =>
      el.props.style?.alignItems === 'flex-end' && el.props.style?.justifyContent === 'center',
    );
    expect(col.length).toBeGreaterThan(0);
  });

  it('merges node.style overrides', () => {
    const node: SchemaNode = { type: 'column', style: { padding: 16, backgroundColor: '#FFF' } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ColumnComponent, { node, context: makeContext() }, 'child')); });
    const col = tree!.root.findAll((el: any) => el.props.style?.padding === 16);
    expect(col.length).toBeGreaterThan(0);
  });
});
