/**
 * SchemaInterpreter Integration Test Suite
 * Tests expression resolution, repeater template cloning, and component wiring.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import { SchemaInterpreter } from '../../src/schema/SchemaInterpreter';
import { ExpressionEngine } from '../../src/schema/ExpressionEngine';
import { StyleResolver } from '../../src/schema/StyleResolver';
import { ComponentRegistry } from '../../src/schema/ComponentRegistry';
import { COMPONENT_SPECS } from '../../src/schema/ComponentSpecs';
import { TextComponent } from '../../src/schema/components/TextComponent';
import { RowComponent } from '../../src/schema/components/RowComponent';
import { ColumnComponent } from '../../src/schema/components/ColumnComponent';
import { RepeaterComponent } from '../../src/schema/components/RepeaterComponent';
import { ConditionalComponent } from '../../src/schema/components/ConditionalComponent';
import { ButtonComponent } from '../../src/schema/components/ButtonComponent';
import type { RenderContext, SchemaNode, ScreenSchema } from '../../src/types';

jest.mock('react-native');

function buildInterpreter(): SchemaInterpreter {
  const registry = new ComponentRegistry(COMPONENT_SPECS);
  // Register the components we need
  registry.register(COMPONENT_SPECS['text'], TextComponent);
  registry.register(COMPONENT_SPECS['row'], RowComponent);
  registry.register(COMPONENT_SPECS['column'], ColumnComponent);
  registry.register(COMPONENT_SPECS['repeater'], RepeaterComponent);
  registry.register(COMPONENT_SPECS['conditional'], ConditionalComponent);
  registry.register(COMPONENT_SPECS['button'], ButtonComponent);

  const expressionEngine = new ExpressionEngine();
  const styleResolver = new StyleResolver();
  return new SchemaInterpreter(registry, expressionEngine, styleResolver);
}

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test', moduleId: 'mod', screenId: 'screen',
    data: {}, state: {}, user: { id: 'u1', name: 'Test User' },
    designTokens: { colors: { primary: '#0066CC', background: '#FFFFFF' }, typography: { fontFamily: 'System', baseFontSize: 14 }, spacing: { unit: 4 }, borderRadius: { default: 8 } },
    onAction: jest.fn(), onStateChange: jest.fn(),
    ...overrides,
  };
}

describe('SchemaInterpreter Integration', () => {
  let interpreter: SchemaInterpreter;

  beforeEach(() => {
    interpreter = buildInterpreter();
  });

  describe('Expression Resolution', () => {
    it('resolves $data.value in text component', () => {
      const node: SchemaNode = { type: 'text', value: '${$data.total}' };
      const ctx = makeContext({ data: { total: 42 } });
      const element = interpreter.interpret(node, ctx);
      expect(element).not.toBeNull();

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('42'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('resolves template expressions in text', () => {
      const node: SchemaNode = { type: 'text', value: 'Total: ${$data.amount} AED' };
      const ctx = makeContext({ data: { amount: 150 } });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('Total: 150 AED'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('resolves arithmetic expression', () => {
      const node: SchemaNode = { type: 'text', value: '${$data.price * 1.05}' };
      const ctx = makeContext({ data: { price: 100 } });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('105'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('resolves $user variable', () => {
      const node: SchemaNode = { type: 'text', value: '${$user.name}' };
      const ctx = makeContext();
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('Test User'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('resolves $state variable', () => {
      const node: SchemaNode = { type: 'text', value: '${$state.filter}' };
      const ctx = makeContext({ state: { filter: 'active' } });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('active'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('resolves ternary expression', () => {
      const node: SchemaNode = { type: 'text', value: "${$data.count > 0 ? 'Has items' : 'Empty'}" };
      const ctx = makeContext({ data: { count: 5 } });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const text = tree!.root.findAll((el: any) => el.children?.includes('Has items'));
      expect(text.length).toBeGreaterThan(0);
    });

    it('handles failed expression gracefully (keeps original)', () => {
      const node: SchemaNode = { type: 'text', value: '${$data.nonexistent.deeply.nested}' };
      const ctx = makeContext({ data: {} });
      const element = interpreter.interpret(node, ctx);
      // Should not throw, should render something
      expect(element).not.toBeNull();
    });
  });

  describe('Visibility (Conditional)', () => {
    it('hides node when visible expression is false', () => {
      const node: SchemaNode = { type: 'text', value: 'Hidden', visible: '${$data.show === true}' };
      const ctx = makeContext({ data: { show: false } });
      const element = interpreter.interpret(node, ctx);
      expect(element).toBeNull();
    });

    it('shows node when visible expression is true', () => {
      const node: SchemaNode = { type: 'text', value: 'Visible', visible: '${$data.show === true}' };
      const ctx = makeContext({ data: { show: true } });
      const element = interpreter.interpret(node, ctx);
      expect(element).not.toBeNull();
    });
  });

  describe('Repeater Template Cloning', () => {
    it('clones template for each data item', () => {
      const node: SchemaNode = {
        type: 'repeater',
        dataSource: '$data.items',
        template: { type: 'text', value: '${$item.name}' },
      };
      const ctx = makeContext({
        data: { items: [{ name: 'Apple' }, { name: 'Banana' }, { name: 'Cherry' }] },
      });
      const element = interpreter.interpret(node, ctx);
      expect(element).not.toBeNull();

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });

      const apple = tree!.root.findAll((el: any) => el.children?.includes('Apple'));
      const banana = tree!.root.findAll((el: any) => el.children?.includes('Banana'));
      const cherry = tree!.root.findAll((el: any) => el.children?.includes('Cherry'));
      expect(apple.length).toBeGreaterThan(0);
      expect(banana.length).toBeGreaterThan(0);
      expect(cherry.length).toBeGreaterThan(0);
    });

    it('shows empty message for empty data', () => {
      const node: SchemaNode = {
        type: 'repeater',
        dataSource: '$data.items',
        emptyMessage: 'No results',
        template: { type: 'text', value: '${$item.name}' },
      };
      const ctx = makeContext({ data: { items: [] } });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const empty = tree!.root.findAll((el: any) => el.children?.includes('No results'));
      expect(empty.length).toBeGreaterThan(0);
    });

    it('injects $index into item context', () => {
      const node: SchemaNode = {
        type: 'repeater',
        dataSource: '$data.items',
        template: { type: 'text', value: '${$index}' },
      };
      const ctx = makeContext({
        data: { items: ['a', 'b'] },
      });
      const element = interpreter.interpret(node, ctx);

      let tree: ReactTestRenderer;
      act(() => { tree = create(element!); });
      const zero = tree!.root.findAll((el: any) => el.children?.includes('0'));
      const one = tree!.root.findAll((el: any) => el.children?.includes('1'));
      expect(zero.length).toBeGreaterThan(0);
      expect(one.length).toBeGreaterThan(0);
    });
  });

  describe('Screen Interpretation', () => {
    it('interprets a full screen schema', () => {
      const schema: ScreenSchema = {
        id: 'home',
        title: 'Home',
        body: {
          type: 'column',
          children: [
            { type: 'text', value: 'Welcome' },
            { type: 'text', value: '${$data.count} items' },
          ],
        },
      };
      const ctx = makeContext({ data: { count: 3 } });
      const element = interpreter.interpretScreen(schema, ctx);
      expect(element).not.toBeNull();

      let tree: ReactTestRenderer;
      act(() => { tree = create(element); });
      const welcome = tree!.root.findAll((el: any) => el.children?.includes('Welcome'));
      expect(welcome.length).toBeGreaterThan(0);
      const count = tree!.root.findAll((el: any) => el.children?.includes('3 items'));
      expect(count.length).toBeGreaterThan(0);
    });

    it('throws when screen has no body', () => {
      const schema = { id: 'empty', title: 'Empty' } as ScreenSchema;
      const ctx = makeContext();
      expect(() => interpreter.interpretScreen(schema, ctx)).toThrow();
    });
  });
});
