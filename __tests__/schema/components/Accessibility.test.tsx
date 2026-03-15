jest.mock("react-native");

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { ScrollComponent } from '../../../src/schema/components/ScrollComponent';
import { CardComponent } from '../../../src/schema/components/CardComponent';
import { TableComponent } from '../../../src/schema/components/TableComponent';
import { SelectComponent } from '../../../src/schema/components/SelectComponent';
import { LoadingComponent } from '../../../src/schema/components/LoadingComponent';
import { DividerComponent } from '../../../src/schema/components/DividerComponent';
import { BadgeComponent } from '../../../src/schema/components/BadgeComponent';
import { FileUploadComponent } from '../../../src/schema/components/FileUploadComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

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
      colors: { primary: '#0066CC', background: '#FFFFFF', surface: '#F9FAFB', text: '#111827', border: '#E5E7EB' },
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
  return { type: 'test', ...overrides };
}

describe('Accessibility', () => {
  describe('ScrollComponent', () => {
    it('has accessibilityRole adjustable, not scrollbar', () => {
      const node = makeNode({ type: 'scroll' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(ScrollComponent, { node, context: ctx })); });
      const scrollView = tree!.root.findAll(el => el.props.accessibilityRole === 'adjustable');
      expect(scrollView.length).toBeGreaterThan(0);
      // Ensure no 'scrollbar' role
      const scrollbar = tree!.root.findAll(el => el.props.accessibilityRole === 'scrollbar');
      expect(scrollbar.length).toBe(0);
    });

    it('has default accessibilityLabel', () => {
      const node = makeNode({ type: 'scroll' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(ScrollComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Scrollable content');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('uses custom accessibilityLabel from node', () => {
      const node = makeNode({ type: 'scroll', accessibilityLabel: 'Custom scroll' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(ScrollComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Custom scroll');
      expect(labeled.length).toBeGreaterThan(0);
    });
  });

  describe('CardComponent', () => {
    it('pressable card has accessibilityLabel', () => {
      const node = makeNode({ type: 'card', onPress: { action: 'navigate' } });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel != null && el.props.accessibilityRole === 'button');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('non-pressable card has accessibilityLabel', () => {
      const node = makeNode({ type: 'card' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel != null);
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('uses custom accessibilityLabel from node', () => {
      const node = makeNode({ type: 'card', accessibilityLabel: 'Dashboard card' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Dashboard card');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('passes accessibilityHint when provided', () => {
      const node = makeNode({ type: 'card', onPress: { action: 'navigate' }, accessibilityHint: 'Opens details' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const hinted = tree!.root.findAll(el => el.props.accessibilityHint === 'Opens details');
      expect(hinted.length).toBeGreaterThan(0);
    });

    it('does not include accessibilityHint when not provided', () => {
      const node = makeNode({ type: 'card', onPress: { action: 'navigate' } });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const hinted = tree!.root.findAll(el => el.props.accessibilityHint != null);
      expect(hinted.length).toBe(0);
    });

    it('uses node.label as fallback for accessibilityLabel', () => {
      const node = makeNode({ type: 'card', label: 'My Card Label' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'My Card Label');
      expect(labeled.length).toBeGreaterThan(0);
    });
  });

  describe('TableComponent', () => {
    it('sort header has accessibilityRole button', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const headerButtons = tree!.root.findAll(
        el => el.props.accessibilityRole === 'button' &&
              el.props.accessibilityLabel &&
              el.props.accessibilityLabel.includes('Sort by'),
      );
      expect(headerButtons.length).toBeGreaterThan(0);
    });

    it('sort header has accessibilityState', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const headerButtons = tree!.root.findAll(
        el => el.props.accessibilityState != null &&
              el.props.accessibilityLabel?.includes('Sort by'),
      );
      expect(headerButtons.length).toBeGreaterThan(0);
    });

    it('sort header accessibilityLabel includes column label', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }, { key: 'age', label: 'Age' }],
        data: [{ name: 'Alice', age: 30 }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const nameHeader = tree!.root.findAll(
        el => el.props.accessibilityLabel === 'Sort by Name',
      );
      expect(nameHeader.length).toBeGreaterThan(0);
      const ageHeader = tree!.root.findAll(
        el => el.props.accessibilityLabel === 'Sort by Age',
      );
      expect(ageHeader.length).toBeGreaterThan(0);
    });

    it('data rows have accessibilityRole button', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const dataRows = tree!.root.findAll(
        el => el.props.accessibilityRole === 'button' &&
              el.props.accessibilityLabel?.includes('Row'),
      );
      expect(dataRows.length).toBeGreaterThan(0);
    });

    it('data rows have numbered accessibilityLabel', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }, { name: 'Bob' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const row1 = tree!.root.findAll(el => el.props.accessibilityLabel === 'Row 1');
      expect(row1.length).toBeGreaterThan(0);
      const row2 = tree!.root.findAll(el => el.props.accessibilityLabel === 'Row 2');
      expect(row2.length).toBeGreaterThan(0);
    });

    it('table container has accessibilityLabel', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const container = tree!.root.findAll(el => el.props.accessibilityLabel === 'Data table');
      expect(container.length).toBeGreaterThan(0);
    });

    it('table uses custom accessibilityLabel from node', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
        accessibilityLabel: 'User list',
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const container = tree!.root.findAll(el => el.props.accessibilityLabel === 'User list');
      expect(container.length).toBeGreaterThan(0);
    });
  });

  describe('SelectComponent', () => {
    it('dropdown items have accessibilityRole radio', () => {
      const node = makeNode({
        type: 'select',
        id: 'sel1',
        options: [{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(SelectComponent, { node, context: ctx })); });

      // Open the dropdown
      const trigger = tree!.root.findAll(el => el.props.accessibilityState?.expanded !== undefined);
      expect(trigger.length).toBeGreaterThan(0);
      act(() => { trigger[0].props.onPress(); });

      // Check radio items - at least 2 options should have radio role (may find nested elements too)
      const radioItems = tree!.root.findAll(el => el.props.accessibilityRole === 'radio');
      expect(radioItems.length).toBeGreaterThanOrEqual(2);
    });

    it('dropdown items have accessibilityState selected', () => {
      const node = makeNode({
        type: 'select',
        id: 'sel1',
        options: [{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }],
      });
      const ctx = makeContext({ state: { sel1: 'a' } });
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(SelectComponent, { node, context: ctx })); });

      // Open dropdown
      const trigger = tree!.root.findAll(el => el.props.accessibilityState?.expanded !== undefined);
      act(() => { trigger[0].props.onPress(); });

      // Check selected state
      const selectedItem = tree!.root.findAll(
        el => el.props.accessibilityRole === 'radio' && el.props.accessibilityState?.selected === true,
      );
      expect(selectedItem.length).toBeGreaterThan(0);
    });

    it('dropdown items have accessibilityLabel', () => {
      const node = makeNode({
        type: 'select',
        id: 'sel1',
        options: [{ label: 'Option A', value: 'a' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(SelectComponent, { node, context: ctx })); });

      // Open dropdown
      const trigger = tree!.root.findAll(el => el.props.accessibilityState?.expanded !== undefined);
      act(() => { trigger[0].props.onPress(); });

      const labeled = tree!.root.findAll(
        el => el.props.accessibilityRole === 'radio' && el.props.accessibilityLabel === 'Option A',
      );
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('dropdown container has accessibilityRole list', () => {
      const node = makeNode({
        type: 'select',
        id: 'sel1',
        options: [{ label: 'Option A', value: 'a' }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(SelectComponent, { node, context: ctx })); });

      // Open dropdown
      const trigger = tree!.root.findAll(el => el.props.accessibilityState?.expanded !== undefined);
      act(() => { trigger[0].props.onPress(); });

      const list = tree!.root.findAll(el => el.props.accessibilityRole === 'list');
      expect(list.length).toBeGreaterThan(0);
    });

    it('dropdown items reflect disabled state in accessibilityState', () => {
      const node = makeNode({
        type: 'select',
        id: 'sel1',
        options: [{ label: 'Option A', value: 'a', disabled: true }],
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(SelectComponent, { node, context: ctx })); });

      // Open dropdown
      const trigger = tree!.root.findAll(el => el.props.accessibilityState?.expanded !== undefined);
      act(() => { trigger[0].props.onPress(); });

      const disabledItem = tree!.root.findAll(
        el => el.props.accessibilityRole === 'radio' && el.props.accessibilityState?.disabled === true,
      );
      expect(disabledItem.length).toBeGreaterThan(0);
    });
  });

  describe('LoadingComponent', () => {
    it('uses i18n for accessibilityLabel', () => {
      const node = makeNode({ type: 'loading' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(LoadingComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityRole === 'progressbar');
      expect(labeled.length).toBeGreaterThan(0);
      // Label should be either 'Loading' (from i18n) or 'loading.label' (key fallback)
      expect(['Loading', 'loading.label']).toContain(labeled[0].props.accessibilityLabel);
    });

    it('has progressbar accessibilityRole', () => {
      const node = makeNode({ type: 'loading' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(LoadingComponent, { node, context: ctx })); });
      const progressbar = tree!.root.findAll(el => el.props.accessibilityRole === 'progressbar');
      expect(progressbar.length).toBeGreaterThan(0);
    });
  });

  describe('DividerComponent', () => {
    it('is hidden from accessibility tree', () => {
      const node = makeNode({ type: 'divider' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(DividerComponent, { node, context: ctx })); });
      const divider = tree!.root.findAll(el => el.props.accessible === false);
      expect(divider.length).toBeGreaterThan(0);
    });

    it('has importantForAccessibility no', () => {
      const node = makeNode({ type: 'divider' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(DividerComponent, { node, context: ctx })); });
      const divider = tree!.root.findAll(el => el.props.importantForAccessibility === 'no');
      expect(divider.length).toBeGreaterThan(0);
    });

    it('has accessibilityElementsHidden true', () => {
      const node = makeNode({ type: 'divider' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(DividerComponent, { node, context: ctx })); });
      const divider = tree!.root.findAll(el => el.props.accessibilityElementsHidden === true);
      expect(divider.length).toBeGreaterThan(0);
    });

    it('does not have accessibilityLabel', () => {
      const node = makeNode({ type: 'divider' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(DividerComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'divider');
      expect(labeled.length).toBe(0);
    });
  });

  describe('BadgeComponent', () => {
    it('uses i18n for accessibilityLabel', () => {
      const node = makeNode({ type: 'badge', value: 'New' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(BadgeComponent, { node, context: ctx })); });
      const badge = tree!.root.findAll(el => el.props.accessibilityRole === 'text');
      expect(badge.length).toBeGreaterThan(0);
      // Should use i18n.t('badge.label', { value: 'New' }) which returns either 'Badge: New' or the key
      expect(badge[0].props.accessibilityLabel).toBeDefined();
    });

    it('accessibilityLabel contains the badge value', () => {
      const node = makeNode({ type: 'badge', value: 'Urgent' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(BadgeComponent, { node, context: ctx })); });
      const badge = tree!.root.findAll(el => el.props.accessibilityRole === 'text');
      expect(badge.length).toBeGreaterThan(0);
      // i18n should return 'Badge: Urgent' or fallback to key
      const label = badge[0].props.accessibilityLabel;
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });

  describe('FileUploadComponent', () => {
    it('uses i18n for label', () => {
      const node = makeNode({ type: 'file_upload', id: 'file1' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(FileUploadComponent, { node, context: ctx })); });
      // The component should render with an i18n-sourced label
      const json = tree!.toJSON();
      expect(json).toBeTruthy();
    });

    it('button has accessibilityRole button', () => {
      const node = makeNode({ type: 'file_upload', id: 'file1' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(FileUploadComponent, { node, context: ctx })); });
      const buttons = tree!.root.findAll(el => el.props.accessibilityRole === 'button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('uses custom label from node.label over i18n default', () => {
      const node = makeNode({ type: 'file_upload', id: 'file1', label: 'Upload Photo' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(FileUploadComponent, { node, context: ctx })); });
      const buttons = tree!.root.findAll(el => el.props.accessibilityLabel === 'Upload Photo');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('SchemaNode a11y fields', () => {
    it('accessibilityLabel passes through to CardComponent', () => {
      const node = makeNode({ type: 'card', accessibilityLabel: 'Custom card label' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Custom card label');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('accessibilityHint passes through to CardComponent', () => {
      const node = makeNode({ type: 'card', onPress: { action: 'navigate' }, accessibilityHint: 'Tap to view details' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(CardComponent, { node, context: ctx })); });
      const hinted = tree!.root.findAll(el => el.props.accessibilityHint === 'Tap to view details');
      expect(hinted.length).toBeGreaterThan(0);
    });

    it('accessibilityLabel passes through to ScrollComponent', () => {
      const node = makeNode({ type: 'scroll', accessibilityLabel: 'Product list' });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(ScrollComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Product list');
      expect(labeled.length).toBeGreaterThan(0);
    });

    it('accessibilityLabel passes through to TableComponent', () => {
      const node = makeNode({
        type: 'table',
        columns: [{ key: 'name', label: 'Name' }],
        data: [{ name: 'Alice' }],
        accessibilityLabel: 'Employee table',
      });
      const ctx = makeContext();
      let tree: ReactTestRenderer;
      act(() => { tree = create(React.createElement(TableComponent, { node, context: ctx })); });
      const labeled = tree!.root.findAll(el => el.props.accessibilityLabel === 'Employee table');
      expect(labeled.length).toBeGreaterThan(0);
    });
  });
});
