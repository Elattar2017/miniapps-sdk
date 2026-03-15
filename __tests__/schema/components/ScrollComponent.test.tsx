/**
 * ScrollComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ScrollComponent } from '../../../src/schema/components/ScrollComponent';
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

describe('ScrollComponent', () => {
  it('renders vertical by default', () => {
    const node: SchemaNode = { type: 'scroll' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ScrollComponent, { node, context: makeContext() }, 'content')); });
    const scroll = tree!.root.findAll((el: any) => el.props.horizontal === false || el.props.horizontal === undefined);
    expect(scroll.length).toBeGreaterThan(0);
  });

  it('renders horizontal when direction is horizontal', () => {
    const node: SchemaNode = { type: 'scroll', direction: 'horizontal' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ScrollComponent, { node, context: makeContext() }, 'content')); });
    const scroll = tree!.root.findAll((el: any) => el.props.horizontal === true);
    expect(scroll.length).toBeGreaterThan(0);
  });

  it('hides scroll indicator when showIndicator is false', () => {
    const node: SchemaNode = { type: 'scroll', showIndicator: false };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ScrollComponent, { node, context: makeContext() }, 'content')); });
    const scroll = tree!.root.findAll((el: any) => el.props.showsVerticalScrollIndicator === false);
    expect(scroll.length).toBeGreaterThan(0);
  });

  it('fires onAction for onScroll', () => {
    const onAction = jest.fn();
    const node: SchemaNode = { type: 'scroll', onScroll: { action: 'analytics', event: 'scroll' } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ScrollComponent, { node, context: makeContext({ onAction }) }, 'content')); });
    const scroll = tree!.root.findAll((el: any) => typeof el.props.onScroll === 'function');
    expect(scroll.length).toBeGreaterThan(0);
    act(() => { scroll[0].props.onScroll(); });
    expect(onAction).toHaveBeenCalled();
  });

  it('renders children', () => {
    const node: SchemaNode = { type: 'scroll' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ScrollComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Scrollable'),
      ));
    });
    const content = tree!.root.findAll((el: any) => el.children?.includes('Scrollable'));
    expect(content.length).toBeGreaterThan(0);
  });
});
