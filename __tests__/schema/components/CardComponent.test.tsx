/**
 * CardComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { CardComponent } from '../../../src/schema/components/CardComponent';
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

describe('CardComponent', () => {
  it('renders with elevation and border radius', () => {
    const node: SchemaNode = { type: 'card', elevation: 4, props: { borderRadius: 12 } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(CardComponent, { node, context: makeContext() }, 'content')); });
    const card = tree!.root.findAll((el: any) => el.props.style?.elevation === 4 && el.props.style?.borderRadius === 12);
    expect(card.length).toBeGreaterThan(0);
  });

  it('applies default elevation of 2', () => {
    const node: SchemaNode = { type: 'card' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(CardComponent, { node, context: makeContext() }, 'content')); });
    const card = tree!.root.findAll((el: any) => el.props.style?.elevation === 2);
    expect(card.length).toBeGreaterThan(0);
  });

  it('wraps in touchable when onPress defined', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'card',
      onPress: { action: 'navigate', screen: 'detail' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(CardComponent, { node, context: makeContext({ onAction }) }, 'content')); });
    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    expect(touchable.length).toBeGreaterThan(0);
    act(() => { touchable[0].props.onPress(); });
    expect(onAction).toHaveBeenCalledWith({ action: 'navigate', screen: 'detail' });
  });

  it('renders children', () => {
    const node: SchemaNode = { type: 'card' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CardComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Card Content'),
      ));
    });
    const content = tree!.root.findAll((el: any) => el.children?.includes('Card Content'));
    expect(content.length).toBeGreaterThan(0);
  });

  it('merges custom style', () => {
    const node: SchemaNode = { type: 'card', style: { backgroundColor: '#F0F0F0' } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(CardComponent, { node, context: makeContext() }, 'content')); });
    const card = tree!.root.findAll((el: any) => el.props.style?.backgroundColor === '#F0F0F0');
    expect(card.length).toBeGreaterThan(0);
  });
});
