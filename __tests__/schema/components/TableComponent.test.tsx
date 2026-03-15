/**
 * TableComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { TableComponent } from '../../../src/schema/components/TableComponent';
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
      colors: { primary: '#0066CC', background: '#FFFFFF', surface: '#F9FAFB', text: '#111827', border: '#E5E7EB' },
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
    type: 'table',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'age', label: 'Age' },
    ],
    data: [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ],
    ...overrides,
  };
}

describe('TableComponent', () => {
  it('renders without crashing', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders column headers', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    const nameHeaders = tree!.root.findAll((el: any) => el.children?.includes('Name'));
    const ageHeaders = tree!.root.findAll((el: any) => el.children?.includes('Age'));
    expect(nameHeaders.length).toBeGreaterThan(0);
    expect(ageHeaders.length).toBeGreaterThan(0);
  });

  it('renders data rows', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    const aliceElements = tree!.root.findAll((el: any) => el.children?.includes('Alice'));
    const bobElements = tree!.root.findAll((el: any) => el.children?.includes('Bob'));
    expect(aliceElements.length).toBeGreaterThan(0);
    expect(bobElements.length).toBeGreaterThan(0);
  });

  it('renders cell values from data', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    const ageValue = tree!.root.findAll((el: any) => el.children?.includes('30'));
    expect(ageValue.length).toBeGreaterThan(0);
  });

  it('limits rows when maxRows is set', () => {
    const node = makeNode({
      data: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 },
      ],
      maxRows: 2,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    // Charlie should not be rendered
    const charlieElements = tree!.root.findAll((el: any) => el.children?.includes('Charlie'));
    expect(charlieElements.length).toBe(0);
    // Alice and Bob should still appear
    const aliceElements = tree!.root.findAll((el: any) => el.children?.includes('Alice'));
    expect(aliceElements.length).toBeGreaterThan(0);
  });

  it('fires onAction when a row is pressed', () => {
    const onAction = jest.fn();
    const node = makeNode();
    const ctx = makeContext({ onAction });
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    // Find touchable data rows (have flexDirection: 'row' style, not header cells)
    const touchables = tree!.root.findAll(
      (el: any) =>
        typeof el.props.onPress === 'function' &&
        el.props.style?.flexDirection === 'row',
    );
    expect(touchables.length).toBeGreaterThan(0);

    act(() => {
      touchables[0].props.onPress();
    });
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_state',
        payload: expect.objectContaining({ rowIndex: 0 }),
      }),
    );
  });

  it('renders alternating row colors', () => {
    const node = makeNode({
      data: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    // Verify even-indexed rows have white background
    const whiteRows = tree!.root.findAll(
      (el: any) =>
        el.props.style?.backgroundColor === '#FFFFFF' &&
        el.props.style?.flexDirection === 'row' &&
        el.props.style?.borderBottomWidth === 1 &&
        typeof el.props.onPress === 'function',
    );
    expect(whiteRows.length).toBeGreaterThan(0);
    // Verify odd-indexed rows have surface color
    const surfaceRows = tree!.root.findAll(
      (el: any) =>
        el.props.style?.backgroundColor === '#F9FAFB' &&
        el.props.style?.flexDirection === 'row' &&
        el.props.style?.borderBottomWidth === 1 &&
        typeof el.props.onPress === 'function',
    );
    expect(surfaceRows.length).toBeGreaterThan(0);
  });

  it('renders empty table with no data', () => {
    const node = makeNode({ data: [] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('handles missing columns gracefully', () => {
    const node = makeNode({ columns: [] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders empty string for null/undefined cell values', () => {
    const node = makeNode({
      columns: [{ key: 'name', label: 'Name' }],
      data: [{ name: null as unknown as string }],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    // Should render without error
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('applies custom node styles', () => {
    const node = makeNode({ style: { margin: 16 } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(TableComponent, { node, context: ctx }));
    });
    // Find the container element with the custom margin
    const styled = tree!.root.findAll((el: any) => el.props.style?.margin === 16);
    expect(styled.length).toBeGreaterThan(0);
  });
});
