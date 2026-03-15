/**
 * InputComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { InputComponent } from '../../../src/schema/components/InputComponent';
import type { RenderContext, SchemaNode, ValidationRule } from '../../../src/types';

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

describe('InputComponent', () => {
  it('renders with placeholder', () => {
    const node: SchemaNode = { type: 'input', placeholder: 'Enter name' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext() })); });
    const input = tree!.root.findAll((el: any) => el.props.placeholder === 'Enter name');
    expect(input.length).toBeGreaterThan(0);
  });

  it('renders with label', () => {
    const node: SchemaNode = { type: 'input', label: 'Name' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext() })); });
    const label = tree!.root.findAll((el: any) => el.children?.includes('Name'));
    expect(label.length).toBeGreaterThan(0);
  });

  it('renders with pre-resolved value', () => {
    const node: SchemaNode = { type: 'input', value: 'Hello' };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext() })); });
    const input = tree!.root.findAll((el: any) => el.props.value === 'Hello');
    expect(input.length).toBeGreaterThan(0);
  });

  it('calls onAction when onChange fires', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'input',
      onChange: { action: 'update_state', key: 'name' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext({ onAction }) })); });
    const input = tree!.root.findAll((el: any) => typeof el.props.onChangeText === 'function');
    expect(input.length).toBeGreaterThan(0);
    act(() => { input[0].props.onChangeText('new value'); });
    expect(onAction).toHaveBeenCalled();
  });

  it('updates state for $state binding on change', () => {
    const onStateChange = jest.fn();
    const node: SchemaNode = {
      type: 'input',
      value: 'current',
      props: { value: '$state.name' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext({ onStateChange }) })); });
    const input = tree!.root.findAll((el: any) => typeof el.props.onChangeText === 'function');
    act(() => { input[0].props.onChangeText('new value'); });
    expect(onStateChange).toHaveBeenCalledWith('name', 'new value');
  });

  it('calls onAction on blur', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'input',
      onBlur: { action: 'validate' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext({ onAction }) })); });
    const input = tree!.root.findAll((el: any) => typeof el.props.onBlur === 'function');
    act(() => { input[0].props.onBlur(); });
    expect(onAction).toHaveBeenCalledWith({ action: 'validate' });
  });

  it('calls onAction on focus', () => {
    const onAction = jest.fn();
    const node: SchemaNode = {
      type: 'input',
      onFocus: { action: 'analytics', event: 'focus' },
    };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext({ onAction }) })); });
    const input = tree!.root.findAll((el: any) => typeof el.props.onFocus === 'function');
    act(() => { input[0].props.onFocus(); });
    expect(onAction).toHaveBeenCalled();
  });

  it('shows validation errors on blur when rules fail', () => {
    const rules: ValidationRule[] = [{ rule: 'required', message: 'Field is required' }];
    const node: SchemaNode = { type: 'input', id: 'email', value: '' };
    const ctx = makeContext({ validationRules: { email: rules } });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: ctx })); });

    // Trigger blur to run validation
    const input = tree!.root.findAll((el: any) => typeof el.props.onBlur === 'function');
    act(() => { input[0].props.onBlur(); });

    // Should show error message
    const errorText = tree!.root.findAll((el: any) =>
      el.props.style?.color === '#DC2626' && el.props.style?.fontSize === 12,
    );
    expect(errorText.length).toBeGreaterThan(0);
  });

  it('shows red border when validation errors present', () => {
    const node: SchemaNode = { type: 'input', id: 'email', value: '' };
    const ctx = makeContext({
      validationErrors: { email: ['Required'] },
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: ctx })); });
    const input = tree!.root.findAll((el: any) => el.props.style?.borderColor === '#DC2626');
    expect(input.length).toBeGreaterThan(0);
  });

  it('applies secure text entry', () => {
    const node: SchemaNode = { type: 'input', props: { secureEntry: true } };
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(InputComponent, { node, context: makeContext() })); });
    const input = tree!.root.findAll((el: any) => el.props.secureTextEntry === true);
    expect(input.length).toBeGreaterThan(0);
  });
});
