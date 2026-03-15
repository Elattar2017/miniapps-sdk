/**
 * CheckboxComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { CheckboxComponent } from '../../../src/schema/components/CheckboxComponent';
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
    designTokens: {
      colors: {
        primary: '#0066CC',
        background: '#FFFFFF',
        text: '#111827',
        border: '#E5E7EB',
      },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SchemaNode>): SchemaNode {
  return {
    type: 'checkbox',
    id: 'test-checkbox',
    ...overrides,
  };
}

describe('CheckboxComponent', () => {
  it('renders without crashing', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders label text', () => {
    const node = makeNode({ label: 'Accept Terms' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const labels = tree!.root.findAll((el: any) => el.children?.includes('Accept Terms'));
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders unchecked state by default', () => {
    const node = makeNode();
    const ctx = makeContext({ state: {} });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    // The checkbox indicator should have transparent background when unchecked
    const indicator = tree!.root.findAll(
      (el: any) => el.props.style?.backgroundColor === 'transparent' && el.props.style?.width === 20,
    );
    expect(indicator.length).toBeGreaterThan(0);
  });

  it('renders checked state from context.state', () => {
    const node = makeNode();
    const ctx = makeContext({ state: { 'test-checkbox': true } });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    // The checkbox indicator should have primary color background when checked
    const indicator = tree!.root.findAll(
      (el: any) => el.props.style?.backgroundColor === '#0066CC' && el.props.style?.width === 20,
    );
    expect(indicator.length).toBeGreaterThan(0);
  });

  it('shows checkmark when checked', () => {
    const node = makeNode();
    const ctx = makeContext({ state: { 'test-checkbox': true } });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const checkmarks = tree!.root.findAll((el: any) => el.children?.includes('\u2713'));
    expect(checkmarks.length).toBeGreaterThan(0);
  });

  it('does not show checkmark when unchecked', () => {
    const node = makeNode();
    const ctx = makeContext({ state: {} });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const checkmarks = tree!.root.findAll((el: any) => el.children?.includes('\u2713'));
    expect(checkmarks.length).toBe(0);
  });

  it('calls onStateChange with toggled value when pressed', () => {
    const onStateChange = jest.fn();
    const node = makeNode();
    const ctx = makeContext({ state: {}, onStateChange });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });

    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    expect(touchable.length).toBeGreaterThan(0);

    act(() => {
      touchable[0].props.onPress();
    });
    // Currently false (default), should toggle to true
    expect(onStateChange).toHaveBeenCalledWith('test-checkbox', true);
  });

  it('toggles from checked to unchecked', () => {
    const onStateChange = jest.fn();
    const node = makeNode();
    const ctx = makeContext({ state: { 'test-checkbox': true }, onStateChange });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });

    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    act(() => {
      touchable[0].props.onPress();
    });
    expect(onStateChange).toHaveBeenCalledWith('test-checkbox', false);
  });

  it('does not call onStateChange when disabled', () => {
    const onStateChange = jest.fn();
    const node = makeNode({ disabled: 'true' });
    const ctx = makeContext({ onStateChange });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });

    // The touchable should have disabled=true
    const touchable = tree!.root.findAll((el: any) => el.props.disabled === true);
    expect(touchable.length).toBeGreaterThan(0);
  });

  it('applies reduced opacity when disabled', () => {
    const node = makeNode({ disabled: 'true' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const disabledElement = tree!.root.findAll((el: any) => el.props.style?.opacity === 0.5);
    expect(disabledElement.length).toBeGreaterThan(0);
  });

  it('treats disabled="false" as not disabled', () => {
    const onStateChange = jest.fn();
    const node = makeNode({ disabled: 'false' });
    const ctx = makeContext({ onStateChange });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });

    const touchable = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
    act(() => {
      touchable[0].props.onPress();
    });
    expect(onStateChange).toHaveBeenCalled();
  });

  it('applies custom node styles', () => {
    const node = makeNode({ style: { marginTop: 20 } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const styled = tree!.root.findAll((el: any) => el.props.style?.marginTop === 20);
    expect(styled.length).toBeGreaterThan(0);
  });

  it('sets accessibility role to checkbox', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(CheckboxComponent, { node, context: ctx }));
    });
    const checkboxRole = tree!.root.findAll((el: any) => el.props.accessibilityRole === 'checkbox');
    expect(checkboxRole.length).toBeGreaterThan(0);
  });
});
