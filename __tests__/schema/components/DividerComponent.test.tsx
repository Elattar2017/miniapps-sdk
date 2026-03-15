/**
 * DividerComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { DividerComponent } from '../../../src/schema/components/DividerComponent';
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

describe('DividerComponent', () => {
  it('renders with default color and thickness', () => {
    const node: SchemaNode = { type: 'divider' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(DividerComponent, { node, context: makeContext() })); });
    const div = tree!.root.findAll((el: any) =>
      el.props.style?.height === 1 && el.props.style?.backgroundColor === '#E5E7EB',
    );
    expect(div.length).toBeGreaterThan(0);
  });

  it('renders with custom color', () => {
    const node: SchemaNode = { type: 'divider', color: '#FF0000' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(DividerComponent, { node, context: makeContext() })); });
    const div = tree!.root.findAll((el: any) => el.props.style?.backgroundColor === '#FF0000');
    expect(div.length).toBeGreaterThan(0);
  });

  it('renders with custom thickness', () => {
    const node: SchemaNode = { type: 'divider', thickness: 3 };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(DividerComponent, { node, context: makeContext() })); });
    const div = tree!.root.findAll((el: any) => el.props.style?.height === 3);
    expect(div.length).toBeGreaterThan(0);
  });

  it('is hidden from accessibility tree (decorative element)', () => {
    const node: SchemaNode = { type: 'divider' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(DividerComponent, { node, context: makeContext() })); });
    const div = tree!.root.findAll((el: any) => el.props.accessible === false);
    expect(div.length).toBeGreaterThan(0);
  });
});
