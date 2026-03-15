/**
 * TableComponent Sort Test Suite
 *
 * Tests column sorting: header press sets sort column/direction,
 * data sorted correctly, sort indicator rendered.
 */

import React from 'react';

// Mock adapters before imports
jest.mock('../../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKScrollView: 'SDKScrollView',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
}));

import { TableComponent } from '../../../src/schema/components/TableComponent';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    moduleId: 'mod-1',
    screenId: 'screen-1',
    data: {},
    state: {},
    user: { id: 'user-1', tenantId: 'tenant-1' },
    designTokens: {
      colors: { primary: '#3B82F6', surface: '#F9FAFB', border: '#E5E7EB', text: '#111827' },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  } as any;
}

function renderTable(
  columns: Array<{ key: string; label: string; width?: number }>,
  data: Array<Record<string, unknown>>,
  context = createContext(),
) {
  const node = { type: 'table', columns, data };
  const element = React.createElement(TableComponent, { node, context } as any);
  // Flatten the rendered tree for inspection
  return element;
}

function getRenderedTree(
  columns: Array<{ key: string; label: string }>,
  data: Array<Record<string, unknown>>,
) {
  const context = createContext();
  const node = { type: 'table', columns, data };
  // Use React's test renderer to inspect the tree
  const TestRenderer = require('react-test-renderer');
  return TestRenderer.create(
    React.createElement(TableComponent, { node, context } as any),
  );
}

describe('TableComponent sorting', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'age', label: 'Age' },
  ];

  const data = [
    { name: 'Charlie', age: 30 },
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 35 },
  ];

  it('header press sets sort column', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // The component renders - find header touchable elements
    // The header row is the first child
    expect(tree).toBeDefined();
    // Find header cells (SDKTouchableOpacity in header row)
    const headerRow = tree.children[0]; // First child is header row
    expect(headerRow).toBeDefined();
    // Press the first header (Name column)
    const nameHeader = headerRow.children[0];
    expect(nameHeader).toBeDefined();
    // Simulate press
    if (nameHeader.props.onPress) {
      nameHeader.props.onPress();
    }
    // Re-render and check sort indicator appears
    const updatedTree = renderer.toJSON();
    const updatedHeader = updatedTree.children[0].children[0];
    const headerText = updatedHeader.children[0];
    // After press, header text should contain sort indicator
    expect(headerText.children.join('')).toContain('↑');
  });

  it('second press on same column toggles direction (asc → desc)', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    const nameHeader = tree.children[0].children[0];
    // First press - asc
    nameHeader.props.onPress();
    // Second press - desc
    const tree2 = renderer.toJSON();
    tree2.children[0].children[0].props.onPress();
    const tree3 = renderer.toJSON();
    const headerText = tree3.children[0].children[0].children[0];
    expect(headerText.children.join('')).toContain('↓');
  });

  it('press on different column changes sort column, resets to asc', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // Press Name header first
    tree.children[0].children[0].props.onPress();
    // Then press Age header
    const tree2 = renderer.toJSON();
    tree2.children[0].children[1].props.onPress();
    const tree3 = renderer.toJSON();
    // Age header should show ↑ (asc)
    const ageHeader = tree3.children[0].children[1].children[0];
    expect(ageHeader.children.join('')).toContain('↑');
    // Name header should NOT show sort indicator
    const nameHeader = tree3.children[0].children[0].children[0];
    expect(nameHeader.children.join('')).not.toContain('↑');
    expect(nameHeader.children.join('')).not.toContain('↓');
  });

  it('data sorted ascending by string column', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // Press Name header
    tree.children[0].children[0].props.onPress();
    const sorted = renderer.toJSON();
    // Data rows are in the ScrollView (second child)
    const scrollView = sorted.children[1];
    const rows = scrollView.children;
    // First data row should be Alice (sorted asc)
    const firstRowText = rows[0].children[0].children[0].children[0];
    expect(firstRowText).toBe('Alice');
  });

  it('data sorted descending by string column', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // Press Name header twice for desc
    tree.children[0].children[0].props.onPress();
    renderer.toJSON().children[0].children[0].props.onPress();
    const sorted = renderer.toJSON();
    const scrollView = sorted.children[1];
    const rows = scrollView.children;
    // First data row should be Charlie (sorted desc)
    const firstRowText = rows[0].children[0].children[0].children[0];
    expect(firstRowText).toBe('Charlie');
  });

  it('data sorted by numeric column', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // Press Age header
    tree.children[0].children[1].props.onPress();
    const sorted = renderer.toJSON();
    const scrollView = sorted.children[1];
    const rows = scrollView.children;
    // First data row age should be 25 (Alice, sorted asc by age)
    const firstRowAge = rows[0].children[1].children[0].children[0];
    expect(firstRowAge).toBe('25');
  });

  it('sort indicator rendered on active column', () => {
    const renderer = getRenderedTree(columns, data);
    const tree = renderer.toJSON();
    // Before sort: no indicators
    const nameHeaderBefore = tree.children[0].children[0].children[0];
    expect(nameHeaderBefore.children.join('')).not.toContain('↑');
    expect(nameHeaderBefore.children.join('')).not.toContain('↓');
    // Press Name header
    tree.children[0].children[0].props.onPress();
    const afterSort = renderer.toJSON();
    const nameHeaderAfter = afterSort.children[0].children[0].children[0];
    expect(nameHeaderAfter.children.join('')).toContain('↑');
  });

  it('empty data: sort does not crash', () => {
    expect(() => {
      const renderer = getRenderedTree(columns, []);
      const tree = renderer.toJSON();
      // Press header on empty table
      tree.children[0].children[0].props.onPress();
      renderer.toJSON();
    }).not.toThrow();
  });
});
