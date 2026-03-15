/**
 * FileUploadComponent Test Suite
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { FileUploadComponent } from '../../../src/schema/components/FileUploadComponent';
import { COMPONENT_SPECS } from '../../../src/schema/ComponentSpecs';
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
    type: 'file_upload',
    id: 'file1',
    label: 'Upload Document',
    onPress: { action: 'file_select' as any, payload: { accept: '*/*' } },
    ...overrides,
  };
}

describe('FileUploadComponent', () => {
  // ---------------------------------------------------------------------------
  // Rendering tests
  // ---------------------------------------------------------------------------

  describe('rendering', () => {
    it('renders without crashing', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      expect(tree!.toJSON()).toBeTruthy();
    });

    it('renders default label "Select File" when no label', () => {
      const node = makeNode({ label: undefined });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const labels = tree!.root.findAll((el: any) => el.children?.includes('Select File'));
      expect(labels.length).toBeGreaterThan(0);
    });

    it('renders custom label from node.label', () => {
      const node = makeNode({ label: 'Upload Document' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const labels = tree!.root.findAll((el: any) => el.children?.includes('Upload Document'));
      expect(labels.length).toBeGreaterThan(0);
    });

    it('renders with dashed border style', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const dashed = tree!.root.findAll((el: any) => el.props.style?.borderStyle === 'dashed');
      expect(dashed.length).toBeGreaterThan(0);
    });

    it('renders with primary color border when not disabled', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const primaryBorder = tree!.root.findAll(
        (el: any) => el.props.style?.borderColor === '#0066CC',
      );
      expect(primaryBorder.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // COMPONENT_SPECS registration (Fix 4)
  // ---------------------------------------------------------------------------

  describe('COMPONENT_SPECS registration', () => {
    it('should be registered in COMPONENT_SPECS as file_upload', () => {
      expect(COMPONENT_SPECS).toHaveProperty('file_upload');
      expect(COMPONENT_SPECS.file_upload.type).toBe('file_upload');
      expect(COMPONENT_SPECS.file_upload.category).toBe('input');
    });

    it('should have 34 total component types registered', () => {
      expect(Object.keys(COMPONENT_SPECS)).toHaveLength(34);
    });
  });

  // ---------------------------------------------------------------------------
  // Disabled state tests
  // ---------------------------------------------------------------------------

  describe('disabled state', () => {
    it('renders with opacity 0.5 when disabled', () => {
      const node = makeNode({ disabled: 'true' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const opaque = tree!.root.findAll((el: any) => el.props.style?.opacity === 0.5);
      expect(opaque.length).toBeGreaterThan(0);
    });

    it('disabled button has disabled=true', () => {
      const node = makeNode({ disabled: 'true' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const disabledEls = tree!.root.findAll((el: any) => el.props.disabled === true);
      expect(disabledEls.length).toBeGreaterThan(0);
    });

    it('does not call onAction when disabled and pressed', () => {
      const onAction = jest.fn();
      const node = makeNode({ disabled: 'true' });
      const ctx = makeContext({ onAction });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });

      const touchables = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
      expect(touchables.length).toBeGreaterThan(0);

      act(() => {
        touchables[0].props.onPress();
      });
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // File info display tests
  // ---------------------------------------------------------------------------

  describe('file info display', () => {
    it('does not show file info when no file in state', () => {
      const node = makeNode();
      const ctx = makeContext({ state: {} });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      // No file name should appear
      const fileNames = tree!.root.findAll((el: any) => el.children?.includes('report.pdf'));
      expect(fileNames.length).toBe(0);
    });

    it('shows file name when file info in context.state', () => {
      const node = makeNode();
      const ctx = makeContext({
        state: { file1: { name: 'report.pdf', size: 1024, type: 'application/pdf' } },
      });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const fileNames = tree!.root.findAll((el: any) => el.children?.includes('report.pdf'));
      expect(fileNames.length).toBeGreaterThan(0);
    });

    it('shows formatted file size (e.g., "1.0 KB")', () => {
      const node = makeNode();
      const ctx = makeContext({
        state: { file1: { name: 'report.pdf', size: 1024, type: 'application/pdf' } },
      });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const sizeLabels = tree!.root.findAll((el: any) => {
        if (!el.children) return false;
        return el.children.some((child: any) => typeof child === 'string' && child.includes('1.0 KB'));
      });
      expect(sizeLabels.length).toBeGreaterThan(0);
    });

    it('shows file type', () => {
      const node = makeNode();
      const ctx = makeContext({
        state: { file1: { name: 'report.pdf', size: 2048, type: 'application/pdf' } },
      });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const typeLabels = tree!.root.findAll((el: any) => {
        if (!el.children) return false;
        return el.children.some((child: any) => typeof child === 'string' && child.includes('application/pdf'));
      });
      expect(typeLabels.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Interaction tests
  // ---------------------------------------------------------------------------

  describe('interaction', () => {
    it('calls onAction when pressed', () => {
      const onAction = jest.fn();
      const node = makeNode();
      const ctx = makeContext({ onAction });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });

      const touchables = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
      expect(touchables.length).toBeGreaterThan(0);

      act(() => {
        touchables[0].props.onPress();
      });
      expect(onAction).toHaveBeenCalled();
    });

    it('passes correct action from node.onPress', () => {
      const onAction = jest.fn();
      const pressAction = { action: 'file_select' as any, payload: { accept: 'image/*' } };
      const node = makeNode({ onPress: pressAction });
      const ctx = makeContext({ onAction });
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });

      const touchables = tree!.root.findAll((el: any) => typeof el.props.onPress === 'function');
      act(() => {
        touchables[0].props.onPress();
      });
      expect(onAction).toHaveBeenCalledWith(pressAction);
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility tests
  // ---------------------------------------------------------------------------

  describe('accessibility', () => {
    it('sets accessibilityRole to button', () => {
      const node = makeNode();
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const buttons = tree!.root.findAll(
        (el: any) => el.props.accessibilityRole === 'button',
      );
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('sets accessibilityLabel to label text', () => {
      const node = makeNode({ label: 'Upload Document' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const labeled = tree!.root.findAll(
        (el: any) => el.props.accessibilityLabel === 'Upload Document',
      );
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('container has accessibilityLabel with "File upload:" prefix', () => {
      const node = makeNode({ label: 'Upload Document' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(FileUploadComponent, { node, context: ctx }));
      });
      const container = tree!.root.findAll(
        (el: any) => el.props.accessibilityLabel === 'File upload: Upload Document',
      );
      expect(container.length).toBeGreaterThan(0);
    });
  });
});
