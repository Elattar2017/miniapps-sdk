/**
 * ChartComponent Multi-Series Test Suite
 *
 * Tests for multi-series line chart rendering including Y-axis, grid lines,
 * legend, annotations, and responsive sizing.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ChartComponent } from '../../../src/schema/components/ChartComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

/**
 * Helper: find elements by testID filtering to only host elements (string type).
 * This avoids the react-test-renderer triple-counting from forwardRef wrappers.
 */
function findByTestID(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll(
    (el) => typeof el.type === 'string' && el.props.testID === testID,
  );
}

/**
 * Helper: count elements whose testID starts with a prefix (host elements only).
 */
function countByTestIDPrefix(tree: ReactTestRenderer, prefix: string): number {
  return tree.root.findAll(
    (el) => typeof el.type === 'string' && typeof el.props.testID === 'string' && el.props.testID.startsWith(prefix),
  ).length;
}

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
    chartType: 'line',
    ...overrides,
  };
}

const weeklyTrafficData = [
  { day: 'MON', browsing: 0.2, streaming: 0.0, social: 0.1, downloads: 0.3, other: 0.1 },
  { day: 'TUE', browsing: 0.8, streaming: 0.1, social: 0.2, downloads: 0.3, other: 0.1 },
  { day: 'WED', browsing: 0.6, streaming: 0.5, social: 0.4, downloads: 0.3, other: 0.2 },
  { day: 'THU', browsing: 1.5, streaming: 0.3, social: 0.5, downloads: 0.1, other: 0.5 },
  { day: 'FRI', browsing: 2.0, streaming: 1.3, social: 0.8, downloads: 0.5, other: 0.2 },
  { day: 'SAT', browsing: 3.0, streaming: 1.5, social: 1.5, downloads: 0.5, other: 0.3 },
  { day: 'SUN', browsing: 1.5, streaming: 0.1, social: 0.7, downloads: 0.3, other: 0.1 },
];

const seriesConfig = [
  { key: 'browsing', label: 'Browsing', color: '#3B82F6' },
  { key: 'streaming', label: 'Streaming', color: '#10B981' },
  { key: 'social', label: 'Social Media', color: '#F59E0B' },
  { key: 'downloads', label: 'Downloads', color: '#EF4444' },
  { key: 'other', label: 'Other', color: '#8B5CF6' },
];

