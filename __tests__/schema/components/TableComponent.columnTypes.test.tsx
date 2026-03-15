/**
 * TableComponent Column Types Test Suite
 *
 * Tests button and icon column types, cell-level action dispatch,
 * type→action normalization, mixed columns, and edge cases.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

// Mock adapters as plain string components to avoid forwardRef wrapper duplication
jest.mock('../../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKScrollView: 'SDKScrollView',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
}));

import { TableComponent } from '../../../src/schema/components/TableComponent';
import type { RenderContext, SchemaNode, TableColumn, ActionConfig } from '../../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test-tenant',
    moduleId: 'test-module',
    screenId: 'test-screen',
    data: {},
    state: {},
    user: { id: 'user-1' },
    designTokens: {
      colors: { primary: '#2563EB', background: '#FFFFFF', surface: '#F9FAFB', text: '#111827', border: '#E5E7EB' },
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

/** Find elements that have a specific text child */
function findByText(tree: ReactTestRenderer, text: string) {
  return tree.root.findAll(
    (el) =>
      el.children &&
      el.children.length > 0 &&
      el.children.some((c) => typeof c === 'string' && c.includes(text)),
  );
}

/** Find pressable elements with a specific accessibilityLabel */
function findPressable(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (el) => el.props.accessibilityLabel === label && typeof el.props.onPress === 'function',
  );
}

// ─── Button Column Type ─────────────────────────────────────────────

