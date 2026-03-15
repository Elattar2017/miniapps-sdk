/**
 * ConditionalComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ConditionalComponent } from '../../../src/schema/components/ConditionalComponent';
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

describe('ConditionalComponent', () => {
  it('renders children when visible is undefined (default visible)', () => {
    const node: SchemaNode = { type: 'conditional' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ConditionalComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Visible'),
      ));
    });
    const content = tree!.root.findAll((el: any) => el.children?.includes('Visible'));
    expect(content.length).toBeGreaterThan(0);
  });

  it('returns null when visible is "false"', () => {
    const node: SchemaNode = { type: 'conditional', visible: 'false' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ConditionalComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Hidden'),
      ));
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it('renders children when visible is pre-resolved to truthy', () => {
    // SchemaInterpreter resolves the expression; component sees the result
    const node: SchemaNode = { type: 'conditional', visible: 'true' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ConditionalComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Shown'),
      ));
    });
    const content = tree!.root.findAll((el: any) => el.children?.includes('Shown'));
    expect(content.length).toBeGreaterThan(0);
  });

  it('wraps in SDKView when style is provided', () => {
    const node: SchemaNode = { type: 'conditional', style: { padding: 16 } };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ConditionalComponent, { node, context: makeContext() },
        React.createElement('Text', { key: 'c' }, 'Styled'),
      ));
    });
    const wrapper = tree!.root.findAll((el: any) => el.props.style?.padding === 16);
    expect(wrapper.length).toBeGreaterThan(0);
  });

  it('renders Fragment (no wrapper) when no style', () => {
    const node: SchemaNode = { type: 'conditional' };
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ConditionalComponent, { node, context: makeContext() },
        'Plain text child',
      ));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });
});
