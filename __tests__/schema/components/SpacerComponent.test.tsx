/**
 * SpacerComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { SpacerComponent } from '../../../src/schema/components/SpacerComponent';
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

describe('SpacerComponent', () => {
  it('renders with default size 16', () => {
    const node: SchemaNode = { type: 'spacer' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(SpacerComponent, { node, context: makeContext() })); });
    const spacer = tree!.root.findAll((el: any) => el.props.style?.height === 16 && el.props.style?.width === 16);
    expect(spacer.length).toBeGreaterThan(0);
  });

  it('renders with custom size', () => {
    const node: SchemaNode = { type: 'spacer', size: 32 };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(SpacerComponent, { node, context: makeContext() })); });
    const spacer = tree!.root.findAll((el: any) => el.props.style?.height === 32 && el.props.style?.width === 32);
    expect(spacer.length).toBeGreaterThan(0);
  });

  it('is hidden from accessibility', () => {
    const node: SchemaNode = { type: 'spacer' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(SpacerComponent, { node, context: makeContext() })); });
    const spacer = tree!.root.findAll((el: any) => el.props.accessibilityElementsHidden === true);
    expect(spacer.length).toBeGreaterThan(0);
  });
});