describe('TableComponent — button column type', () => {
  const buttonColumns: TableColumn[] = [
    { key: 'name', label: 'Name' },
    {
      key: 'actions',
      label: 'Actions',
      type: 'button',
      buttonLabel: 'View',
      onPress: { action: 'navigate', screen: 'details' },
    },
  ];

  it('renders button text in each data row', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: buttonColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const viewTexts = findByText(tree!, 'View');
    expect(viewTexts.length).toBe(2); // one per data row
  });

  it('button has primary color background', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: buttonColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'View');
    expect(btns.length).toBe(2);
    expect(btns[0].props.style.backgroundColor).toBe('#2563EB');
  });

  it('button text is white, 12px, weight 600', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: buttonColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const whiteTexts = tree!.root.findAll(
      (el) =>
        el.props.style?.color === '#FFFFFF' &&
        el.props.style?.fontSize === 12 &&
        el.props.style?.fontWeight === '600',
    );
    expect(whiteTexts.length).toBe(2);
  });

  it('falls back to column label when buttonLabel is not set', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'act', label: 'Do It', type: 'button', onPress: { action: 'navigate', screen: 'x' } },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Do It');
    expect(btns.length).toBe(2);
    const labelTexts = findByText(tree!, 'Do It');
    // Should appear in both header AND data rows (header label + button fallback)
    expect(labelTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('dispatches onPress with rowIndex and rowData for first row', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({ columns: buttonColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'View');
    act(() => { btns[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith({
      action: 'navigate',
      screen: 'details',
      payload: { rowIndex: 0, rowData: { name: 'Alice', age: 30 } },
    });
  });

  it('dispatches correct rowData for second row', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({ columns: buttonColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'View');
    act(() => { btns[1].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith({
      action: 'navigate',
      screen: 'details',
      payload: { rowIndex: 1, rowData: { name: 'Bob', age: 25 } },
    });
  });

  it('merges existing payload with injected rowIndex/rowData', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        {
          key: 'edit',
          label: 'Edit',
          type: 'button',
          buttonLabel: 'Edit',
          onPress: { action: 'navigate', screen: 'edit', payload: { mode: 'edit', source: 'table' } },
        },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Edit');
    act(() => { btns[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith({
      action: 'navigate',
      screen: 'edit',
      payload: { mode: 'edit', source: 'table', rowIndex: 0, rowData: { name: 'Alice', age: 30 } },
    });
  });

  it('renders as text cell when type=button but onPress is missing', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status', type: 'button' },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Should not render any button-styled touchables (with primaryColor bg)
    const styledBtns = tree!.root.findAll(
      (el) => el.props.style?.backgroundColor === '#2563EB' && el.props.accessibilityRole === 'button',
    );
    expect(styledBtns.length).toBe(0);
  });

  it('uses custom primary color from design tokens', () => {
    const ctx = makeContext({
      designTokens: {
        colors: { primary: '#FF5500', background: '#000' },
        typography: { fontFamily: 'Mono', baseFontSize: 14 },
        spacing: { unit: 4 },
        borderRadius: { default: 4 },
      },
    });
    const node = makeNode({
      columns: [
        {
          key: 'act',
          label: 'Go',
          type: 'button',
          buttonLabel: 'Go',
          onPress: { action: 'navigate', screen: 'x' },
        },
      ],
      data: [{ act: 'test' }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Go');
    expect(btns[0].props.style.backgroundColor).toBe('#FF5500');
  });
});

// ─── Icon Column Type ───────────────────────────────────────────────

describe('TableComponent — icon column type', () => {
  const iconColumns: TableColumn[] = [
    { key: 'name', label: 'Name' },
    {
      key: 'delete',
      label: 'Delete',
      type: 'icon',
      iconName: '\u{1F5D1}',
      iconColor: '#EF4444',
      onPress: { action: 'api_submit', api: '/users/delete' },
    },
  ];

  it('renders icon glyph in each data row', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: iconColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const icons = findByText(tree!, '\u{1F5D1}');
    expect(icons.length).toBe(2);
  });

  it('applies custom icon color', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: iconColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const colored = tree!.root.findAll(
      (el) => el.props.style?.color === '#EF4444' && el.props.style?.fontSize === 18,
    );
    expect(colored.length).toBe(2);
  });

  it('falls back to text color when iconColor is not set', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'v', label: 'View', type: 'icon', onPress: { action: 'navigate', screen: 'x' } },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const defaultColor = tree!.root.findAll(
      (el) => el.props.style?.color === '#111827' && el.props.style?.fontSize === 18,
    );
    expect(defaultColor.length).toBe(2);
  });

  it('uses bullet character when iconName is not set', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'a', label: 'Act', type: 'icon', onPress: { action: 'navigate', screen: 'x' } },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const bullets = findByText(tree!, '\u2022');
    expect(bullets.length).toBe(2);
  });

  it('dispatches onPress with rowIndex and rowData on icon press', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({ columns: iconColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const icons = findPressable(tree!, '\u{1F5D1}');
    expect(icons.length).toBe(2);

    act(() => { icons[0].props.onPress(); });
    expect(onAction).toHaveBeenCalledWith({
      action: 'api_submit',
      api: '/users/delete',
      payload: { rowIndex: 0, rowData: { name: 'Alice', age: 30 } },
    });
  });

  it('dispatches correct row data for second row icon', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({ columns: iconColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const icons = findPressable(tree!, '\u{1F5D1}');
    act(() => { icons[1].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith({
      action: 'api_submit',
      api: '/users/delete',
      payload: { rowIndex: 1, rowData: { name: 'Bob', age: 25 } },
    });
  });

  it('uses column label as accessibilityLabel when iconName is absent', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'v', label: 'View Details', type: 'icon', onPress: { action: 'navigate', screen: 'x' } },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'View Details');
    expect(btns.length).toBe(2);
  });

  it('renders as text cell when type=icon but onPress is missing', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status', type: 'icon', iconName: '\u2713' },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Falls through to text cell — no fontSize:18 icon touchables
    const iconBtns = tree!.root.findAll(
      (el) => el.props.style?.fontSize === 18 && typeof el.props.onPress === 'function',
    );
    expect(iconBtns.length).toBe(0);
  });

  it('icon cell wrapper has centered alignment', () => {
    const ctx = makeContext();
    const node = makeNode({ columns: iconColumns });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const centered = tree!.root.findAll(
      (el) => el.props.style?.alignItems === 'center' && el.props.style?.flex === 1,
    );
    expect(centered.length).toBe(2); // one per data row
  });
});

// ─── handleCellAction normalization ─────────────────────────────────

describe('TableComponent — handleCellAction normalization', () => {
  it('normalizes "type" field to "action" (screen builder compat)', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        {
          key: 'act',
          label: 'Go',
          type: 'button',
          buttonLabel: 'Go',
          // Screen builder saves { type: "navigate" } instead of { action: "navigate" }
          onPress: { type: 'navigate', screen: 'target' } as unknown as ActionConfig,
        },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Go');
    act(() => { btns[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'navigate',
        screen: 'target',
        payload: expect.objectContaining({ rowIndex: 0 }),
      }),
    );
  });

  it('prefers action field over type field when both present', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        {
          key: 'act',
          label: 'Go',
          type: 'button',
          buttonLabel: 'Go',
          onPress: { action: 'navigate', type: 'api_call', screen: 'real' } as unknown as ActionConfig,
        },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Go');
    act(() => { btns[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'navigate' }),
    );
  });

  it('does nothing when onPress has neither action nor type', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        {
          key: 'act',
          label: 'Bad',
          type: 'button',
          buttonLabel: 'Bad',
          onPress: { screen: 'nowhere' } as unknown as ActionConfig,
        },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const btns = findPressable(tree!, 'Bad');
    act(() => { btns[0].props.onPress(); });

    expect(onAction).not.toHaveBeenCalled();
  });

  it('normalization works for icon columns too', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        {
          key: 'del',
          label: 'Del',
          type: 'icon',
          iconName: 'X',
          onPress: { type: 'api_submit', api: '/delete' } as unknown as ActionConfig,
        },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    const icons = findPressable(tree!, 'X');
    act(() => { icons[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'api_submit', api: '/delete' }),
    );
  });
});

