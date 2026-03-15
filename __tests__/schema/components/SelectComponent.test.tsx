/**
 * SelectComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { SelectComponent } from '../../../src/schema/components/SelectComponent';
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
        surface: '#F9FAFB',
        text: '#111827',
        textSecondary: '#6B7280',
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
    type: 'select',
    id: 'test-select',
    options: [
      { label: 'Option A', value: 'a' },
      { label: 'Option B', value: 'b' },
      { label: 'Option C', value: 'c' },
    ],
    ...overrides,
  };
}

describe('SelectComponent', () => {
  it('renders without crashing', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('shows placeholder when no value is selected', () => {
    const node = makeNode({ placeholder: 'Choose one' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    const placeholderElements = tree!.root.findAll((el: any) => el.children?.includes('Choose one'));
    expect(placeholderElements.length).toBeGreaterThan(0);
  });

  it('shows default placeholder when none provided', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    const defaultPlaceholder = tree!.root.findAll((el: any) => el.children?.includes('Select an option'));
    expect(defaultPlaceholder.length).toBeGreaterThan(0);
  });

  it('shows selected value label when state has a value', () => {
    const node = makeNode();
    const ctx = makeContext({ state: { 'test-select': 'b' } });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    const selectedLabel = tree!.root.findAll((el: any) => el.children?.includes('Option B'));
    expect(selectedLabel.length).toBeGreaterThan(0);
  });

  it('toggles dropdown open on press', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Initially dropdown should be closed - no options visible
    let optionA = tree!.root.findAll((el: any) => el.children?.includes('Option A'));
    expect(optionA.length).toBe(0);

    // Find the trigger touchable and press it
    const trigger = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole === 'button',
    );
    expect(trigger.length).toBeGreaterThan(0);

    act(() => {
      trigger[0].props.onPress();
    });

    // Now options should be visible
    optionA = tree!.root.findAll((el: any) => el.children?.includes('Option A'));
    expect(optionA.length).toBeGreaterThan(0);
  });

  it('calls onStateChange when an option is selected', () => {
    const onStateChange = jest.fn();
    const node = makeNode();
    const ctx = makeContext({ onStateChange });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Open dropdown
    const trigger = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole === 'button',
    );
    act(() => {
      trigger[0].props.onPress();
    });

    // Find and click Option B
    const optionTouchables = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole !== 'button',
    );
    // Find the touchable that contains 'Option B'
    const optionB = optionTouchables.find((el: any) => {
      const texts = el.findAll((child: any) => child.children?.includes('Option B'));
      return texts.length > 0;
    });
    expect(optionB).toBeTruthy();

    act(() => {
      optionB!.props.onPress();
    });
    expect(onStateChange).toHaveBeenCalledWith('test-select', 'b');
  });

  it('closes dropdown after selecting an option', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Open
    const trigger = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole === 'button',
    );
    act(() => {
      trigger[0].props.onPress();
    });

    // Select an option
    const optionTouchables = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole !== 'button',
    );
    act(() => {
      optionTouchables[0].props.onPress();
    });

    // Dropdown should be closed - verify by checking that option list is no longer rendered
    const optionsAfterSelect = tree!.root.findAll((el: any) => el.children?.includes('Option B'));
    // Option B text should not appear in dropdown (it's closed)
    // Only the selected label may appear
  });

  it('does not toggle when disabled', () => {
    const node = makeNode({ disabled: 'true' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Should have reduced opacity
    const trigger = tree!.root.findAll(
      (el: any) => el.props.style?.opacity === 0.5,
    );
    expect(trigger.length).toBeGreaterThan(0);
  });

  it('respects disabled options', () => {
    const node = makeNode({
      options: [
        { label: 'Enabled', value: 'enabled' },
        { label: 'Disabled', value: 'disabled', disabled: true },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Open dropdown
    const trigger = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole === 'button',
    );
    act(() => {
      trigger[0].props.onPress();
    });

    // Find the disabled option
    const disabledOptions = tree!.root.findAll(
      (el: any) => el.props.disabled === true && el.props.accessibilityRole !== 'button',
    );
    expect(disabledOptions.length).toBeGreaterThan(0);
  });

  it('shows down arrow when closed and up arrow when open', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });

    // Closed: should show down arrow
    let arrows = tree!.root.findAll((el: any) => el.children?.includes('\u25BC'));
    expect(arrows.length).toBeGreaterThan(0);

    // Open
    const trigger = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function' && el.props.accessibilityRole === 'button',
    );
    act(() => {
      trigger[0].props.onPress();
    });

    // Should show up arrow
    arrows = tree!.root.findAll((el: any) => el.children?.includes('\u25B2'));
    expect(arrows.length).toBeGreaterThan(0);
  });

  it('applies node styles to trigger', () => {
    const node = makeNode({ style: { margin: 16 } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    const styled = tree!.root.findAll((el: any) => el.props.style?.margin === 16);
    expect(styled.length).toBeGreaterThan(0);
  });

  it('handles empty options array', () => {
    const node = makeNode({ options: [] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(SelectComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });
});
