/**
 * ChartComponent Test Suite
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
    chartData: [{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }],
    ...overrides,
  };
}

describe('ChartComponent', () => {
  it('renders without crashing', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('shows chart type label for bar chart', () => {
    const node = makeNode({ chartType: 'bar' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labels = tree!.root.findAll((el: any) => el.children?.includes('Bar Chart'));
    expect(labels.length).toBeGreaterThan(0);
  });

  it('shows chart type label for line chart', () => {
    const node = makeNode({ chartType: 'line' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labels = tree!.root.findAll((el: any) => el.children?.includes('Line Chart'));
    expect(labels.length).toBeGreaterThan(0);
  });

  it('shows chart type label for pie chart', () => {
    const node = makeNode({ chartType: 'pie' });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labels = tree!.root.findAll((el: any) => el.children?.includes('Pie Chart'));
    expect(labels.length).toBeGreaterThan(0);
  });

  it('renders correct number of data elements for data points', () => {
    const node = makeNode({
      chartData: [{ x: 1 }, { x: 2 }, { x: 3 }],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // The accessibility label includes the data point count
    const labelledElement = tree!.root.findAll(
      (el: any) => el.props.accessibilityLabel === 'bar chart with 3 data points',
    );
    expect(labelledElement.length).toBeGreaterThan(0);
  });

  it('renders chart for single data point', () => {
    const node = makeNode({
      chartData: [{ x: 1 }],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // The accessibility label includes the data point count
    const labelledElement = tree!.root.findAll(
      (el: any) => el.props.accessibilityLabel === 'bar chart with 1 data points',
    );
    expect(labelledElement.length).toBeGreaterThan(0);
  });

  it('shows "No data" for empty data', () => {
    const node = makeNode({ chartData: [] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const noDataLabels = tree!.root.findAll((el: any) => el.children?.includes('No data'));
    expect(noDataLabels.length).toBeGreaterThan(0);
  });

  it('defaults to bar chart type when not specified', () => {
    const node: SchemaNode = { type: 'chart', chartData: [{ label: 'Test', value: 10 }] };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labels = tree!.root.findAll((el: any) => el.children?.includes('Bar Chart'));
    expect(labels.length).toBeGreaterThan(0);
  });

  it('defaults to "No data" when chartData not specified', () => {
    const node: SchemaNode = { type: 'chart', chartType: 'pie' };
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const noDataLabels = tree!.root.findAll((el: any) => el.children?.includes('No data'));
    expect(noDataLabels.length).toBeGreaterThan(0);
  });

  it('renders with border styling', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const bordered = tree!.root.findAll((el: any) => el.props.style?.borderWidth === 1);
    expect(bordered.length).toBeGreaterThan(0);
  });

  it('applies custom node styles', () => {
    const node = makeNode({ style: { margin: 24 } });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const styled = tree!.root.findAll((el: any) => el.props.style?.margin === 24);
    expect(styled.length).toBeGreaterThan(0);
  });

  it('sets accessibility label with chart type and count', () => {
    const node = makeNode({ chartType: 'line', chartData: [1, 2] });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labelledElement = tree!.root.findAll(
      (el: any) => el.props.accessibilityLabel === 'line chart with 2 data points',
    );
    expect(labelledElement.length).toBeGreaterThan(0);
  });

  it('has minHeight for placeholder container', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const container = tree!.root.findAll((el: any) => el.props.style?.minHeight === 200);
    expect(container.length).toBeGreaterThan(0);
  });

  it('wraps chart in animated view for entrance animation', () => {
    const node = makeNode();
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // The outermost element should have an opacity style (animated fade-in)
    const json = tree!.toJSON() as any;
    expect(json).toBeTruthy();
    expect(json.props.style).toBeDefined();
    expect(json.props.style.opacity).toBeDefined();
  });
});
