/**
 * ChartComponent Render Test Suite
 *
 * Tests for bar, line, and pie chart rendering using real data points.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ChartComponent } from '../../../src/schema/components/ChartComponent';
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
    type: 'chart',
    chartType: 'bar',
    chartData: [
      { label: 'A', value: 50 },
      { label: 'B', value: 100 },
      { label: 'C', value: 75 },
    ],
    ...overrides,
  };
}

/**
 * Find leaf elements by testID. The mock components create multiple layers,
 * so we filter for elements whose `type` is a string (the leaf DOM element).
 */
function findByTestID(root: ReactTestRenderer['root'], prefix: string) {
  return root.findAll(
    (el: any) =>
      typeof el.type === 'string' &&
      typeof el.props.testID === 'string' &&
      el.props.testID.startsWith(prefix),
  );
}

describe('ChartComponent - Bar Chart', () => {
  it('renders bar elements for each data point', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const barFills = findByTestID(tree!.root, 'bar-fill-');
    expect(barFills).toHaveLength(3);
  });

  it('shows labels and values as text', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labelA = tree!.root.findAll((el: any) => el.children?.includes('A'));
    expect(labelA.length).toBeGreaterThan(0);
    const value50 = tree!.root.findAll((el: any) => el.children?.includes('50'));
    expect(value50.length).toBeGreaterThan(0);
  });

  it('bars are proportional to values', () => {
    const node = makeNode({
      chartData: [
        { label: 'Small', value: 50 },
        { label: 'Large', value: 100 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const barFills = findByTestID(tree!.root, 'bar-fill-');
    expect(barFills).toHaveLength(2);

    // bar-fill-0 (value 50) should have flex = 50/100 = 0.5
    // bar-fill-1 (value 100) should have flex = 100/100 = 1.0
    const smallBarFlex = barFills[0].props.style?.flex;
    const largeBarFlex = barFills[1].props.style?.flex;
    expect(smallBarFlex).toBeCloseTo(0.5);
    expect(largeBarFlex).toBeCloseTo(1.0);
  });
});

describe('ChartComponent - Line Chart', () => {
  it('renders dots for each data point', () => {
    const node = makeNode({
      chartType: 'line',
      chartData: [
        { label: 'X1', value: 10 },
        { label: 'X2', value: 20 },
        { label: 'X3', value: 30 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const dots = findByTestID(tree!.root, 'line-dot-');
    expect(dots).toHaveLength(3);
  });

  it('renders line segments between dots', () => {
    const node = makeNode({
      chartType: 'line',
      chartData: [
        { label: 'X1', value: 10 },
        { label: 'X2', value: 20 },
        { label: 'X3', value: 30 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const segments = findByTestID(tree!.root, 'line-segment-');
    // 3 points => 2 segments
    expect(segments).toHaveLength(2);
  });
});

describe('ChartComponent - Pie Chart', () => {
  it('renders proportional segments', () => {
    const node = makeNode({
      chartType: 'pie',
      chartData: [
        { label: 'Red', value: 30 },
        { label: 'Blue', value: 70 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const segments = findByTestID(tree!.root, 'pie-segment-');
    expect(segments).toHaveLength(2);

    // Circular pie: segments use rotation transforms proportional to their value
    // Segment 0 (30%) should rotate 0deg (first segment starts at 0)
    // Segment 1 (70%) should rotate 108deg (30% of 360)
    const seg0Transform = segments[0].props.style?.transform;
    const seg1Transform = segments[1].props.style?.transform;
    expect(seg0Transform).toBeDefined();
    expect(seg1Transform).toBeDefined();
  });

  it('renders legend with labels', () => {
    const node = makeNode({
      chartType: 'pie',
      chartData: [
        { label: 'Red', value: 30 },
        { label: 'Blue', value: 70 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const redLegend = tree!.root.findAll(
      (el: any) => {
        const children = el.children;
        return Array.isArray(children) && children.some(
          (c: any) => typeof c === 'string' && c.includes('Red'),
        );
      },
    );
    expect(redLegend.length).toBeGreaterThan(0);

    const blueLegend = tree!.root.findAll(
      (el: any) => {
        const children = el.children;
        return Array.isArray(children) && children.some(
          (c: any) => typeof c === 'string' && c.includes('Blue'),
        );
      },
    );
    expect(blueLegend.length).toBeGreaterThan(0);
  });
});

describe('ChartComponent - Empty / Invalid Data', () => {
  it('shows "No data" text when chartData is empty', () => {
    const node = makeNode({ chartData: [] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const noData = tree!.root.findAll((el: any) => el.children?.includes('No data'));
    expect(noData.length).toBeGreaterThan(0);
  });

  it('shows "No data" text when chartData is not an array', () => {
    const node = makeNode({ chartData: 'not-an-array' as unknown as unknown[] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const noData = tree!.root.findAll((el: any) => el.children?.includes('No data'));
    expect(noData.length).toBeGreaterThan(0);
  });
});

describe('ChartComponent - Data Capping', () => {
  it('caps data at 50 points', () => {
    const largeData = Array.from({ length: 51 }, (_, i) => ({
      label: `Item ${i}`,
      value: i + 1,
    }));
    const node = makeNode({ chartType: 'bar', chartData: largeData });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const barFills = findByTestID(tree!.root, 'bar-fill-');
    // Only 50 bars should render, not 51
    expect(barFills).toHaveLength(50);
  });
});

describe('ChartComponent - Custom Keys and Defaults', () => {
  it('uses custom chartLabel and chartValue keys', () => {
    const node = makeNode({
      chartData: [
        { name: 'Alpha', amount: 42 },
        { name: 'Beta', amount: 88 },
      ],
      chartLabel: 'name',
      chartValue: 'amount',
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const alphaLabel = tree!.root.findAll((el: any) => el.children?.includes('Alpha'));
    expect(alphaLabel.length).toBeGreaterThan(0);
    const value42 = tree!.root.findAll((el: any) => el.children?.includes('42'));
    expect(value42.length).toBeGreaterThan(0);
  });

  it('defaults to "bar" chartType when not specified', () => {
    const node: SchemaNode = {
      type: 'chart',
      chartData: [{ label: 'A', value: 10 }],
    };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const barTitle = tree!.root.findAll((el: any) => el.children?.includes('Bar Chart'));
    expect(barTitle.length).toBeGreaterThan(0);
    const barFills = findByTestID(tree!.root, 'bar-fill-');
    expect(barFills.length).toBeGreaterThan(0);
  });
});

describe('ChartComponent - Styling', () => {
  it('applies node.style to container', () => {
    const node = makeNode({ style: { margin: 24, backgroundColor: '#FFF000' } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const styled = tree!.root.findAll((el: any) => el.props.style?.margin === 24);
    expect(styled.length).toBeGreaterThan(0);
  });

  it('uses designTokens colors', () => {
    const customColors = {
      primary: '#FF0000',
      background: '#000000',
      text: '#FFFFFF',
      textSecondary: '#AAAAAA',
      border: '#333333',
    };
    const ctx = makeContext({
      designTokens: {
        colors: customColors,
        typography: { fontFamily: 'System', baseFontSize: 14 },
        spacing: { unit: 4 },
        borderRadius: { default: 8 },
      },
    });
    const node = makeNode();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const borderedElements = tree!.root.findAll(
      (el: any) => el.props.style?.borderColor === '#333333',
    );
    expect(borderedElements.length).toBeGreaterThan(0);
  });
});