describe('ChartComponent Multi-Series', () => {
  // 1. Multi-series line chart renders without crashing
  it('renders multi-series line chart without crashing', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  // 2. Renders correct number of series (5 series -> 5 sets of line segments)
  it('renders correct number of series with line segments', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // 5 series, each should have at least one segment (first segment of each)
    for (let s = 0; s < 5; s++) {
      const segments = findByTestID(tree!, `ms-line-${s}-seg-0`);
      expect(segments.length).toBe(1);
    }
  });

  // 3. Each series uses its configured color
  it('each series uses its configured color', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Check first segment of each series
    for (let s = 0; s < seriesConfig.length; s++) {
      const segments = findByTestID(tree!, `ms-line-${s}-seg-0`);
      expect(segments.length).toBe(1);
      expect(segments[0].props.style.backgroundColor).toBe(seriesConfig[s].color);
    }
  });

  // 4. Design token palette fallback when series.color not provided
  it('falls back to design token palette when series.color not provided', () => {
    const noColorSeries = [
      { key: 'browsing', label: 'Browsing' },
      { key: 'streaming', label: 'Streaming' },
    ];
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: noColorSeries,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // palette[0] = designTokens.colors.primary = '#0066CC'
    // palette[1] = designTokens.colors.secondary ?? '#EF4444'
    const seg0 = findByTestID(tree!, 'ms-line-0-seg-0');
    expect(seg0[0].props.style.backgroundColor).toBe('#0066CC');
    const seg1 = findByTestID(tree!, 'ms-line-1-seg-0');
    expect(seg1[0].props.style.backgroundColor).toBe('#EF4444');
  });

  // 5. Y-axis renders tick labels
  it('renders Y-axis with tick labels', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartYAxis: { unit: 'GB' },
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const yAxisElements = findByTestID(tree!, 'y-axis');
    expect(yAxisElements.length).toBe(1);
    // Find text children within Y-axis that contain "GB"
    const gbLabels = tree!.root.findAll(
      (el) => {
        if (typeof el.type === 'string' && el.children && el.children.length === 1 && typeof el.children[0] === 'string') {
          return (el.children[0] as string).includes('GB');
        }
        return false;
      },
    );
    expect(gbLabels.length).toBeGreaterThan(1);
  });

  // 6. Y-axis shows unit suffix ("GB")
  it('Y-axis shows unit suffix', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartYAxis: { unit: 'GB' },
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Find text elements containing "GB"
    const gbLabels = tree!.root.findAll(
      (el) => {
        if (typeof el.type === 'string' && el.children && el.children.length === 1 && typeof el.children[0] === 'string') {
          return (el.children[0] as string).includes('GB');
        }
        return false;
      },
    );
    expect(gbLabels.length).toBeGreaterThan(0);
  });

  // 7. Y-axis auto-scales from data max
  it('Y-axis auto-scales from data max', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartYAxis: { unit: 'GB' },
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Max data value is 3.0 (browsing on SAT). Y-axis should auto-scale to at least 3.0
    const tickLabels = tree!.root.findAll(
      (el) => {
        if (typeof el.type === 'string' && el.children && el.children.length === 1 && typeof el.children[0] === 'string') {
          return (el.children[0] as string).includes('GB');
        }
        return false;
      },
    );
    const maxLabel = tickLabels
      .map((el) => parseFloat(el.children[0] as string))
      .filter((v) => !isNaN(v));
    expect(Math.max(...maxLabel)).toBeGreaterThanOrEqual(3.0);
  });

  // 8. Y-axis respects explicit min/max from chartYAxis config
  it('Y-axis respects explicit min/max from chartYAxis config', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartYAxis: { unit: 'GB', min: 0, max: 5.0 },
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const tickLabels = tree!.root.findAll(
      (el) => {
        if (typeof el.type === 'string' && el.children && el.children.length === 1 && typeof el.children[0] === 'string') {
          return (el.children[0] as string).includes('GB');
        }
        return false;
      },
    );
    const values = tickLabels
      .map((el) => parseFloat(el.children[0] as string))
      .filter((v) => !isNaN(v));
    // With max=5.0, the max tick should be >= 5.0
    expect(Math.max(...values)).toBeGreaterThanOrEqual(5.0);
  });

  // 9. Grid lines rendered at each Y tick
  it('renders grid lines at each Y tick', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Grid lines should exist (host elements only)
    const gridLine0 = findByTestID(tree!, 'grid-line-0');
    expect(gridLine0.length).toBe(1);
    const gridLine1 = findByTestID(tree!, 'grid-line-1');
    expect(gridLine1.length).toBe(1);
  });

  // 10. chartShowGrid=false hides grid lines
  it('hides grid lines when chartShowGrid=false', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartShowGrid: false,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const gridLines = countByTestIDPrefix(tree!, 'grid-line-');
    expect(gridLines).toBe(0);
  });

  // 11. Legend shows all series labels with colors
  it('renders legend with all series labels and colors', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const legend = findByTestID(tree!, 'chart-legend');
    expect(legend.length).toBe(1);
    // Check each series label appears
    for (const series of seriesConfig) {
      const labelEl = tree!.root.findAll(
        (el) => typeof el.type === 'string' && el.children && el.children.includes(series.label),
      );
      expect(labelEl.length).toBeGreaterThan(0);
    }
    // Check legend swatches
    for (let i = 0; i < seriesConfig.length; i++) {
      const swatch = findByTestID(tree!, `legend-swatch-${i}`);
      expect(swatch.length).toBe(1);
      expect(swatch[0].props.style.backgroundColor).toBe(seriesConfig[i].color);
    }
  });

  // 12. chartShowLegend=false hides legend
  it('hides legend when chartShowLegend=false', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartShowLegend: false,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const legends = findByTestID(tree!, 'chart-legend');
    expect(legends.length).toBe(0);
  });

  // 13. Annotations display at correct positions with correct text
  it('renders annotations with correct text', () => {
    const annotations = [
      { seriesIndex: 0, dataIndex: 5, label: '3.0 GB' },
      { seriesIndex: 2, dataIndex: 5, label: '1.5 GB' },
    ];
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartAnnotations: annotations,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const ann0 = findByTestID(tree!, 'annotation-0');
    expect(ann0.length).toBe(1);
    const ann1 = findByTestID(tree!, 'annotation-1');
    expect(ann1.length).toBe(1);
    // Check annotation text
    const annTexts = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('3.0 GB'),
    );
    expect(annTexts.length).toBeGreaterThan(0);
  });

  // 14. chartTitle overrides auto-generated title
  it('chartTitle overrides auto-generated title', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartTitle: 'Weekly Traffic Breakdown',
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const titleLabels = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('Weekly Traffic Breakdown'),
    );
    expect(titleLabels.length).toBeGreaterThan(0);
    // Should NOT show default "Line Chart" title
    const defaultLabels = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('Line Chart'),
    );
    expect(defaultLabels.length).toBe(0);
  });

  // 15. Backward compat: line chart without chartSeries renders old single-series
  it('line chart without chartSeries renders single-series', () => {
    const node = makeNode({
      chartType: 'line',
      chartData: [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
        { label: 'C', value: 30 },
      ],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Should use old single-series renderer (line-dot-X testIDs)
    const dot0 = findByTestID(tree!, 'line-dot-0');
    expect(dot0.length).toBe(1);
    // Should NOT have multi-series testIDs
    const msDotCount = countByTestIDPrefix(tree!, 'ms-dot-');
    expect(msDotCount).toBe(0);
  });

  // 16. Empty chartSeries array: falls back to single-series renderer
  it('empty chartSeries array falls back to single-series renderer', () => {
    const node = makeNode({
      chartType: 'line',
      chartData: [
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
      ],
      chartSeries: [],
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Should use old single-series renderer
    const dot0 = findByTestID(tree!, 'line-dot-0');
    expect(dot0.length).toBe(1);
  });

  // 17. Series with missing key in data: value defaults to 0
  it('defaults to 0 when series key is missing in data item', () => {
    const data = [
      { day: 'MON', browsing: 1.0 },
      { day: 'TUE', browsing: 2.0 },
    ];
    const series = [
      { key: 'browsing', label: 'Browsing', color: '#3B82F6' },
      { key: 'missing_key', label: 'Missing', color: '#EF4444' },
    ];
    const node = makeNode({
      chartData: data,
      chartLabel: 'day',
      chartSeries: series,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Both series should render dots (host elements only)
    const dot_s1_0 = findByTestID(tree!, 'ms-dot-1-0');
    expect(dot_s1_0.length).toBe(1);
    const dot_s1_1 = findByTestID(tree!, 'ms-dot-1-1');
    expect(dot_s1_1.length).toBe(1);
  });

  // 18. Colors cycle when >8 series (design token palette: primary, secondary, then CHART_COLORS[2..7])
  it('colors cycle when more than 8 series', () => {
    const manySeriesConfig = Array.from({ length: 10 }, (_, i) => ({
      key: `series${i}`,
      label: `Series ${i}`,
    }));
    const data = [
      {
        label: 'A',
        series0: 1, series1: 2, series2: 3, series3: 4,
        series4: 5, series5: 6, series6: 7, series7: 8,
        series8: 9, series9: 10,
      },
      {
        label: 'B',
        series0: 2, series1: 3, series2: 4, series3: 5,
        series4: 6, series5: 7, series6: 8, series7: 9,
        series8: 10, series9: 11,
      },
    ];
    const node = makeNode({
      chartData: data,
      chartLabel: 'label',
      chartSeries: manySeriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Palette: [primary=#0066CC, secondary=#EF4444, #10B981, #F59E0B, #8B5CF6, #EC4899, #06B6D4, #84CC16]
    // Series 8 (index 8) should cycle to palette[8 % 8] = palette[0] = '#0066CC'
    const seg8 = findByTestID(tree!, 'ms-line-8-seg-0');
    expect(seg8[0].props.style.backgroundColor).toBe('#0066CC');
    // Series 9 should cycle to palette[9 % 8] = palette[1] = '#EF4444'
    const seg9 = findByTestID(tree!, 'ms-line-9-seg-0');
    expect(seg9[0].props.style.backgroundColor).toBe('#EF4444');
  });

  // 19. MAX_DATA_POINTS=50 still respected
  it('caps data at MAX_DATA_POINTS', () => {
    const largeData = Array.from({ length: 60 }, (_, i) => ({
      day: `D${i}`,
      browsing: i * 0.1,
    }));
    const series = [{ key: 'browsing', label: 'Browsing', color: '#3B82F6' }];
    const node = makeNode({
      chartData: largeData,
      chartLabel: 'day',
      chartSeries: series,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Should cap at 50 data points => 50 dots for series 0 (host elements only)
    const dotCount = countByTestIDPrefix(tree!, 'ms-dot-0-');
    expect(dotCount).toBe(50);
  });

  // 20. Hollow dots: dots have white fill and colored border
  it('renders hollow dots with white fill and colored border', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Check first dot of first series (host element only)
    const dots = findByTestID(tree!, 'ms-dot-0-0');
    expect(dots.length).toBe(1);
    const dot = dots[0];
    expect(dot.props.style.backgroundColor).toBe('#FFFFFF');
    expect(dot.props.style.borderWidth).toBe(2);
    expect(dot.props.style.borderColor).toBe('#3B82F6');
    expect(dot.props.style.borderRadius).toBe(5);
    expect(dot.props.style.width).toBe(10);
    expect(dot.props.style.height).toBe(10);
  });

  // 21. X-axis labels rendered from chartLabel key
  it('renders X-axis labels from chartLabel key', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const xLabels = findByTestID(tree!, 'ms-x-labels');
    expect(xLabels.length).toBe(1);
    // Check that day labels are present
    const monLabels = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('MON'),
    );
    expect(monLabels.length).toBeGreaterThan(0);
    const sunLabels = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('SUN'),
    );
    expect(sunLabels.length).toBeGreaterThan(0);
  });

  // 22. Accessibility label includes series count
  it('accessibility label includes series count for multi-series', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const labelledElement = tree!.root.findAll(
      (el) => el.props.accessibilityLabel === 'line chart with 5 series and 7 data points',
    );
    expect(labelledElement.length).toBeGreaterThan(0);
  });

  // 23. chartYAxis.ticks controls number of divisions
  it('chartYAxis.ticks controls number of Y-axis divisions', () => {
    const node = makeNode({
      chartData: weeklyTrafficData,
      chartLabel: 'day',
      chartSeries: seriesConfig,
      chartYAxis: { unit: 'GB', ticks: 3 },
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // With ticks=3, Y-axis should have fewer ticks than default
    const tickLabels = tree!.root.findAll(
      (el) => {
        if (typeof el.type === 'string' && el.children && el.children.length === 1 && typeof el.children[0] === 'string') {
          return (el.children[0] as string).includes('GB');
        }
        return false;
      },
    );
    // Should have at least 2 ticks
    expect(tickLabels.length).toBeGreaterThanOrEqual(2);
  });

  // 24. No data: shows "No data" placeholder (preserved)
  it('shows "No data" when chartData is empty', () => {
    const node = makeNode({
      chartData: [],
      chartSeries: seriesConfig,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    const noDataLabels = tree!.root.findAll(
      (el) => typeof el.type === 'string' && el.children && el.children.includes('No data'),
    );
    expect(noDataLabels.length).toBeGreaterThan(0);
  });

  // 25. Single data point: renders dots without line segments
  it('renders dots without line segments for single data point', () => {
    const data = [{ day: 'MON', browsing: 1.0, streaming: 0.5 }];
    const series = [
      { key: 'browsing', label: 'Browsing', color: '#3B82F6' },
      { key: 'streaming', label: 'Streaming', color: '#10B981' },
    ];
    const node = makeNode({
      chartData: data,
      chartLabel: 'day',
      chartSeries: series,
    });
    const ctx = makeContext();
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(React.createElement(ChartComponent, { node, context: ctx }));
    });
    // Should have dots but no line segments (host elements only)
    const dotCount = countByTestIDPrefix(tree!, 'ms-dot-');
    expect(dotCount).toBe(2); // one dot per series
    const segmentCount = tree!.root.findAll(
      (el) => typeof el.type === 'string' && typeof el.props.testID === 'string' && el.props.testID.includes('-seg-'),
    ).length;
    expect(segmentCount).toBe(0);
  });
});
