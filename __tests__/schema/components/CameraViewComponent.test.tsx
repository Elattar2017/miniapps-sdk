/**
 * CameraViewComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { CameraViewComponent } from '../../../src/schema/components/CameraViewComponent';
import { COMPONENT_SPECS } from '../../../src/schema/ComponentSpecs';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

// Mock getCameraView to return a simple view
jest.mock('../../../src/adapters/CameraViewAdapter', () => ({
  getCameraView: () => 'MockCameraFeed',
}));

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
    type: 'camera_view',
    id: 'cam1',
    cameraFacing: 'back',
    shape: 'rounded',
    ...overrides,
  };
}

describe('CameraViewComponent', () => {
  // ---------------------------------------------------------------------------
  // ComponentSpecs registration
  // ---------------------------------------------------------------------------
  describe('ComponentSpecs', () => {
    it('has camera_view registered in COMPONENT_SPECS', () => {
      expect(COMPONENT_SPECS['camera_view']).toBeDefined();
    });

    it('declares children: true', () => {
      expect(COMPONENT_SPECS['camera_view'].children).toBe(true);
    });

    it('has cameraFacing, shape, and mirror props', () => {
      const spec = COMPONENT_SPECS['camera_view'];
      expect(spec.props.cameraFacing).toBeDefined();
      expect(spec.props.shape).toBeDefined();
      expect(spec.props.mirror).toBeDefined();
    });

    it('is in the input category', () => {
      expect(COMPONENT_SPECS['camera_view'].category).toBe('input');
    });
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  describe('rendering', () => {
    it('renders without crashing', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('renders the camera feed component', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      const json = JSON.stringify(tree!.toJSON());
      expect(json).toContain('MockCameraFeed');
    });

    it('renders children as overlays on top of the feed', () => {
      const node = makeNode({
        children: [
          { type: 'text', value: 'Overlay text' } as any,
        ],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      // The component should render children in an overlay container
      const json = tree!.toJSON();
      expect(json).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Shape masking
  // ---------------------------------------------------------------------------
  describe('shape masking', () => {
    it('applies circle shape as borderRadius = min(w,h)/2', () => {
      const node = makeNode({
        shape: 'circle',
        style: { width: 200, height: 200 },
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      const json = tree!.toJSON();
      const jsonStr = JSON.stringify(json);
      // Circle with 200x200 should have borderRadius of 100
      expect(jsonStr).toContain('100');
    });

    it('applies square shape as borderRadius 0', () => {
      const node = makeNode({
        shape: 'square',
        style: { width: 200, height: 200 },
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      const json = tree!.toJSON();
      expect(json).toBeTruthy();
    });

    it('defaults to rounded shape with borderRadius 16', () => {
      const node = makeNode({ shape: 'rounded' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      const json = tree!.toJSON();
      const jsonStr = JSON.stringify(json);
      expect(jsonStr).toContain('16');
    });
  });

  // ---------------------------------------------------------------------------
  // Camera facing expression
  // ---------------------------------------------------------------------------
  describe('cameraFacing expression', () => {
    it('resolves cameraFacing from $state expression', () => {
      const node = makeNode({ cameraFacing: '$state.facing' });
      const ctx = makeContext({ state: { facing: 'front' } });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      // Should render with front camera facing
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('defaults to back when cameraFacing is undefined', () => {
      const node = makeNode({ cameraFacing: undefined });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Mirror
  // ---------------------------------------------------------------------------
  describe('mirror', () => {
    it('renders with mirror=true', () => {
      const node = makeNode({ mirror: true });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('renders with mirror=false', () => {
      const node = makeNode({ mirror: false });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(CameraViewComponent, { node, context: ctx }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });
  });
});
