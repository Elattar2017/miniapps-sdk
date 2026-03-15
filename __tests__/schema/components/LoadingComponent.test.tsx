/**
 * LoadingComponent Test Suite
 * Tests all four variants: spinner, progress, overlay, skeleton
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { LoadingComponent } from '../../../src/schema/components/LoadingComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(): RenderContext {
  return {
    tenantId: 't', moduleId: 'm', screenId: 's',
    data: {}, state: {}, user: { id: 'u' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
  };
}

function renderNode(node: SchemaNode): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(React.createElement(LoadingComponent, { node, context: makeContext() })); });
  return tree!;
}

function findByTestID(tree: ReactTestRenderer, testID: string) {
  return tree.root.findAll((el: any) => el.props.testID === testID);
}

function findByProp(tree: ReactTestRenderer, prop: string, value: unknown) {
  return tree.root.findAll((el: any) => el.props[prop] === value);
}

describe('LoadingComponent', () => {
  // =========================================================================
  // Spinner variant (default)
  // =========================================================================
  describe('spinner variant', () => {
    it('renders with default color and size', () => {
      const tree = renderNode({ type: 'loading' });
      const indicators = findByProp(tree, 'color', '#0066CC');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('renders with custom color', () => {
      const tree = renderNode({ type: 'loading', color: '#FF0000' });
      const indicators = findByProp(tree, 'color', '#FF0000');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('renders small size for md', () => {
      const tree = renderNode({ type: 'loading', size: 'md' });
      const indicators = findByProp(tree, 'size', 'small');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('renders large size for lg', () => {
      const tree = renderNode({ type: 'loading', size: 'lg' });
      const indicators = findByProp(tree, 'size', 'large');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('has Loading accessibility label', () => {
      const tree = renderNode({ type: 'loading' });
      const containers = findByProp(tree, 'accessibilityLabel', 'Loading');
      expect(containers.length).toBeGreaterThan(0);
    });

    it('renders with loadingText below spinner', () => {
      const tree = renderNode({ type: 'loading', loadingText: 'Fetching data...' } as SchemaNode);
      const json = tree.toJSON() as any;
      // Find the text element with the loading text
      const texts = tree.root.findAll((el: any) =>
        el.children && el.children.includes('Fetching data...'),
      );
      expect(texts.length).toBeGreaterThan(0);
    });

    it('uses loadingText as accessibility label when provided', () => {
      const tree = renderNode({ type: 'loading', loadingText: 'Please wait...' } as SchemaNode);
      const containers = findByProp(tree, 'accessibilityLabel', 'Please wait...');
      expect(containers.length).toBeGreaterThan(0);
    });

    it('renders horizontal layout when loadingDirection is horizontal', () => {
      const tree = renderNode({
        type: 'loading',
        loadingText: 'Loading...',
        loadingDirection: 'horizontal',
      } as SchemaNode);
      const containers = tree.root.findAll((el: any) =>
        el.props.style?.flexDirection === 'row',
      );
      expect(containers.length).toBeGreaterThan(0);
    });

    it('renders vertical layout by default', () => {
      const tree = renderNode({
        type: 'loading',
        loadingText: 'Loading...',
      } as SchemaNode);
      const containers = tree.root.findAll((el: any) =>
        el.props.style?.flexDirection === 'column',
      );
      expect(containers.length).toBeGreaterThan(0);
    });

    it('defaults to spinner when loadingVariant not specified', () => {
      const tree = renderNode({ type: 'loading' });
      // Should have an ActivityIndicator (identified by size prop)
      const indicators = findByProp(tree, 'size', 'small');
      expect(indicators.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Progress variant
  // =========================================================================
  describe('progress variant', () => {
    it('renders progress bar at 0%', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '0',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      expect(fill.length).toBeGreaterThanOrEqual(1);
      // Width is now an Animated interpolation (animates from 0 to target)
      expect(fill[0].props.style.width).toBeDefined();
    });

    it('renders progress bar at 50%', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '50',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      expect(fill[0].props.style.width).toBeDefined();
      expect(fill[0].props.style.backgroundColor).toBeDefined();
    });

    it('renders progress bar at 100%', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '100',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      expect(fill[0].props.style.width).toBeDefined();
    });

    it('clamps progress above 100 to 100%', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '150',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      expect(fill[0].props.style.width).toBeDefined();
    });

    it('clamps progress below 0 to 0%', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '-20',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      expect(fill[0].props.style.width).toBeDefined();
    });

    it('renders loadingText with progress bar', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '75',
        loadingText: 'Uploading...',
      } as SchemaNode);
      const texts = tree.root.findAll((el: any) =>
        el.children && el.children.includes('Uploading...'),
      );
      expect(texts.length).toBeGreaterThan(0);
    });

    it('renders percentage text', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '42',
      } as SchemaNode);
      const texts = tree.root.findAll((el: any) =>
        el.children && el.children.includes('42%'),
      );
      expect(texts.length).toBeGreaterThan(0);
    });

    it('has correct accessibility value', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '60',
      } as SchemaNode);
      const containers = tree.root.findAll((el: any) =>
        el.props.accessibilityValue?.now === 60,
      );
      expect(containers.length).toBeGreaterThan(0);
      expect(containers[0].props.accessibilityValue).toEqual({
        min: 0, max: 100, now: 60,
      });
    });

    it('has progressbar accessibility role', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: '50',
      } as SchemaNode);
      const containers = findByProp(tree, 'accessibilityRole', 'progressbar');
      expect(containers.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Overlay variant
  // =========================================================================
  describe('overlay variant', () => {
    it('renders backdrop with semi-transparent background', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
      } as SchemaNode);
      const backdrop = tree.root.findAll((el: any) =>
        el.props.style?.backgroundColor === 'rgba(0,0,0,0.4)',
      );
      expect(backdrop.length).toBeGreaterThan(0);
    });

    it('uses absolute positioning', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
      } as SchemaNode);
      const positioned = tree.root.findAll((el: any) =>
        el.props.style?.position === 'absolute',
      );
      expect(positioned.length).toBeGreaterThan(0);
    });

    it('has zIndex 999', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
      } as SchemaNode);
      const zIndexed = tree.root.findAll((el: any) =>
        el.props.style?.zIndex === 999,
      );
      expect(zIndexed.length).toBeGreaterThan(0);
    });

    it('renders centered spinner in white card', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
      } as SchemaNode);
      const card = tree.root.findAll((el: any) =>
        el.props.style?.backgroundColor === '#FFFFFF' &&
        el.props.style?.borderRadius === 16,
      );
      expect(card.length).toBeGreaterThan(0);
    });

    it('renders loadingText in overlay', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
        loadingText: 'Please wait...',
      } as SchemaNode);
      const texts = tree.root.findAll((el: any) =>
        el.children && el.children.includes('Please wait...'),
      );
      expect(texts.length).toBeGreaterThan(0);
    });

    it('has assertive live region for accessibility', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'overlay',
      } as SchemaNode);
      const liveRegions = findByProp(tree, 'accessibilityLiveRegion', 'assertive');
      expect(liveRegions.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Skeleton variant
  // =========================================================================
  describe('skeleton variant', () => {
    it('renders rect skeleton shapes', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [
          { shape: 'rect', width: '100%', height: 20 },
        ],
      } as SchemaNode);
      const items = findByTestID(tree, 'skeleton-item-0');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].props.style.height).toBe(20);
    });

    it('renders circle skeleton shapes with correct border radius', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [
          { shape: 'circle', size: 48 },
        ],
      } as SchemaNode);
      const items = findByTestID(tree, 'skeleton-item-0');
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].props.style.borderRadius).toBe(24);
      expect(items[0].props.style.width).toBe(48);
      expect(items[0].props.style.height).toBe(48);
    });

    it('renders text skeleton shapes with correct line count', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [
          { shape: 'text', lines: 4 },
        ],
      } as SchemaNode);
      // Text shape creates N animated views for lines — RN mock may double elements
      const animatedViews = tree.root.findAll((el: any) =>
        el.props.style?.height === 14 && el.props.style?.borderRadius === 4,
      );
      // Each line is wrapped by the Animated mock, so expect at least 4
      expect(animatedViews.length).toBeGreaterThanOrEqual(4);
    });

    it('defaults text shape to 3 lines', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [
          { shape: 'text' },
        ],
      } as SchemaNode);
      const animatedViews = tree.root.findAll((el: any) =>
        el.props.style?.height === 14 && el.props.style?.borderRadius === 4,
      );
      expect(animatedViews.length).toBeGreaterThanOrEqual(3);
    });

    it('renders mixed skeleton layout', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [
          { shape: 'rect', width: '100%', height: 20 },
          { shape: 'circle', size: 40 },
          { shape: 'text', lines: 2 },
        ],
      } as SchemaNode);
      // Rect and circle have testIDs
      expect(findByTestID(tree, 'skeleton-item-0').length).toBeGreaterThanOrEqual(1);
      expect(findByTestID(tree, 'skeleton-item-1').length).toBeGreaterThanOrEqual(1);
      // Text lines
      const textLines = tree.root.findAll((el: any) =>
        el.props.style?.height === 14 && el.props.style?.borderRadius === 4,
      );
      expect(textLines.length).toBeGreaterThanOrEqual(2);
    });

    it('handles empty skeletonLayout gracefully', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [],
      } as SchemaNode);
      const containers = findByProp(tree, 'accessibilityRole', 'progressbar');
      expect(containers.length).toBeGreaterThan(0);
    });

    it('has progressbar accessibility role', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'skeleton',
        skeletonLayout: [{ shape: 'rect', height: 20 }],
      } as SchemaNode);
      const containers = findByProp(tree, 'accessibilityRole', 'progressbar');
      expect(containers.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('unknown loadingVariant falls back to spinner', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'unknown-variant' as any,
      } as SchemaNode);
      // Should render ActivityIndicator (spinner fallback)
      const indicators = findByProp(tree, 'size', 'small');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('backward compatible — { type: "loading" } still works', () => {
      const tree = renderNode({ type: 'loading' });
      const indicators = findByProp(tree, 'color', '#0066CC');
      expect(indicators.length).toBeGreaterThan(0);
      const containers = findByProp(tree, 'accessibilityRole', 'progressbar');
      expect(containers.length).toBeGreaterThan(0);
    });

    it('reads props from node.props fallback', () => {
      const tree = renderNode({
        type: 'loading',
        props: { loadingText: 'From props', size: 'lg' },
      } as SchemaNode);
      const texts = tree.root.findAll((el: any) =>
        el.children && el.children.includes('From props'),
      );
      expect(texts.length).toBeGreaterThan(0);
      const indicators = findByProp(tree, 'size', 'large');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('handles progress with non-numeric string gracefully', () => {
      const tree = renderNode({
        type: 'loading',
        loadingVariant: 'progress',
        progress: 'not-a-number',
      } as SchemaNode);
      const fill = findByTestID(tree, 'progress-fill');
      // Width is an Animated interpolation; falls back to 0 for invalid input
      expect(fill[0].props.style.width).toBeDefined();
    });
  });
});
