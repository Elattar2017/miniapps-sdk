/**
 * ChartComponent - Professional chart visualization using native Views and Text
 * @module schema/components/ChartComponent
 *
 * Renders bar, line, pie, donut, and gauge charts using only SDKView, SDKText,
 * and SDKTouchableOpacity. No external chart libraries or SVG required.
 *
 * Features:
 * - Responsive sizing via onLayout
 * - Real circular donut/pie charts
 * - Gauge chart for telecom dashboards
 * - Area fill under line charts
 * - Vertical & horizontal bar orientation
 * - Stacked bars for multi-series
 * - Design token integration
 * - Data value labels
 * - Clickable data points with tooltip callouts
 * - Smooth Bezier curves for line charts
 * - Negative value support
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity, SDKAnimatedView, SDKAnimatedValue, createFadeAnimation, createSlideAnimation } from '../../adapters';
import type { SchemaComponentProps } from '../../types';
import type {
  ChartSeriesConfig,
  ChartAnnotation,
  ChartAxisConfig,
  ChartGaugeThreshold,
  SchemaNode,
  ActionConfig,
} from '../../types/schema.types';

// ---------------------------------------------------------------------------
// Constants & Palette
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16',
];

const COLOR_SCHEMES: Record<string, string[]> = {
  default:    CHART_COLORS,
  vibrant:    ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#06B6D4', '#84CC16'],
  pastel:     ['#B5D8F7', '#F7B5B5', '#B5F7D8', '#F7E5B5', '#D8B5F7', '#F7B5E5', '#B5F7F7', '#D8F7B5'],
  monochrome: ['#1E3A5F', '#2E5A8F', '#3E7ABF', '#6E9ACF', '#9EBADF', '#CEDAEF', '#4E6A9F', '#8EAACF'],
  warm:       ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#65A30D', '#16A34A', '#F59E0B', '#EF4444'],
  cool:       ['#0EA5E9', '#6366F1', '#8B5CF6', '#A855F7', '#06B6D4', '#14B8A6', '#3B82F6', '#818CF8'],
};

const MAX_DATA_POINTS = 50;
const DEFAULT_CHART_HEIGHT = 200;
const Y_AXIS_WIDTH = 50;
const TOOLTIP_DISMISS_MS = 3000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataPoint {
  label: string;
  value: number;
}

interface PointXY {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getChartColors(
  designTokens: { colors: Record<string, string | undefined> },
  chartColor?: string,
  chartColorScheme?: string,
): string[] {
  // If a named scheme is specified, use it
  if (chartColorScheme && COLOR_SCHEMES[chartColorScheme]) {
    const scheme = [...COLOR_SCHEMES[chartColorScheme]];
    // Override first color with chartColor if specified
    if (chartColor) scheme[0] = chartColor;
    return scheme;
  }
  const dt = designTokens.colors;
  const base = [
    chartColor ?? dt.primary ?? CHART_COLORS[0],
    dt.secondary ?? CHART_COLORS[1],
    dt.success ?? CHART_COLORS[2],
    dt.warning ?? CHART_COLORS[3],
    ...CHART_COLORS.slice(4),
  ];
  return base;
}

function getSeriesColor(
  seriesConfig: ChartSeriesConfig,
  index: number,
  palette: string[],
): string {
  return seriesConfig.color ?? palette[index % palette.length];
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function extractDataPoint(
  item: unknown,
  labelKey: string,
  valueKey: string,
  index: number,
): DataPoint {
  if (item == null || typeof item !== 'object') {
    return { label: `Item ${index + 1}`, value: typeof item === 'number' ? item : 0 };
  }
  const obj = item as Record<string, unknown>;
  const label = obj[labelKey] != null ? String(obj[labelKey]) : `Item ${index + 1}`;
  const rawValue = obj[valueKey];
  const value = typeof rawValue === 'number' ? rawValue : (typeof rawValue === 'string' ? parseFloat(rawValue) || 0 : 0);
  return { label, value };
}

interface MultiSeriesData {
  labels: string[];
  seriesData: number[][];
}

function extractMultiSeriesData(
  rawData: unknown[],
  labelKey: string,
  seriesConfigs: ChartSeriesConfig[],
): MultiSeriesData {
  const labels: string[] = [];
  const seriesData: number[][] = seriesConfigs.map(() => []);

  for (let i = 0; i < rawData.length; i++) {
    const item = rawData[i];
    if (item == null || typeof item !== 'object') {
      labels.push(`Item ${i + 1}`);
      for (let s = 0; s < seriesConfigs.length; s++) {
        seriesData[s].push(0);
      }
      continue;
    }
    const obj = item as Record<string, unknown>;
    labels.push(obj[labelKey] != null ? String(obj[labelKey]) : `Item ${i + 1}`);
    for (let s = 0; s < seriesConfigs.length; s++) {
      const rawValue = obj[seriesConfigs[s].key];
      const numValue = typeof rawValue === 'number'
        ? rawValue
        : (typeof rawValue === 'string' ? parseFloat(rawValue) || 0 : 0);
      seriesData[s].push(numValue);
    }
  }

  return { labels, seriesData };
}

// ---------------------------------------------------------------------------
// Y-axis & Grid helpers
// ---------------------------------------------------------------------------

function computeYAxisTicks(min: number, max: number, tickCount: number = 5): number[] {
  if (max <= min) {
    return [min];
  }
  const range = max - min;
  const rawStep = range / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let v = min; v <= niceMax; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

function renderYAxis(
  ticks: number[],
  unit: string,
  textColor: string,
  chartHeight: number,
): React.ReactElement {
  const maxTick = ticks[ticks.length - 1];
  const minTick = ticks[0];
  const range = maxTick - minTick;

  const labels = [...ticks].reverse().map((tick, index) => {
    const bottomPos = range > 0 ? ((tick - minTick) / range) * chartHeight : 0;
    const topPos = chartHeight - bottomPos - 7;

    return React.createElement(
      SDKText,
      {
        key: `y-label-${index}`,
        style: {
          position: 'absolute' as const,
          top: topPos,
          right: 4,
          fontSize: 10,
          color: textColor,
          textAlign: 'right' as const,
        },
      },
      `${tick.toFixed(1)} ${unit}`.trim(),
    );
  });

  return React.createElement(
    SDKView,
    {
      key: 'y-axis',
      testID: 'y-axis',
      style: {
        width: Y_AXIS_WIDTH,
        height: chartHeight,
        position: 'relative' as const,
      },
    },
    ...labels,
  );
}

function renderGridLines(
  ticks: number[],
  maxValue: number,
  chartHeight: number,
  gridColor: string,
): React.ReactElement[] {
  const minValue = ticks[0];
  const range = maxValue - minValue;
  if (range <= 0) return [];

  return ticks.map((tick, index) => {
    const bottomPos = ((tick - minValue) / range) * chartHeight;
    const topPos = chartHeight - bottomPos;
    return React.createElement(
      SDKView,
      {
        key: `grid-line-${index}`,
        testID: `grid-line-${index}`,
        style: {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          top: topPos,
          height: 1,
          backgroundColor: gridColor,
        },
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Bezier curve helpers (for smooth lines)
// ---------------------------------------------------------------------------

function computeBezierPoint(
  t: number,
  p0: PointXY, p1: PointXY, p2: PointXY, p3: PointXY,
): PointXY {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function getSmoothSegments(
  points: PointXY[],
  subdivisions: number = 8,
): PointXY[] {
  if (points.length < 2) return points;
  const smoothed: PointXY[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    // Catmull-Rom to Bezier control points
    const cp1: PointXY = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const cp2: PointXY = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };

    for (let s = 1; s <= subdivisions; s++) {
      const t = s / subdivisions;
      smoothed.push(computeBezierPoint(t, p1, cp1, cp2, p2));
    }
  }

  return smoothed;
}

// ---------------------------------------------------------------------------
// Line segment rendering (shared by line charts)
// ---------------------------------------------------------------------------

function renderLineSegments(
  points: PointXY[],
  color: string,
  keyPrefix: string,
  lineWidth: number = 2,
): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.5) continue;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    elements.push(
      React.createElement(
        SDKView,
        {
          key: `${keyPrefix}-seg-${i}`,
          testID: `${keyPrefix}-seg-${i}`,
          style: {
            position: 'absolute' as const,
            left: midX - length / 2,
            top: midY - lineWidth / 2,
            width: length,
            height: lineWidth,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
          },
        },
      ),
    );
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Area fill (column-based fill under line)
// ---------------------------------------------------------------------------

function renderAreaFill(
  points: PointXY[],
  chartHeight: number,
  color: string,
  keyPrefix: string,
): React.ReactElement[] {
  if (points.length < 2) return [];
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const left = Math.min(p1.x, p2.x);
    const width = Math.abs(p2.x - p1.x);
    const topY = Math.min(p1.y, p2.y);
    const fillHeight = chartHeight - topY;

    if (width > 0 && fillHeight > 0) {
      elements.push(
        React.createElement(
          SDKView,
          {
            key: `${keyPrefix}-area-${i}`,
            style: {
              position: 'absolute' as const,
              left,
              top: topY,
              width,
              height: fillHeight,
              backgroundColor: color,
              opacity: 0.12,
            },
          },
        ),
      );
    }
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Tooltip callout
// ---------------------------------------------------------------------------

function renderTooltip(
  x: number,
  y: number,
  label: string,
  value: string,
): React.ReactElement {
  return React.createElement(
    SDKView,
    {
      key: 'chart-tooltip',
      testID: 'chart-tooltip',
      style: {
        position: 'absolute' as const,
        left: x - 30,
        top: y - 38,
        backgroundColor: '#1F2937',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignItems: 'center' as const,
        zIndex: 100,
      },
    },
    React.createElement(
      SDKText,
      {
        key: 'tooltip-text',
        style: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
      },
      `${label}: ${value}`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function renderChartLegend(
  items: { label: string; color: string }[],
  textSecondaryColor: string,
): React.ReactElement {
  const legendItems = items.map((item, index) =>
    React.createElement(
      SDKView,
      {
        key: `legend-item-${index}`,
        style: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          marginRight: 14,
          marginTop: 8,
          backgroundColor: item.color + '14',
          borderRadius: 12,
          paddingHorizontal: 8,
          paddingVertical: 3,
        },
      },
      React.createElement(
        SDKView,
        {
          key: `legend-swatch-${index}`,
          testID: `legend-swatch-${index}`,
          style: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: item.color,
            marginRight: 5,
          },
        },
      ),
      React.createElement(
        SDKText,
        {
          key: `legend-label-${index}`,
          style: { fontSize: 12, color: textSecondaryColor },
        },
        item.label,
      ),
    ),
  );

  return React.createElement(
    SDKView,
    {
      key: 'chart-legend',
      testID: 'chart-legend',
      style: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        marginTop: 10,
      },
    },
    ...legendItems,
  );
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

function renderAnnotations(
  annotations: ChartAnnotation[],
  seriesData: number[][],
  _seriesConfigs: ChartSeriesConfig[],
  chartHeight: number,
  chartWidth: number,
  maxValue: number,
  minValue: number,
): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  const range = maxValue - minValue || 1;

  for (let a = 0; a < annotations.length; a++) {
    const ann = annotations[a];
    if (
      ann.seriesIndex < 0 ||
      ann.seriesIndex >= seriesData.length ||
      ann.dataIndex < 0 ||
      ann.dataIndex >= seriesData[ann.seriesIndex].length
    ) {
      continue;
    }

    const data = seriesData[ann.seriesIndex];
    const count = data.length;
    const value = data[ann.dataIndex];
    const x = count > 1 ? ann.dataIndex * (chartWidth / (count - 1)) : chartWidth / 2;
    const y = chartHeight - ((value - minValue) / range) * chartHeight;

    elements.push(
      React.createElement(
        SDKView,
        {
          key: `annotation-${a}`,
          testID: `annotation-${a}`,
          style: {
            position: 'absolute' as const,
            left: x - 20,
            top: y - 24,
            backgroundColor: '#1F2937',
            borderRadius: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            alignItems: 'center' as const,
          },
        },
        React.createElement(
          SDKText,
          {
            key: `annotation-text-${a}`,
            style: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
          },
          ann.label,
        ),
      ),
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Multi-series line segments & dots
// ---------------------------------------------------------------------------

function renderMultiSeriesLines(
  seriesData: number[][],
  seriesConfigs: ChartSeriesConfig[],
  chartHeight: number,
  chartWidth: number,
  maxValue: number,
  minValue: number,
  palette: string[],
  smooth: boolean = false,
  fill: boolean = false,
  showValues: boolean = false,
  onPointPress?: (seriesIndex: number, dataIndex: number, label: string, value: number) => void,
): React.ReactElement[] {
  const elements: React.ReactElement[] = [];
  const range = maxValue - minValue || 1;

  for (let s = 0; s < seriesData.length; s++) {
    const data = seriesData[s];
    const color = getSeriesColor(seriesConfigs[s], s, palette);
    const count = data.length;

    const rawPoints: PointXY[] = data.map((value, i) => ({
      x: count > 1 ? i * (chartWidth / (count - 1)) : chartWidth / 2,
      y: chartHeight - ((value - minValue) / range) * chartHeight,
    }));

    const linePoints = smooth ? getSmoothSegments(rawPoints) : rawPoints;

    // Area fill
    if (fill) {
      elements.push(...renderAreaFill(linePoints, chartHeight, color, `ms-fill-${s}`));
    }

    // Line segments
    elements.push(...renderLineSegments(linePoints, color, `ms-line-${s}`));

    // Dots (hollow circles)
    for (let i = 0; i < rawPoints.length; i++) {
      const { x, y } = rawPoints[i];
      const dotSize = 10;
      const dot = React.createElement(
        SDKView,
        {
          key: `ms-dot-${s}-${i}`,
          testID: `ms-dot-${s}-${i}`,
          style: {
            position: 'absolute' as const,
            left: x - dotSize / 2,
            top: y - dotSize / 2,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: '#FFFFFF',
            borderWidth: 2,
            borderColor: color,
          },
        },
      );

      if (onPointPress) {
        const si = s;
        const di = i;
        const val = data[i];
        elements.push(
          React.createElement(
            SDKTouchableOpacity,
            {
              key: `ms-touch-${s}-${i}`,
              onPress: () => onPointPress(si, di, '', val),
              style: {
                position: 'absolute' as const,
                left: x - 12,
                top: y - 12,
                width: 24,
                height: 24,
                alignItems: 'center' as const,
                justifyContent: 'center' as const,
              },
            },
            dot,
          ),
        );
      } else {
        elements.push(dot);
      }

      // Value labels
      if (showValues) {
        elements.push(
          React.createElement(
            SDKText,
            {
              key: `ms-val-${s}-${i}`,
              style: {
                position: 'absolute' as const,
                left: x - 15,
                top: y - 18,
                fontSize: 9,
                fontWeight: '600',
                color,
                textAlign: 'center' as const,
                width: 30,
              },
            },
            data[i] % 1 === 0 ? String(data[i]) : data[i].toFixed(1),
          ),
        );
      }
    }
  }

  return elements;
}

// =========================================================================
// CHART RENDERERS
// =========================================================================

// ---------------------------------------------------------------------------
// Multi-Series Line Chart
// ---------------------------------------------------------------------------

function renderMultiSeriesLineChart(
  data: unknown[],
  node: SchemaNode,
  textColor: string,
  textSecondaryColor: string,
  gridColor: string,
  palette: string[],
  chartWidth: number,
  onPointPress?: (seriesIndex: number, dataIndex: number, label: string, value: number) => void,
): React.ReactElement[] {
  const chartHeight = (node.chartHeight as number) || DEFAULT_CHART_HEIGHT;
  const effectiveWidth = chartWidth > 0 ? chartWidth - Y_AXIS_WIDTH : 300;
  const labelKey = node.chartLabel ?? 'label';
  const seriesConfigs = node.chartSeries ?? [];
  const yAxisConfig: ChartAxisConfig = node.chartYAxis ?? {};
  const annotations = node.chartAnnotations ?? [];
  const showLegend = node.chartShowLegend !== false;
  const showGrid = node.chartShowGrid !== false;
  const smooth = node.chartSmooth === true;
  const fill = node.chartFill === true;
  const showValues = node.chartShowValues === true;

  const { labels, seriesData } = extractMultiSeriesData(data, labelKey, seriesConfigs);

  let dataMin = Infinity;
  let dataMax = -Infinity;
  for (let s = 0; s < seriesData.length; s++) {
    for (let i = 0; i < seriesData[s].length; i++) {
      const v = seriesData[s][i];
      if (v < dataMin) dataMin = v;
      if (v > dataMax) dataMax = v;
    }
  }
  if (!isFinite(dataMin)) dataMin = 0;
  if (!isFinite(dataMax)) dataMax = 1;

  const minValue = yAxisConfig.min ?? Math.min(dataMin, 0);
  const maxValue = yAxisConfig.max ?? dataMax;
  const tickCount = yAxisConfig.ticks ?? 5;
  const unit = yAxisConfig.unit ?? '';

  const ticks = computeYAxisTicks(minValue, maxValue, tickCount);
  const effectiveMax = ticks[ticks.length - 1];
  const effectiveMin = ticks[0];

  const elements: React.ReactElement[] = [];
  const chartAreaChildren: React.ReactElement[] = [];

  if (showGrid) {
    chartAreaChildren.push(...renderGridLines(ticks, effectiveMax, chartHeight, gridColor));
  }

  // Zero line for negative values
  if (effectiveMin < 0 && effectiveMax > 0) {
    const zeroY = chartHeight - ((0 - effectiveMin) / (effectiveMax - effectiveMin)) * chartHeight;
    chartAreaChildren.push(
      React.createElement(SDKView, {
        key: 'zero-line',
        style: {
          position: 'absolute' as const,
          left: 0, right: 0, top: zeroY, height: 1.5,
          backgroundColor: textColor, opacity: 0.3,
        },
      }),
    );
  }

  chartAreaChildren.push(
    ...renderMultiSeriesLines(
      seriesData, seriesConfigs, chartHeight, effectiveWidth,
      effectiveMax, effectiveMin, palette, smooth, fill, showValues,
      onPointPress,
    ),
  );

  if (annotations.length > 0) {
    chartAreaChildren.push(
      ...renderAnnotations(annotations, seriesData, seriesConfigs, chartHeight, effectiveWidth, effectiveMax, effectiveMin),
    );
  }

  const chartRow = React.createElement(
    SDKView,
    { key: 'ms-chart-row', style: { flexDirection: 'row' as const } },
    renderYAxis(ticks, unit, textColor, chartHeight),
    React.createElement(
      SDKView,
      {
        key: 'ms-chart-area',
        testID: 'ms-chart-area',
        style: {
          flex: 1,
          height: chartHeight,
          position: 'relative' as const,
        },
      },
      ...chartAreaChildren,
    ),
  );

  elements.push(chartRow);

  // X-axis labels
  elements.push(
    React.createElement(
      SDKView,
      {
        key: 'ms-x-labels',
        testID: 'ms-x-labels',
        style: {
          flexDirection: 'row' as const,
          justifyContent: 'space-between' as const,
          marginTop: 6,
          marginLeft: Y_AXIS_WIDTH,
        },
      },
      ...labels.map((lbl, index) =>
        React.createElement(
          SDKText,
          {
            key: `ms-xlabel-${index}`,
            style: { fontSize: 10, color: textSecondaryColor, textAlign: 'center' as const },
          },
          lbl,
        ),
      ),
    ),
  );

  if (showLegend) {
    elements.push(
      renderChartLegend(
        seriesConfigs.map((s, i) => ({ label: s.label, color: getSeriesColor(s, i, palette) })),
        textSecondaryColor,
      ),
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Bar Chart (horizontal + vertical)
// ---------------------------------------------------------------------------

function renderBarChart(
  data: DataPoint[],
  primaryColor: string,
  textColor: string,
  textSecondaryColor: string,
  palette: string[],
  orientation: 'horizontal' | 'vertical',
  chartHeight: number,
  chartWidth: number,
  showValues: boolean,
  onPointPress?: (index: number, label: string, value: number) => void,
): React.ReactElement[] {
  const maxValue = Math.max(...data.map(d => Math.abs(d.value)), 1);

  if (orientation === 'vertical') {
    return renderVerticalBarChart(data, textColor, textSecondaryColor, palette, chartHeight, chartWidth, maxValue, showValues, onPointPress);
  }

  // Horizontal bars (original)
  return data.map((point, index) => {
    const barColor = palette[index % palette.length] || primaryColor;
    const barFill = React.createElement(
      SDKView,
      {
        key: `bar-fill-${index}`,
        testID: `bar-fill-${index}`,
        style: {
          height: 20,
          borderTopRightRadius: 10,
          borderBottomRightRadius: 10,
          backgroundColor: barColor,
          flex: point.value / maxValue,
        },
      },
    );

    const barTrack = React.createElement(
      SDKView,
      {
        key: `bar-track-${index}`,
        style: {
          flex: 1,
          height: 20,
          backgroundColor: textSecondaryColor + '18',
          borderRadius: 10,
          overflow: 'hidden' as const,
          flexDirection: 'row' as const,
        },
      },
      barFill,
    );

    const rowContent = [
      React.createElement(
        SDKText,
        {
          key: `bar-label-${index}`,
          style: { width: 40, fontSize: 12, color: textSecondaryColor },
          numberOfLines: 1,
        },
        point.label,
      ),
      barTrack,
      React.createElement(
        SDKText,
        {
          key: `bar-value-${index}`,
          style: { width: 36, fontSize: 12, fontWeight: '600', color: textColor, textAlign: 'right' as const, marginLeft: 8 },
        },
        String(point.value),
      ),
    ];

    // Make the entire row tappable when onPointPress is provided
    const row = onPointPress
      ? React.createElement(
          SDKTouchableOpacity,
          {
            key: `bar-row-${index}`,
            onPress: () => onPointPress(index, point.label, point.value),
            style: {
              flexDirection: 'row' as const,
              alignItems: 'center' as const,
              marginBottom: 6,
              minHeight: 28,
            },
          },
          ...rowContent,
        )
      : React.createElement(
          SDKView,
          {
            key: `bar-row-${index}`,
            style: {
              flexDirection: 'row' as const,
              alignItems: 'center' as const,
              marginBottom: 6,
              minHeight: 28,
            },
          },
          ...rowContent,
        );

    return row;
  });
}

function renderVerticalBarChart(
  data: DataPoint[],
  textColor: string,
  textSecondaryColor: string,
  palette: string[],
  chartHeight: number,
  chartWidth: number,
  maxValue: number,
  showValues: boolean,
  onPointPress?: (index: number, label: string, value: number) => void,
): React.ReactElement[] {
  const barCount = data.length;
  const gap = Math.max(4, Math.min(12, chartWidth / barCount * 0.2));
  const barWidth = Math.max(8, (chartWidth - gap * (barCount + 1)) / barCount);

  const bars = data.map((point, index) => {
    const barHeight = Math.max(2, (Math.abs(point.value) / maxValue) * (chartHeight - 20));
    const barColor = palette[index % palette.length];

    const barView = React.createElement(
      SDKView,
      {
        key: `vbar-fill-${index}`,
        testID: `bar-fill-${index}`,
        style: {
          width: barWidth,
          height: barHeight,
          backgroundColor: barColor,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
        },
      },
    );

    const barContainer = React.createElement(
      SDKView,
      {
        key: `vbar-col-${index}`,
        style: {
          alignItems: 'center' as const,
          justifyContent: 'flex-end' as const,
          height: chartHeight,
          width: barWidth + gap,
        },
      },
      showValues
        ? React.createElement(
            SDKText,
            {
              key: `vbar-val-${index}`,
              style: { fontSize: 9, fontWeight: '600', color: textColor, marginBottom: 2 },
            },
            String(point.value),
          )
        : null,
      onPointPress
        ? React.createElement(
            SDKTouchableOpacity,
            {
              key: `vbar-touch-${index}`,
              onPress: () => onPointPress(index, point.label, point.value),
            },
            barView,
          )
        : barView,
    );

    return barContainer;
  });

  const xLabels = data.map((point, index) =>
    React.createElement(
      SDKText,
      {
        key: `vbar-xlabel-${index}`,
        style: {
          width: barWidth + gap,
          fontSize: 10,
          color: textSecondaryColor,
          textAlign: 'center' as const,
        },
        numberOfLines: 1,
      },
      point.label,
    ),
  );

  return [
    React.createElement(
      SDKView,
      {
        key: 'vbar-chart-area',
        style: {
          flexDirection: 'row' as const,
          alignItems: 'flex-end' as const,
          height: chartHeight,
          borderBottomWidth: 1,
          borderBottomColor: textSecondaryColor + '30',
        },
      },
      ...bars,
    ),
    React.createElement(
      SDKView,
      {
        key: 'vbar-x-labels',
        style: { flexDirection: 'row' as const, marginTop: 4 },
      },
      ...xLabels,
    ),
  ];
}

// ---------------------------------------------------------------------------
// Stacked Bar Chart
// ---------------------------------------------------------------------------

function renderStackedBarChart(
  data: unknown[],
  node: SchemaNode,
  textColor: string,
  textSecondaryColor: string,
  palette: string[],
  chartHeight: number,
  chartWidth: number,
  showValues: boolean,
): React.ReactElement[] {
  const labelKey = node.chartLabel ?? 'label';
  const seriesConfigs = node.chartSeries ?? [];
  const { labels, seriesData } = extractMultiSeriesData(data, labelKey, seriesConfigs);

  // Calculate stack totals
  const totals = labels.map((_, colIdx) =>
    seriesData.reduce((sum, series) => sum + Math.abs(series[colIdx] || 0), 0),
  );
  const maxTotal = Math.max(...totals, 1);

  const barCount = labels.length;
  const gap = Math.max(4, Math.min(12, chartWidth / barCount * 0.2));
  const barWidth = Math.max(12, (chartWidth - gap * (barCount + 1)) / barCount);

  const bars = labels.map((_label, colIdx) => {
    const segments = seriesConfigs.map((config, sIdx) => {
      const val = Math.abs(seriesData[sIdx][colIdx] || 0);
      const segHeight = Math.max(0, (val / maxTotal) * (chartHeight - 20));
      const color = getSeriesColor(config, sIdx, palette);
      return React.createElement(
        SDKView,
        {
          key: `stack-seg-${colIdx}-${sIdx}`,
          style: {
            width: barWidth,
            height: segHeight,
            backgroundColor: color,
          },
        },
      );
    }).reverse(); // stack bottom-to-top

    return React.createElement(
      SDKView,
      {
        key: `stack-col-${colIdx}`,
        style: {
          alignItems: 'center' as const,
          justifyContent: 'flex-end' as const,
          height: chartHeight,
          width: barWidth + gap,
        },
      },
      showValues
        ? React.createElement(
            SDKText,
            {
              key: `stack-val-${colIdx}`,
              style: { fontSize: 9, fontWeight: '600', color: textColor, marginBottom: 2 },
            },
            totals[colIdx] % 1 === 0 ? String(totals[colIdx]) : totals[colIdx].toFixed(1),
          )
        : null,
      React.createElement(
        SDKView,
        {
          key: `stack-bar-${colIdx}`,
          style: {
            width: barWidth,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            overflow: 'hidden' as const,
          },
        },
        ...segments,
      ),
    );
  });

  const xLabels = labels.map((label, index) =>
    React.createElement(
      SDKText,
      {
        key: `stack-xlabel-${index}`,
        style: {
          width: barWidth + gap,
          fontSize: 10,
          color: textSecondaryColor,
          textAlign: 'center' as const,
        },
        numberOfLines: 1,
      },
      label,
    ),
  );

  const elements: React.ReactElement[] = [
    React.createElement(
      SDKView,
      {
        key: 'stack-chart-area',
        style: {
          flexDirection: 'row' as const,
          alignItems: 'flex-end' as const,
          height: chartHeight,
          borderBottomWidth: 1,
          borderBottomColor: textSecondaryColor + '30',
        },
      },
      ...bars,
    ),
    React.createElement(
      SDKView,
      { key: 'stack-x-labels', style: { flexDirection: 'row' as const, marginTop: 4 } },
      ...xLabels,
    ),
  ];

  if (node.chartShowLegend !== false) {
    elements.push(
      renderChartLegend(
        seriesConfigs.map((s, i) => ({ label: s.label, color: getSeriesColor(s, i, palette) })),
        textSecondaryColor,
      ),
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Single-series Line Chart
// ---------------------------------------------------------------------------

function renderLineChart(
  data: DataPoint[],
  primaryColor: string,
  textSecondaryColor: string,
  chartHeight: number,
  chartWidth: number,
  smooth: boolean,
  fill: boolean,
  showValues: boolean,
  onPointPress?: (index: number, label: string, value: number) => void,
): React.ReactElement[] {
  const maxValue = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;
  const count = data.length;
  const elements: React.ReactElement[] = [];

  const rawPoints: PointXY[] = data.map((point, index) => ({
    x: count > 1 ? index * (chartWidth / (count - 1)) : chartWidth / 2,
    y: chartHeight - ((point.value - minValue) / range) * chartHeight,
  }));

  const linePoints = smooth ? getSmoothSegments(rawPoints) : rawPoints;

  // Area fill
  if (fill) {
    elements.push(...renderAreaFill(linePoints, chartHeight, primaryColor, 'line-fill'));
  }

  // Line segments
  elements.push(...renderLineSegments(linePoints, primaryColor, 'line-segment'));

  // Dots
  for (let i = 0; i < rawPoints.length; i++) {
    const { x, y } = rawPoints[i];
    const dot = React.createElement(
      SDKView,
      {
        key: `line-dot-${i}`,
        testID: `line-dot-${i}`,
        style: {
          position: 'absolute' as const,
          left: x - 5,
          top: y - 5,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: primaryColor,
        },
      },
    );

    if (onPointPress) {
      const idx = i;
      elements.push(
        React.createElement(
          SDKTouchableOpacity,
          {
            key: `line-touch-${i}`,
            onPress: () => onPointPress(idx, data[idx].label, data[idx].value),
            style: {
              position: 'absolute' as const,
              left: x - 12,
              top: y - 12,
              width: 24,
              height: 24,
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
            },
          },
          dot,
        ),
      );
    } else {
      elements.push(dot);
    }

    if (showValues) {
      elements.push(
        React.createElement(
          SDKText,
          {
            key: `line-val-${i}`,
            style: {
              position: 'absolute' as const,
              left: x - 15,
              top: y - 18,
              fontSize: 9,
              fontWeight: '600',
              color: primaryColor,
              textAlign: 'center' as const,
              width: 30,
            },
          },
          data[i].value % 1 === 0 ? String(data[i].value) : data[i].value.toFixed(1),
        ),
      );
    }
  }

  // X-axis labels
  const labelRow = React.createElement(
    SDKView,
    {
      key: 'line-labels',
      style: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginTop: 6 },
    },
    ...data.map((point, index) =>
      React.createElement(
        SDKText,
        {
          key: `line-xlabel-${index}`,
          style: { fontSize: 10, color: textSecondaryColor, textAlign: 'center' as const },
        },
        point.label,
      ),
    ),
  );

  return [
    React.createElement(
      SDKView,
      {
        key: 'line-chart-area',
        style: { height: chartHeight, position: 'relative' as const },
      },
      ...elements,
    ),
    labelRow,
  ];
}

// ---------------------------------------------------------------------------
// Pie / Donut Chart (real circular)
// ---------------------------------------------------------------------------

function renderPieChart(
  data: DataPoint[],
  _textColor: string,
  textSecondaryColor: string,
  palette: string[],
  isDonut: boolean,
  showLegend: boolean,
  chartHeight: number,
  onPointPress?: (index: number, label: string, value: number) => void,
): React.ReactElement[] {
  const totalValue = data.reduce((sum, d) => sum + Math.abs(d.value), 0);
  if (totalValue === 0) return [];
  const elements: React.ReactElement[] = [];
  const diameter = Math.min(chartHeight, 200);
  const radius = diameter / 2;

  // Build segments using half-circle clipping technique
  let cumulativeAngle = 0;
  const segmentViews: React.ReactElement[] = [];

  for (let i = 0; i < data.length; i++) {
    const fraction = Math.abs(data[i].value) / totalValue;
    const segmentAngle = fraction * 360;
    const color = palette[i % palette.length];

    const overlapAngle = segmentAngle;

    if (segmentAngle <= 180) {
      // Single half-circle segment
      segmentViews.push(
        React.createElement(SDKView, {
          key: `pie-segment-${i}`,
          testID: `pie-segment-${i}`,
          style: {
            position: 'absolute' as const,
            width: diameter,
            height: diameter,
            borderRadius: radius,
            overflow: 'hidden' as const,
            transform: [{ rotate: `${cumulativeAngle}deg` }],
          },
        },
          React.createElement(SDKView, {
            key: `pie-half-${i}`,
            style: {
              position: 'absolute' as const,
              width: diameter / 2,
              height: diameter,
              left: 0,
              backgroundColor: color,
              borderTopLeftRadius: radius,
              borderBottomLeftRadius: radius,
              transform: [{ rotate: `${overlapAngle}deg` }],
              transformOrigin: 'right center',
            },
          }),
        ),
      );
    } else {
      // Two halves for segments >180 degrees
      segmentViews.push(
        React.createElement(SDKView, {
          key: `pie-segment-${i}`,
          testID: `pie-segment-${i}`,
          style: {
            position: 'absolute' as const,
            width: diameter,
            height: diameter,
            borderRadius: radius,
            overflow: 'hidden' as const,
            transform: [{ rotate: `${cumulativeAngle}deg` }],
          },
        },
          // First 180 degrees
          React.createElement(SDKView, {
            key: `pie-half-a-${i}`,
            style: {
              position: 'absolute' as const,
              width: diameter / 2,
              height: diameter,
              left: 0,
              backgroundColor: color,
              borderTopLeftRadius: radius,
              borderBottomLeftRadius: radius,
              transform: [{ rotate: '180deg' }],
              transformOrigin: 'right center',
            },
          }),
          // Remaining degrees (with overlap)
          React.createElement(SDKView, {
            key: `pie-half-b-${i}`,
            style: {
              position: 'absolute' as const,
              width: diameter / 2,
              height: diameter,
              left: 0,
              backgroundColor: color,
              borderTopLeftRadius: radius,
              borderBottomLeftRadius: radius,
              transform: [{ rotate: `${overlapAngle}deg` }],
              transformOrigin: 'right center',
            },
          }),
        ),
      );
    }

    cumulativeAngle += segmentAngle;
  }

  // White separator lines between segments (deliberate gaps, like Apple Screen Time)
  let separatorAngle = 0;
  const separatorViews: React.ReactElement[] = [];
  for (let i = 0; i < data.length; i++) {
    separatorAngle += (Math.abs(data[i].value) / totalValue) * 360;
    separatorViews.push(
      React.createElement(SDKView, {
        key: `pie-sep-${i}`,
        style: {
          position: 'absolute' as const,
          width: 2.5,
          height: diameter / 2,
          backgroundColor: '#FFFFFF',
          left: diameter / 2 - 1.25,
          top: 0,
          transformOrigin: 'center bottom',
          transform: [{ rotate: `${separatorAngle}deg` }],
        },
      }),
    );
  }

  // Pie/donut circle container
  const circleChildren: React.ReactElement[] = [...segmentViews, ...separatorViews];

  // Outer border ring
  circleChildren.push(
    React.createElement(SDKView, {
      key: 'pie-border',
      style: {
        position: 'absolute' as const,
        width: diameter,
        height: diameter,
        borderRadius: radius,
        borderWidth: 2,
        borderColor: '#FFFFFF',
      },
    }),
  );

  // Donut hole
  if (isDonut) {
    const holeSize = diameter * 0.62;
    // Show largest segment percentage + label in donut center
    const largestIdx = data.reduce((maxI, d, idx, arr) =>
      Math.abs(d.value) > Math.abs(arr[maxI].value) ? idx : maxI, 0);
    const largestPct = Math.round((Math.abs(data[largestIdx].value) / totalValue) * 100);
    circleChildren.push(
      React.createElement(SDKView, {
        key: 'donut-hole',
        style: {
          position: 'absolute' as const,
          width: holeSize,
          height: holeSize,
          borderRadius: holeSize / 2,
          backgroundColor: '#FFFFFF',
          left: (diameter - holeSize) / 2,
          top: (diameter - holeSize) / 2,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 3,
          elevation: 2,
        },
      },
        React.createElement(SDKText, {
          key: 'donut-total',
          style: { fontSize: 20, fontWeight: '700', color: _textColor },
        }, `${largestPct}%`),
        React.createElement(SDKText, {
          key: 'donut-sublabel',
          numberOfLines: 1,
          style: { fontSize: 11, color: textSecondaryColor, marginTop: 2 },
        }, data[largestIdx].label),
      ),
    );
  }

  elements.push(
    React.createElement(SDKView, {
      key: 'pie-container',
      style: {
        width: diameter,
        height: diameter,
        borderRadius: radius,
        overflow: 'hidden' as const,
        position: 'relative' as const,
        alignSelf: 'center' as const,
        backgroundColor: '#FFFFFF',
      },
    }, ...circleChildren),
  );

  // Legend with percentages
  if (showLegend) {
    const legendItems = data.map((point, index) => {
      const percentage = totalValue > 0 ? Math.round((Math.abs(point.value) / totalValue) * 100) : 0;
      const color = palette[index % palette.length];

      const legendItem = React.createElement(
        SDKView,
        {
          key: `pie-legend-${index}`,
          style: {
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            marginRight: 12,
            marginTop: 8,
          },
        },
        React.createElement(SDKView, {
          key: `pie-swatch-${index}`,
          style: {
            width: 12,
            height: 12,
            borderRadius: 3,
            backgroundColor: color,
            marginRight: 6,
          },
        }),
        React.createElement(SDKText, {
          key: `pie-legend-text-${index}`,
          style: { fontSize: 12, color: textSecondaryColor },
        }, `${point.label} (${percentage}%)`),
      );

      if (onPointPress) {
        return React.createElement(
          SDKTouchableOpacity,
          { key: `pie-touch-${index}`, onPress: () => onPointPress(index, point.label, point.value) },
          legendItem,
        );
      }
      return legendItem;
    });

    elements.push(
      React.createElement(SDKView, {
        key: 'pie-legend',
        style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, marginTop: 12, justifyContent: 'center' as const },
      }, ...legendItems),
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Gauge Chart
// ---------------------------------------------------------------------------

function renderGaugeChart(
  node: SchemaNode,
  textColor: string,
  textSecondaryColor: string,
  palette: string[],
  chartHeight: number,
): React.ReactElement[] {
  const gaugeValue = typeof node.gaugeValue === 'number' ? node.gaugeValue : parseFloat(String(node.gaugeValue ?? '0')) || 0;
  const gaugeMax = typeof node.gaugeMax === 'number' ? node.gaugeMax : parseFloat(String(node.gaugeMax ?? '100')) || 100;
  const unit = node.gaugeUnit ?? '';
  const thresholds: ChartGaugeThreshold[] = node.gaugeThresholds ?? [
    { value: 60, color: palette[2] || '#10B981' },
    { value: 80, color: palette[3] || '#F59E0B' },
    { value: 100, color: palette[1] || '#EF4444' },
  ];

  const fraction = Math.min(Math.max(gaugeValue / gaugeMax, 0), 1);
  const percentage = Math.round(fraction * 100);

  // Determine color from thresholds
  let gaugeColor = thresholds[0]?.color ?? palette[0];
  for (const t of thresholds) {
    if (percentage <= t.value) {
      gaugeColor = t.color;
      break;
    }
    gaugeColor = t.color;
  }

  const diameter = Math.min(chartHeight, 150);
  const radius = diameter / 2;
  const strokeWidth = Math.max(diameter * 0.08, 6);

  // 270° ring gauge using overlapping capsule segments for a smooth arc
  const totalAngle = 270;
  const startAngle = 135; // gap at bottom-left
  const segmentCount = 90; // high count for smooth appearance
  const segmentAngle = totalAngle / segmentCount;
  const filledSegments = Math.round(fraction * segmentCount);

  // Build capsule segments positioned via trigonometry
  const segments: React.ReactElement[] = [];
  const trackRadius = radius - strokeWidth * 1.5;
  // Each segment is a small rotated capsule that overlaps its neighbor
  const capsuleLength = (2 * Math.PI * trackRadius * segmentAngle) / 360 + 2; // slight overlap
  for (let i = 0; i < segmentCount; i++) {
    const angle = startAngle + i * segmentAngle;
    const rad = (angle * Math.PI) / 180;
    const cx = radius + trackRadius * Math.cos(rad);
    const cy = radius + trackRadius * Math.sin(rad);
    const isFilled = i < filledSegments;

    segments.push(
      React.createElement(SDKView, {
        key: `seg-${i}`,
        style: {
          position: 'absolute' as const,
          left: cx - capsuleLength / 2,
          top: cy - strokeWidth / 2,
          width: capsuleLength,
          height: strokeWidth,
          borderRadius: strokeWidth / 2,
          backgroundColor: isFilled ? gaugeColor : (textSecondaryColor + '20'),
          transform: [{ rotate: `${angle}deg` }],
        },
      }),
    );
  }

  const elements: React.ReactElement[] = [];

  // Ring container with dots + center text
  elements.push(
    React.createElement(SDKView, {
      key: 'gauge-container',
      testID: 'gauge-container',
      style: {
        width: diameter,
        height: diameter,
        alignSelf: 'center' as const,
        position: 'relative' as const,
      },
    },
      ...segments,
      // Center value overlay
      React.createElement(SDKView, {
        key: 'gauge-center',
        style: {
          position: 'absolute' as const,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
        },
      },
        React.createElement(SDKText, {
          key: 'gauge-value',
          style: { fontSize: Math.round(diameter * 0.18), fontWeight: '700', color: textColor },
        }, gaugeValue % 1 === 0 ? String(gaugeValue) : gaugeValue.toFixed(1)),
        React.createElement(SDKText, {
          key: 'gauge-label',
          style: { fontSize: Math.round(diameter * 0.07), color: textSecondaryColor, marginTop: 2 },
        }, `of ${gaugeMax} ${unit}`.trim()),
      ),
    ),
  );

  // Percentage badge below
  elements.push(
    React.createElement(SDKView, {
      key: 'gauge-badge',
      style: {
        alignSelf: 'center' as const,
        backgroundColor: gaugeColor + '18',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginTop: 8,
      },
    },
      React.createElement(SDKText, {
        key: 'gauge-pct',
        style: { fontSize: 13, fontWeight: '600', color: gaugeColor },
      }, `${percentage}% used`),
    ),
  );

  return elements;
}

// =========================================================================
// Main ChartComponent
// =========================================================================

export const ChartComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const chartType = node.chartType ?? 'bar';
  const rawChartData = node.chartData;
  const chartLabelKey = node.chartLabel ?? 'label';
  const chartValueKey = node.chartValue ?? 'value';

  const designTokens = context.designTokens;
  const palette = getChartColors(
    designTokens,
    node.chartColor as string | undefined,
    node.chartColorScheme as string | undefined,
  );
  const primaryColor = (node.chartColor as string) ?? designTokens.colors.primary;
  const borderColor = designTokens.colors.border ?? '#E5E7EB';
  const textColor = designTokens.colors.text ?? '#111827';
  const textSecondaryColor = designTokens.colors.textSecondary ?? '#6B7280';
  const gridColor = designTokens.colors.border ?? '#F3F4F6';

  const configuredHeight = (node.chartHeight as number) || DEFAULT_CHART_HEIGHT;
  const orientation = (node.chartOrientation as 'horizontal' | 'vertical') ?? 'horizontal';
  const smooth = node.chartSmooth === true;
  const fill = node.chartFill === true;
  const showValues = node.chartShowValues === true;
  const isStacked = node.chartStacked === true;

  // Responsive width via onLayout
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const onLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setMeasuredWidth(e.nativeEvent.layout.width);
  }, []);

  // Entrance animation (configurable via node props)
  const entranceType = (node.entranceAnimation as string) ?? 'fade';
  const animDuration = (node.animationDuration as number) ?? 400;
  const animDelay = (node.animationDelay as number) ?? 0;
  const fadeAnim = useRef(new SDKAnimatedValue(entranceType === 'none' ? 1 : 0)).current;
  const slideAnim = useRef(new SDKAnimatedValue(entranceType === 'slide-up' ? 20 : 0)).current;
  const scaleAnim = useRef(new SDKAnimatedValue(entranceType === 'scale' ? 0.85 : 1)).current;
  useEffect(() => {
    if (entranceType === 'none') return;
    const delay = animDelay > 0 ? animDelay : 0;
    const run = () => {
      const animations = [
        createFadeAnimation({ value: fadeAnim, toValue: 1, duration: animDuration }),
      ];
      if (entranceType === 'slide-up') {
        animations.push(createSlideAnimation({ value: slideAnim, toValue: 0, duration: animDuration }));
      }
      if (entranceType === 'scale') {
        animations.push(createSlideAnimation({ value: scaleAnim, toValue: 1, duration: animDuration }));
      }
      animations.forEach((a) => a.start());
    };
    if (delay > 0) {
      const timer = setTimeout(run, delay);
      return () => clearTimeout(timer);
    }
    run();
    return undefined;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tooltip state for clickable data points
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; label: string; value: string } | null>(null);

  const onChartAction = node.onChartPress as ActionConfig | ActionConfig[] | undefined;

  const handlePointPress = useCallback(
    (indexOrSeries: number, dataIndexOrLabel: number | string, labelOrValue?: string | number, value?: number) => {
      // Normalize arguments for both single-series and multi-series
      let payload: Record<string, unknown>;
      if (typeof dataIndexOrLabel === 'string') {
        // Single-series: (index, label, value)
        payload = { index: indexOrSeries, label: dataIndexOrLabel, value: labelOrValue };
      } else {
        // Multi-series: (seriesIndex, dataIndex, label, value)
        payload = { seriesIndex: indexOrSeries, index: dataIndexOrLabel, label: labelOrValue, value };
      }

      if (onChartAction) {
        // Support both single action and array of actions for onChartPress
        const actions = Array.isArray(onChartAction) ? onChartAction : [onChartAction];
        for (const action of actions) {
          context.onAction({ ...action, payload: payload as Record<string, unknown> });
        }
      }

      // Show tooltip (auto-dismiss)
      const lbl = String(payload.label || '');
      const val = String(payload.value ?? '');
      setTooltipInfo({ x: 100, y: 40, label: lbl, value: val });
      setTimeout(() => setTooltipInfo(null), TOOLTIP_DISMISS_MS);
    },
    [onChartAction, context],
  );

  const pointPressHandler = onChartAction ? handlePointPress : undefined;

  // Build early-return transform array for animations
  const earlyTransforms: unknown[] = [];
  if (entranceType === 'slide-up') earlyTransforms.push({ translateY: slideAnim });
  if (entranceType === 'scale') earlyTransforms.push({ scale: scaleAnim });

  // Gauge chart doesn't need array data
  if (chartType === 'gauge') {
    const chartTitleText = node.chartTitle ?? 'Gauge';
    const gaugeStyle: Record<string, unknown> = {
      borderWidth: 1,
      borderColor,
      borderRadius: designTokens.borderRadius.default,
      padding: 8,
      overflow: 'hidden' as const,
      ...(node.style ?? {}),
      opacity: fadeAnim,
    };
    if (earlyTransforms.length > 0) gaugeStyle.transform = earlyTransforms;
    return React.createElement(
      SDKAnimatedView,
      {
        style: gaugeStyle,
        accessibilityRole: 'summary' as const,
        accessibilityLabel: `gauge chart showing ${node.gaugeValue} of ${node.gaugeMax} ${node.gaugeUnit ?? ''}`,
      },
      React.createElement(
        SDKText,
        {
          style: { fontSize: 14, fontWeight: '700', color: textColor, marginBottom: 4, textAlign: 'center' as const },
        },
        chartTitleText,
      ),
      ...renderGaugeChart(node, textColor, textSecondaryColor, palette, configuredHeight),
    );
  }

  // Loading state: data not yet available.
  // When the API is still fetching, the expression "$data.monthly" stays as an
  // unresolved string (SchemaInterpreter only replaces it when the result is an array).
  // So check for: undefined, null, or a string that looks like an expression.
  const isDataLoading = rawChartData === undefined
    || rawChartData === null
    || (typeof rawChartData === 'string' && rawChartData.startsWith('$'));
  if (isDataLoading) {
    const skelColor = textSecondaryColor + '15';
    const skelColorDark = textSecondaryColor + '22';
    const contentHeight = (configuredHeight || 200) - 80;
    const loadingStyle: Record<string, unknown> = {
      borderWidth: 1,
      borderColor,
      borderRadius: designTokens.borderRadius.default,
      padding: 24,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: configuredHeight || 200,
      ...(node.style ?? {}),
    };

    let skeletonContent: React.ReactElement;

    if (chartType === 'bar') {
      const isHorizontal = (node.chartOrientation ?? 'horizontal') === 'horizontal';
      const bars: React.ReactElement[] = [];
      for (let i = 0; i < 6; i++) {
        const size = 30 + ((i * 37) % 80);
        bars.push(React.createElement(SDKView, { key: `sb-${i}`, style: isHorizontal ? {
          width: `${20 + ((i * 23) % 60)}%`, height: 14, backgroundColor: i % 2 === 0 ? skelColor : skelColorDark,
          borderRadius: 4, marginVertical: 3,
        } : {
          flex: 1, height: size, backgroundColor: i % 2 === 0 ? skelColor : skelColorDark,
          borderRadius: 4, marginHorizontal: 3,
        }}));
      }
      skeletonContent = React.createElement(SDKView, {
        style: isHorizontal
          ? { flexDirection: 'column' as const, justifyContent: 'center' as const, height: contentHeight, width: '100%', paddingHorizontal: 8 }
          : { flexDirection: 'row' as const, alignItems: 'flex-end' as const, height: contentHeight, width: '100%', paddingHorizontal: 8 },
      }, ...bars);

    } else if (chartType === 'line') {
      // Line skeleton: horizontal lines suggesting a grid + a wavy path
      const lines: React.ReactElement[] = [];
      for (let i = 0; i < 4; i++) {
        lines.push(React.createElement(SDKView, { key: `sl-${i}`, style: {
          width: '100%', height: 1, backgroundColor: skelColor, marginBottom: contentHeight / 4 - 1,
        }}));
      }
      // Dots suggesting data points along a curve
      const dots: React.ReactElement[] = [];
      const dotPositions = [0.7, 0.4, 0.55, 0.3, 0.5, 0.25];
      for (let i = 0; i < dotPositions.length; i++) {
        dots.push(React.createElement(SDKView, { key: `sd-${i}`, style: {
          position: 'absolute' as const,
          left: `${10 + i * 16}%`,
          top: `${dotPositions[i] * 100}%`,
          width: 8, height: 8, borderRadius: 4, backgroundColor: skelColorDark,
        }}));
      }
      skeletonContent = React.createElement(SDKView, {
        style: { height: contentHeight, width: '100%', position: 'relative' as const },
      }, ...lines, ...dots);

    } else if (chartType === 'pie' || chartType === 'donut') {
      // Pie/donut skeleton: concentric circles
      const size = Math.min(contentHeight, 120);
      const innerSize = chartType === 'donut' ? size * 0.55 : 0;
      skeletonContent = React.createElement(SDKView, {
        style: { width: size, height: size, borderRadius: size / 2, backgroundColor: skelColor, alignItems: 'center' as const, justifyContent: 'center' as const },
      },
        // Segment dividers
        React.createElement(SDKView, { style: { position: 'absolute' as const, width: 2, height: size / 2, backgroundColor: borderColor, top: 0, left: size / 2 - 1 } }),
        React.createElement(SDKView, { style: { position: 'absolute' as const, width: size / 2, height: 2, backgroundColor: borderColor, top: size / 2 - 1, left: 0 } }),
        // Inner hole for donut
        innerSize > 0 ? React.createElement(SDKView, { style: {
          width: innerSize, height: innerSize, borderRadius: innerSize / 2,
          backgroundColor: designTokens.colors.background ?? '#FFFFFF',
        }}) : null,
      );

    } else {
      // Generic fallback: pulsing placeholder block
      skeletonContent = React.createElement(SDKView, {
        style: { width: '80%', height: contentHeight * 0.6, backgroundColor: skelColor, borderRadius: 8 },
      });
    }

    return React.createElement(SDKView, { style: loadingStyle },
      node.chartTitle ? React.createElement(SDKText, {
        style: { fontSize: 14, fontWeight: '700', color: textColor, marginBottom: 12, textAlign: 'center' as const },
      }, typeof node.chartTitle === 'string' && node.chartTitle.startsWith('$') ? '' : node.chartTitle) : null,
      skeletonContent,
      React.createElement(SDKText, {
        style: { fontSize: 12, color: textSecondaryColor, marginTop: 12, opacity: 0.6 },
      }, 'Loading...'),
    );
  }

  // Guard: loaded but empty or non-array data
  if (!Array.isArray(rawChartData) || rawChartData.length === 0) {
    const emptyStyle: Record<string, unknown> = {
      borderWidth: 1,
      borderColor,
      borderRadius: designTokens.borderRadius.default,
      padding: 24,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 200,
      ...(node.style ?? {}),
      opacity: fadeAnim,
    };
    if (earlyTransforms.length > 0) emptyStyle.transform = earlyTransforms;
    return React.createElement(
      SDKAnimatedView,
      {
        style: emptyStyle,
        accessibilityRole: 'summary' as const,
        accessibilityLabel: `${chartType} chart with no data`,
      },
      React.createElement(
        SDKView,
        { style: { alignItems: 'center' as const } },
        React.createElement(SDKText, {
          style: { fontSize: 32, marginBottom: 8, opacity: 0.3 },
        }, '\u2014'),
        React.createElement(SDKText, {
          style: { fontSize: 14, color: textSecondaryColor },
        }, 'No data'),
      ),
    );
  }

  // Cap at MAX_DATA_POINTS
  const cappedData = rawChartData.slice(0, MAX_DATA_POINTS);
  const dataPoints: DataPoint[] = cappedData.map((item, index) =>
    extractDataPoint(item, chartLabelKey, chartValueKey, index),
  );

  const isMultiSeries = (chartType === 'line' || (chartType === 'bar' && isStacked))
    && Array.isArray(node.chartSeries) && node.chartSeries.length > 0;

  const effectiveChartWidth = measuredWidth > 0 ? measuredWidth - 32 : 300; // 32 = padding*2

  let chartContent: React.ReactElement[];

  switch (chartType) {
    case 'line':
      if (isMultiSeries) {
        chartContent = renderMultiSeriesLineChart(
          cappedData, node, textColor, textSecondaryColor, gridColor, palette,
          effectiveChartWidth,
          pointPressHandler as ((si: number, di: number, l: string, v: number) => void) | undefined,
        );
      } else {
        chartContent = renderLineChart(
          dataPoints, primaryColor, textSecondaryColor,
          configuredHeight, effectiveChartWidth - (isMultiSeries ? Y_AXIS_WIDTH : 0),
          smooth, fill, showValues,
          pointPressHandler as ((i: number, l: string, v: number) => void) | undefined,
        );
      }
      break;
    case 'pie':
    case 'donut':
      chartContent = renderPieChart(
        dataPoints, textColor, textSecondaryColor, palette,
        chartType === 'donut', node.chartShowLegend !== false,
        configuredHeight,
        pointPressHandler as ((i: number, l: string, v: number) => void) | undefined,
      );
      break;
    case 'bar':
      if (isStacked && isMultiSeries) {
        chartContent = renderStackedBarChart(
          cappedData, node, textColor, textSecondaryColor, palette,
          configuredHeight, effectiveChartWidth, showValues,
        );
      } else {
        chartContent = renderBarChart(
          dataPoints, primaryColor, textColor, textSecondaryColor, palette,
          orientation, configuredHeight, effectiveChartWidth, showValues,
          pointPressHandler as ((i: number, l: string, v: number) => void) | undefined,
        );
      }
      break;
    default:
      chartContent = renderBarChart(
        dataPoints, primaryColor, textColor, textSecondaryColor, palette,
        orientation, configuredHeight, effectiveChartWidth, showValues,
        pointPressHandler as ((i: number, l: string, v: number) => void) | undefined,
      );
      break;
  }

  const containerStyle: Record<string, unknown> = {
    minHeight: 200,
    ...(node.style ?? {}),
  };

  // Build animated style with opacity + optional transform
  const animatedStyle: Record<string, unknown> = { ...containerStyle, opacity: fadeAnim };
  const transforms: unknown[] = [];
  if (entranceType === 'slide-up') transforms.push({ translateY: slideAnim });
  if (entranceType === 'scale') transforms.push({ scale: scaleAnim });
  if (transforms.length > 0) animatedStyle.transform = transforms;

  const accessibilityLabel = isMultiSeries
    ? `${chartType} chart with ${node.chartSeries!.length} series and ${dataPoints.length} data points`
    : `${chartType} chart with ${dataPoints.length} data points`;

  const chartTitleText = node.chartTitle;

  return React.createElement(
    SDKAnimatedView,
    {
      style: animatedStyle,
      accessibilityRole: 'summary' as const,
      accessibilityLabel,
      onLayout,
    },
    // Title (only if explicitly set via schema)
    chartTitleText
      ? React.createElement(
          SDKText,
          {
            style: {
              fontSize: 16,
              fontWeight: '700',
              color: textColor,
              marginBottom: 12,
            },
          },
          chartTitleText,
        )
      : null,
    // Chart content
    ...chartContent,
    // Tooltip overlay
    tooltipInfo
      ? renderTooltip(tooltipInfo.x, tooltipInfo.y, tooltipInfo.label, tooltipInfo.value)
      : null,
  );
};

ChartComponent.displayName = 'ChartComponent';
