/**
 * AccordionComponent + AccordionItemComponent Test Suite
 * Tests container variants, expand/collapse, groupId radio, defaultExpanded,
 * disabled state, events, and accessibility
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { AccordionComponent } from '../../../src/schema/components/AccordionComponent';
import { AccordionItemComponent } from '../../../src/schema/components/AccordionItemComponent';
import type { RenderContext, SchemaNode } from '../../../src/types';

jest.mock('react-native');

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 't', moduleId: 'm', screenId: 's',
    data: {}, state: {}, user: { id: 'u' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
    ...overrides,
  };
}

function renderAccordion(node: SchemaNode, ctx?: RenderContext, children?: React.ReactNode): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(React.createElement(AccordionComponent, { node, context: ctx ?? makeContext() }, children)); });
  return tree!;
}

function renderItem(node: SchemaNode, ctx?: RenderContext, children?: React.ReactNode): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => { tree = create(React.createElement(AccordionItemComponent, { node, context: ctx ?? makeContext() }, children)); });
  return tree!;
}

// ─────────────────────────────────────────────────────────────────────────────
// AccordionComponent (container)
// ─────────────────────────────────────────────────────────────────────────────
describe('AccordionComponent', () => {
  it('renders children', () => {
    const child = React.createElement('View', { testID: 'child' });
    const tree = renderAccordion({ type: 'accordion' }, undefined, child);
    const found = tree.root.findAll((el: any) => el.props.testID === 'child');
    expect(found.length).toBe(1);
  });

  it('applies default variant (plain column)', () => {
    const tree = renderAccordion({ type: 'accordion' });
    const root = tree.root.children[0] as any;
    expect(root.props.style.flexDirection).toBe('column');
    expect(root.props.style.borderWidth).toBeUndefined();
    expect(root.props.style.gap).toBeUndefined();
  });

  it('applies bordered variant', () => {
    const tree = renderAccordion({ type: 'accordion', variant: 'bordered' } as SchemaNode);
    const root = tree.root.children[0] as any;
    expect(root.props.style.borderWidth).toBe(1);
    expect(root.props.style.borderRadius).toBe(8);
    expect(root.props.style.overflow).toBe('hidden');
  });

  it('applies separated variant', () => {
    const tree = renderAccordion({ type: 'accordion', variant: 'separated' } as SchemaNode);
    const root = tree.root.children[0] as any;
    expect(root.props.style.gap).toBe(8);
  });

  it('merges custom style', () => {
    const tree = renderAccordion({ type: 'accordion', style: { marginTop: 20 } });
    const root = tree.root.children[0] as any;
    expect(root.props.style.marginTop).toBe(20);
  });

  it('reads variant from props fallback', () => {
    const tree = renderAccordion({ type: 'accordion', props: { variant: 'bordered' } });
    const root = tree.root.children[0] as any;
    expect(root.props.style.borderWidth).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AccordionItemComponent (collapsible section)
// ─────────────────────────────────────────────────────────────────────────────
describe('AccordionItemComponent', () => {
  // ── Basic rendering ──
  describe('rendering', () => {
    it('renders title text', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'FAQ Title' } as SchemaNode);
      const texts = tree.root.findAll((el: any) => el.children?.includes('FAQ Title'));
      expect(texts.length).toBeGreaterThan(0);
    });

    it('renders subtitle when provided', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'T', subtitle: 'Sub text' } as SchemaNode);
      const texts = tree.root.findAll((el: any) => el.children?.includes('Sub text'));
      expect(texts.length).toBeGreaterThan(0);
    });

    it('does not render subtitle when not provided', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'T' } as SchemaNode);
      // Only one text child in header (title + chevron)
      const allTexts = tree.root.findAll((el: any) => typeof el.children?.[0] === 'string');
      const subtitleTexts = allTexts.filter((el: any) =>
        el.props.style?.fontSize === 13 && el.props.style?.color === '#6B7280',
      );
      expect(subtitleTexts.length).toBe(0);
    });

    it('renders chevron indicator', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'T' } as SchemaNode);
      const chevrons = tree.root.findAll((el: any) => el.children?.includes('\u25BC'));
      expect(chevrons.length).toBe(1);
    });

    it('reads title from props fallback', () => {
      const tree = renderItem({ type: 'accordion_item', props: { title: 'From Props' } });
      const texts = tree.root.findAll((el: any) => el.children?.includes('From Props'));
      expect(texts.length).toBeGreaterThan(0);
    });
  });

  // ── Independent toggle ──
  describe('independent toggle (no groupId)', () => {
    it('starts collapsed by default', () => {
      const ctx = makeContext();
      const child = React.createElement('View', { testID: 'content' });
      const tree = renderItem({ type: 'accordion_item', id: 'a1', title: 'T' } as SchemaNode, ctx, child);
      // Content should not be rendered
      const found = tree.root.findAll((el: any) => el.props.testID === 'content');
      expect(found.length).toBe(0);
    });

    it('calls onStateChange with true on press', () => {
      const ctx = makeContext();
      const tree = renderItem({ type: 'accordion_item', id: 'a1', title: 'T' } as SchemaNode, ctx);
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('_accordion_a1', 'true');
    });

    it('calls onStateChange with false on second press (collapse)', () => {
      const ctx = makeContext({ state: { '_accordion_a1': 'true' } });
      const tree = renderItem({ type: 'accordion_item', id: 'a1', title: 'T' } as SchemaNode, ctx);
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('_accordion_a1', 'false');
    });

    it('shows children when expanded', () => {
      const ctx = makeContext({ state: { '_accordion_a1': 'true' } });
      const child = React.createElement('View', { testID: 'content' });
      const tree = renderItem({ type: 'accordion_item', id: 'a1', title: 'T' } as SchemaNode, ctx, child);
      const found = tree.root.findAll((el: any) => el.props.testID === 'content');
      expect(found.length).toBe(1);
    });
  });

  // ── defaultExpanded ──
  describe('defaultExpanded', () => {
    it('initializes state on mount when state is undefined', () => {
      const ctx = makeContext();
      renderItem({ type: 'accordion_item', id: 'a2', title: 'T', defaultExpanded: true } as SchemaNode, ctx);
      expect(ctx.onStateChange).toHaveBeenCalledWith('_accordion_a2', 'true');
    });

    it('does not override existing state', () => {
      const ctx = makeContext({ state: { '_accordion_a2': 'false' } });
      renderItem({ type: 'accordion_item', id: 'a2', title: 'T', defaultExpanded: true } as SchemaNode, ctx);
      // onStateChange should NOT be called since state already has a value
      expect(ctx.onStateChange).not.toHaveBeenCalled();
    });
  });

  // ── groupId radio behavior ──
  describe('groupId (radio mode)', () => {
    it('expands when state matches title', () => {
      const ctx = makeContext({ state: { faq: 'Question 1' } });
      const child = React.createElement('View', { testID: 'content' });
      const tree = renderItem(
        { type: 'accordion_item', title: 'Question 1', groupId: 'faq' } as SchemaNode,
        ctx, child,
      );
      const found = tree.root.findAll((el: any) => el.props.testID === 'content');
      expect(found.length).toBe(1);
    });

    it('stays collapsed when state does not match title', () => {
      const ctx = makeContext({ state: { faq: 'Question 2' } });
      const child = React.createElement('View', { testID: 'content' });
      const tree = renderItem(
        { type: 'accordion_item', title: 'Question 1', groupId: 'faq' } as SchemaNode,
        ctx, child,
      );
      const found = tree.root.findAll((el: any) => el.props.testID === 'content');
      expect(found.length).toBe(0);
    });

    it('sets state to title on press (expand)', () => {
      const ctx = makeContext({ state: { faq: '' } });
      const tree = renderItem(
        { type: 'accordion_item', title: 'Question 1', groupId: 'faq' } as SchemaNode,
        ctx,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('faq', 'Question 1');
    });

    it('sets state to empty on press when already expanded (collapse)', () => {
      const ctx = makeContext({ state: { faq: 'Question 1' } });
      const tree = renderItem(
        { type: 'accordion_item', title: 'Question 1', groupId: 'faq' } as SchemaNode,
        ctx,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onStateChange).toHaveBeenCalledWith('faq', '');
    });

    it('initializes defaultExpanded with groupId (sets state to title)', () => {
      const ctx = makeContext();
      renderItem(
        { type: 'accordion_item', title: 'Q1', groupId: 'faq', defaultExpanded: true } as SchemaNode,
        ctx,
      );
      expect(ctx.onStateChange).toHaveBeenCalledWith('faq', 'Q1');
    });
  });

  // ── Disabled ──
  describe('disabled state', () => {
    it('does not toggle on press when disabled', () => {
      const ctx = makeContext();
      const tree = renderItem(
        { type: 'accordion_item', id: 'a3', title: 'T', disabled: 'true' } as SchemaNode,
        ctx,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      // onStateChange should not be called for toggle (only maybe for defaultExpanded)
      const toggleCalls = (ctx.onStateChange as jest.Mock).mock.calls.filter(
        (c: unknown[]) => c[0] === '_accordion_a3',
      );
      expect(toggleCalls.length).toBe(0);
    });

    it('applies reduced opacity when disabled', () => {
      const tree = renderItem(
        { type: 'accordion_item', id: 'a3', title: 'T', disabled: 'true' } as SchemaNode,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      expect(button.props.style.opacity).toBe(0.5);
    });
  });

  // ── Events ──
  describe('events', () => {
    it('fires onAction with onToggle on press', () => {
      const ctx = makeContext();
      const onToggle = { action: 'analytics' as const, event: 'accordion_toggle' };
      const tree = renderItem(
        { type: 'accordion_item', id: 'a4', title: 'T', onToggle } as SchemaNode,
        ctx,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onAction).toHaveBeenCalledWith(onToggle);
    });

    it('does not fire onAction when disabled', () => {
      const ctx = makeContext();
      const onToggle = { action: 'analytics' as const, event: 'toggle' };
      const tree = renderItem(
        { type: 'accordion_item', id: 'a5', title: 'T', disabled: 'true', onToggle } as SchemaNode,
        ctx,
      );
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      act(() => { button.props.onPress(); });
      expect(ctx.onAction).not.toHaveBeenCalled();
    });
  });

  // ── Accessibility ──
  describe('accessibility', () => {
    it('has button accessibilityRole', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'FAQ' } as SchemaNode);
      const buttons = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('has accessibilityLabel with title', () => {
      const tree = renderItem({ type: 'accordion_item', title: 'FAQ' } as SchemaNode);
      const button = tree.root.findAll((el: any) => el.props.accessibilityLabel === 'Toggle FAQ');
      expect(button.length).toBeGreaterThan(0);
    });

    it('has expanded false when collapsed', () => {
      const tree = renderItem({ type: 'accordion_item', id: 'a6', title: 'T' } as SchemaNode);
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      expect(button.props.accessibilityState?.expanded).toBe(false);
    });

    it('has expanded true when open', () => {
      const ctx = makeContext({ state: { '_accordion_a6': 'true' } });
      const tree = renderItem({ type: 'accordion_item', id: 'a6', title: 'T' } as SchemaNode, ctx);
      const button = tree.root.findAll((el: any) => el.props.accessibilityRole === 'button')[0];
      expect(button.props.accessibilityState?.expanded).toBe(true);
    });
  });
});
