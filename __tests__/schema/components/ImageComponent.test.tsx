/**
 * ImageComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ImageComponent } from '../../../src/schema/components/ImageComponent';
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

describe('ImageComponent', () => {
  it('renders image with source URI', () => {
    const node: SchemaNode = { type: 'image', source: 'https://example.com/img.png' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext() })); });
    const img = tree!.root.findAll((el: any) => el.props.source?.uri === 'https://example.com/img.png');
    expect(img.length).toBeGreaterThan(0);
  });

  it('returns null when no source', () => {
    const node: SchemaNode = { type: 'image' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext() })); });
    expect(tree!.toJSON()).toBeNull();
  });

  it('applies resizeMode', () => {
    const node: SchemaNode = { type: 'image', source: 'https://x.com/a.png', resizeMode: 'contain' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext() })); });
    const img = tree!.root.findAll((el: any) => el.props.resizeMode === 'contain');
    expect(img.length).toBeGreaterThan(0);
  });

  it('wraps in touchable when onPress defined', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'image', source: 'https://x.com/a.png',
      onPress: { action: 'navigate', screen: 'detail' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext({ onAction }) })); });
    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    expect(touchable.length).toBeGreaterThan(0);
    act(() => { touchable[0].props.onPress(); });
    expect(onAction).toHaveBeenCalled();
  });

  it('applies custom style', () => {
    const node: SchemaNode = { type: 'image', source: 'https://x.com/a.png', style: { width: 200, height: 200 } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext() })); });
    const img = tree!.root.findAll((el: any) => el.props.style?.width === 200);
    expect(img.length).toBeGreaterThan(0);
  });

  it('sets accessibilityLabel from alt', () => {
    const node: SchemaNode = { type: 'image', source: 'https://x.com/a.png', alt: 'A nice image' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(ImageComponent, { node, context: makeContext() })); });
    const img = tree!.root.findAll((el: any) => el.props.accessibilityLabel === 'A nice image');
    expect(img.length).toBeGreaterThan(0);
  });
});