// ─── Mixed Column Types ─────────────────────────────────────────────

describe('TableComponent — mixed column types', () => {
  it('renders text, button, and icon columns together', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'view', label: 'View', type: 'button', buttonLabel: 'View', onPress: { action: 'navigate', screen: 'details' } },
        { key: 'del', label: 'Delete', type: 'icon', iconName: 'X', iconColor: '#EF4444', onPress: { action: 'api_submit', api: '/del' } },
      ],
      data: [{ name: 'Alice', age: 30 }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Text cell
    expect(findByText(tree!, 'Alice').length).toBeGreaterThan(0);
    // Button cell
    expect(findPressable(tree!, 'View').length).toBe(1);
    // Icon cell
    expect(findPressable(tree!, 'X').length).toBe(1);
  });

  it('button and icon dispatch independent actions', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'view', label: 'View', type: 'button', buttonLabel: 'View', onPress: { action: 'navigate', screen: 'details' } },
        { key: 'del', label: 'Delete', type: 'icon', iconName: 'X', onPress: { action: 'api_submit', api: '/del' } },
      ],
      data: [{ name: 'Alice', age: 30 }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Press button
    act(() => { findPressable(tree!, 'View')[0].props.onPress(); });
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'navigate' }));

    onAction.mockClear();

    // Press icon
    act(() => { findPressable(tree!, 'X')[0].props.onPress(); });
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'api_submit' }));
  });

  it('button/icon dispatch correct rowData after sorting', () => {
    const onAction = jest.fn();
    const ctx = makeContext({ onAction });
    const node = makeNode({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'edit', label: 'Edit', type: 'button', buttonLabel: 'Edit', onPress: { action: 'navigate', screen: 'edit' } },
      ],
      data: [
        { name: 'Charlie', age: 35 },
        { name: 'Alice', age: 30 },
      ],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Sort by name ascending
    const sortBtn = tree!.root.findAll(
      (el) => el.props.accessibilityLabel === 'Sort by Name' && typeof el.props.onPress === 'function',
    );
    act(() => { sortBtn[0].props.onPress(); });

    // After sort, first row = Alice
    const editBtns = findPressable(tree!, 'Edit');
    act(() => { editBtns[0].props.onPress(); });

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ rowIndex: 0, rowData: { name: 'Alice', age: 30 } }),
      }),
    );
  });
});

// ─── Default text column type ───────────────────────────────────────

describe('TableComponent — default text column type', () => {
  it('type "text" renders as plain text cell', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [{ key: 'name', label: 'Name', type: 'text' }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    expect(findByText(tree!, 'Alice').length).toBeGreaterThan(0);
    expect(findByText(tree!, 'Bob').length).toBeGreaterThan(0);
  });

  it('undefined type renders as text cell (default)', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [{ key: 'name', label: 'Name' }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    expect(findByText(tree!, 'Alice').length).toBeGreaterThan(0);
  });

  it('text cell has accessibilityRole "text"', () => {
    const ctx = makeContext();
    const node = makeNode({
      columns: [{ key: 'name', label: 'Name' }],
    });
    let tree: ReactTestRenderer;
    act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });

    // Data cell text: fontSize 14, role text. Header text also has role text but fontWeight 700.
    const dataCellTexts = tree!.root.findAll(
      (el) =>
        el.props.accessibilityRole === 'text' &&
        el.props.style?.fontSize === 14 &&
        el.props.style?.fontWeight !== '700',
    );
    // 2 data rows
    expect(dataCellTexts.length).toBe(2);
  });
});
