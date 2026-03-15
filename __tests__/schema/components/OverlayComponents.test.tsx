/**
 * Overlay Components Test Suite
 * Tests: ScanFrame, CornerBrackets, FaceGuide, GridOverlay, Crosshair, ScanLine
 */

import React from 'react';
import { create } from 'react-test-renderer';
import { ScanFrameComponent } from '../../../src/schema/components/ScanFrameComponent';
import { CornerBracketsComponent } from '../../../src/schema/components/CornerBracketsComponent';
import { FaceGuideComponent } from '../../../src/schema/components/FaceGuideComponent';
import { GridOverlayComponent } from '../../../src/schema/components/GridOverlayComponent';
import { CrosshairComponent } from '../../../src/schema/components/CrosshairComponent';
import { ScanLineComponent } from '../../../src/schema/components/ScanLineComponent';
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
      colors: { primary: '#0066CC', background: '#FFFFFF', text: '#111827' },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

describe('ScanFrameComponent', () => {
  it('renders with default props', () => {
    const node: SchemaNode = { type: 'scan_frame' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanFrameComponent, { node, context: ctx }));
    expect(renderer.toJSON()).not.toBeNull();
  });

  it('renders with custom inset and border style', () => {
    const node: SchemaNode = { type: 'scan_frame', inset: 30, borderStyle: 'solid' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanFrameComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('"pointerEvents":"none"');
  });

  it('renders label when provided', () => {
    const node: SchemaNode = { type: 'scan_frame', label: 'Align document' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanFrameComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Align document');
  });

  it('uses pointerEvents none for touch passthrough', () => {
    const node: SchemaNode = { type: 'scan_frame' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanFrameComponent, { node, context: ctx }));
    const root = renderer.toJSON() as { props?: { style?: Record<string, unknown> } };
    expect(root.props?.style?.pointerEvents).toBe('none');
  });
});

describe('CornerBracketsComponent', () => {
  it('renders 4 corner brackets', () => {
    const node: SchemaNode = { type: 'corner_brackets' };
    const ctx = makeContext();
    const renderer = create(React.createElement(CornerBracketsComponent, { node, context: ctx }));
    const root = renderer.root;
    // Outer container + inner container + 4 corners
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    expect(views.length).toBeGreaterThanOrEqual(5);
  });

  it('applies custom bracket color', () => {
    const node: SchemaNode = { type: 'corner_brackets', bracketColor: '#FF0000' };
    const ctx = makeContext();
    const renderer = create(React.createElement(CornerBracketsComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('#FF0000');
  });
});

describe('FaceGuideComponent', () => {
  it('renders oval by default', () => {
    const node: SchemaNode = { type: 'face_guide' };
    const ctx = makeContext();
    const renderer = create(React.createElement(FaceGuideComponent, { node, context: ctx }));
    expect(renderer.toJSON()).not.toBeNull();
  });

  it('renders label at bottom by default', () => {
    const node: SchemaNode = { type: 'face_guide', label: 'Look here' };
    const ctx = makeContext();
    const renderer = create(React.createElement(FaceGuideComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Look here');
  });

  it('renders label at top when labelPosition is top', () => {
    const node: SchemaNode = { type: 'face_guide', label: 'Face up', labelPosition: 'top' };
    const ctx = makeContext();
    const renderer = create(React.createElement(FaceGuideComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Face up');
  });
});

describe('GridOverlayComponent', () => {
  it('renders default 3x3 grid (2 horizontal + 2 vertical lines)', () => {
    const node: SchemaNode = { type: 'grid_overlay' };
    const ctx = makeContext();
    const renderer = create(React.createElement(GridOverlayComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // 1 outer + 4 lines (2 horizontal + 2 vertical for 3x3 grid)
    expect(views.length).toBe(5);
  });

  it('renders custom grid dimensions', () => {
    const node: SchemaNode = { type: 'grid_overlay', rows: 4, columns: 2 };
    const ctx = makeContext();
    const renderer = create(React.createElement(GridOverlayComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // 1 outer + 3 horizontal (rows-1) + 1 vertical (cols-1) = 5
    expect(views.length).toBe(5);
  });
});

describe('CrosshairComponent', () => {
  it('renders crosshair with 4 line segments', () => {
    const node: SchemaNode = { type: 'crosshair' };
    const ctx = makeContext();
    const renderer = create(React.createElement(CrosshairComponent, { node, context: ctx }));
    expect(renderer.toJSON()).not.toBeNull();
  });

  it('renders circle when showCircle is true', () => {
    const node: SchemaNode = { type: 'crosshair', showCircle: true, circleRadius: 15 };
    const ctx = makeContext();
    const renderer = create(React.createElement(CrosshairComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // outer + container + 4 segments + 1 circle = 7
    expect(views.length).toBe(7);
  });

  it('does not render circle when showCircle is false', () => {
    const node: SchemaNode = { type: 'crosshair', showCircle: false };
    const ctx = makeContext();
    const renderer = create(React.createElement(CrosshairComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // outer + container + 4 segments = 6
    expect(views.length).toBe(6);
  });
});

describe('ScanLineComponent', () => {
  it('renders scan line', () => {
    const node: SchemaNode = { type: 'scan_line' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanLineComponent, { node, context: ctx }));
    expect(renderer.toJSON()).not.toBeNull();
  });

  it('renders glow layer when glowEffect is true (default)', () => {
    const node: SchemaNode = { type: 'scan_line' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanLineComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // outer + glow + line = 3
    expect(views.length).toBe(3);
  });

  it('skips glow layer when glowEffect is false', () => {
    const node: SchemaNode = { type: 'scan_line', glowEffect: false };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanLineComponent, { node, context: ctx }));
    const root = renderer.root;
    const views = root.findAllByType('View' as unknown as React.ComponentType);
    // outer + line only = 2
    expect(views.length).toBe(2);
  });

  it('applies custom line color', () => {
    const node: SchemaNode = { type: 'scan_line', lineColor: '#FF00FF' };
    const ctx = makeContext();
    const renderer = create(React.createElement(ScanLineComponent, { node, context: ctx }));
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('#FF00FF');
  });
});
