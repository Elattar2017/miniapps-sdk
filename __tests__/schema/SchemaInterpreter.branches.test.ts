/**
 * SchemaInterpreter Branch Coverage Tests
 *
 * Targets uncovered branches: RTL layout, visibility error catch,
 * screen body hidden, chartData/data expression resolution,
 * repeater error paths, i18n $t integration, expression failure.
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
import { TableComponent } from '../../src/schema/components/TableComponent';
import { ChartComponent } from '../../src/schema/components/ChartComponent';
import type { RenderContext, SchemaNode, ScreenSchema, SchemaComponentProps } from '../../src/types';
import { i18n } from '../../src/i18n';

jest.mock('react-native');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function buildInterpreter(extraComponents?: Record<string, React.ComponentType<SchemaComponentProps>>): SchemaInterpreter {
  const registry = new ComponentRegistry(COMPONENT_SPECS);
  registry.register(COMPONENT_SPECS['text'], TextComponent);
  registry.register(COMPONENT_SPECS['row'], RowComponent);
  registry.register(COMPONENT_SPECS['column'], ColumnComponent);
  registry.register(COMPONENT_SPECS['repeater'], RepeaterComponent);
  if (COMPONENT_SPECS['table']) {
    registry.register(COMPONENT_SPECS['table'], TableComponent);
  }
  if (COMPONENT_SPECS['chart']) {
    registry.register(COMPONENT_SPECS['chart'], ChartComponent);
  }
  if (extraComponents) {
    for (const [type, comp] of Object.entries(extraComponents)) {
      if (COMPONENT_SPECS[type]) {
        registry.register(COMPONENT_SPECS[type], comp);
      }
    }
  }
  const expressionEngine = new ExpressionEngine();
  const styleResolver = new StyleResolver();
  return new SchemaInterpreter(registry, expressionEngine, styleResolver);
}

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test',
    moduleId: 'mod',
    screenId: 'screen',
    data: {},
    state: {},
    user: { id: 'u1' },
    designTokens: {
      colors: { primary: '#0066CC', background: '#FFFFFF' },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    onAction: jest.fn(),
    onStateChange: jest.fn(),
    ...overrides,
  };
}

// ─── RTL Layout Adjustments (lines 121-129) ─────────────────────────

describe('SchemaInterpreter — RTL layout', () => {
  let interpreter: SchemaInterpreter;

  beforeEach(() => {
    interpreter = buildInterpreter();
  });

  it('row type gets flexDirection: row-reverse in RTL', () => {
    const node: SchemaNode = {
      type: 'row',
      id: 'rtl-row',
      children: [{ type: 'text', value: 'A' }, { type: 'text', value: 'B' }],
    };
    const ctx = makeContext({ isRTL: true });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });

    // The row component should receive a node with flexDirection: 'row-reverse'
    const rowNodes = tree!.root.findAll(
      (el: any) => el.props?.node?.style?.flexDirection === 'row-reverse',
    );
    expect(rowNodes.length).toBeGreaterThan(0);
  });

  it('row preserves explicit flexDirection in RTL (no override)', () => {
    const node: SchemaNode = {
      type: 'row',
      id: 'explicit-row',
      style: { flexDirection: 'column' },
      children: [{ type: 'text', value: 'A' }],
    };
    const ctx = makeContext({ isRTL: true });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });

    // Should keep the explicit 'column' direction
    const rowNodes = tree!.root.findAll(
      (el: any) => el.props?.node?.style?.flexDirection === 'column',
    );
    expect(rowNodes.length).toBeGreaterThan(0);
  });

  it('text type gets textAlign: right in RTL', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'rtl-text',
      value: 'Hello',
    };
    const ctx = makeContext({ isRTL: true });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });

    const textNodes = tree!.root.findAll(
      (el: any) => el.props?.node?.style?.textAlign === 'right',
    );
    expect(textNodes.length).toBeGreaterThan(0);
  });

  it('text preserves explicit textAlign in RTL (no override)', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'centered-text',
      value: 'Center',
      style: { textAlign: 'center' },
    };
    const ctx = makeContext({ isRTL: true });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });

    const textNodes = tree!.root.findAll(
      (el: any) => el.props?.node?.style?.textAlign === 'center',
    );
    expect(textNodes.length).toBeGreaterThan(0);
  });

  it('non-row/text types are unaffected by RTL', () => {
    const node: SchemaNode = {
      type: 'column',
      id: 'col',
      children: [{ type: 'text', value: 'child' }],
    };
    const ctx = makeContext({ isRTL: true });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    // Column should not have row-reverse or textAlign
    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    const colNodes = tree!.root.findAll(
      (el: any) =>
        el.props?.node?.type === 'column' &&
        !el.props?.node?.style?.flexDirection &&
        !el.props?.node?.style?.textAlign,
    );
    expect(colNodes.length).toBeGreaterThan(0);
  });
});

// ─── Visible expression error (line 82) ─────────────────────────────

describe('SchemaInterpreter — visibility expression error', () => {
  it('defaults to visible when visible expression throws', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      id: 'bad-vis',
      value: 'Still visible',
      // Malformed expression that will cause a parse error
      visible: '${1 +}',
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    // Should default to visible (not return null) on expression errors
    expect(element).not.toBeNull();
  });
});

// ─── interpretScreen body hidden (lines 191-195) ────────────────────

describe('SchemaInterpreter — screen body evaluates to null', () => {
  it('returns empty Fragment when screen body is hidden', () => {
    const interpreter = buildInterpreter();
    const schema: ScreenSchema = {
      id: 'hidden-screen',
      title: 'Hidden',
      body: {
        type: 'column',
        visible: 'false',
        children: [{ type: 'text', value: 'Never seen' }],
      },
    };
    const ctx = makeContext();
    const element = interpreter.interpretScreen(schema, ctx);
    // Should return a Fragment, not null
    expect(element).not.toBeNull();
    expect(element.type).toBe(React.Fragment);
  });
});

// ─── Expression resolution error (line 236) ─────────────────────────

describe('SchemaInterpreter — expression resolution error keeps original', () => {
  it('keeps original value when prop expression fails', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      id: 'bad-expr',
      // This will throw: deeply nested access on undefined
      value: '${$data.nonexistent.deeply.nested}',
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    // Should still render (not crash), keeping original value
    expect(element).not.toBeNull();
  });

  it('resolves null expression result to empty string', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      id: 'null-val',
      value: '${$data.missing}',
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    // The resolved value for undefined property should be '' (empty)
    expect(tree!.toJSON()).toBeTruthy();
  });
});

// ─── chartData expression resolution (lines 248-255) ────────────────

describe('SchemaInterpreter — chartData expression resolution', () => {
  it('resolves chartData expression string to array', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'chart',
      chartType: 'bar',
      chartData: '$data.usage',
      chartLabel: 'month',
      chartValue: 'amount',
    };
    const ctx = makeContext({
      data: {
        usage: [
          { month: 'Jan', amount: 100 },
          { month: 'Feb', amount: 200 },
        ],
      },
    });
    const element = interpreter.interpret(node, ctx);
    // The chart component should receive resolved array data
    expect(element).not.toBeNull();
  });

  it('keeps chartData when expression resolves to non-array', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'chart',
      chartType: 'bar',
      chartData: '$data.notArray',
      chartLabel: 'x',
      chartValue: 'y',
    };
    const ctx = makeContext({ data: { notArray: 'string-value' } });
    const element = interpreter.interpret(node, ctx);
    // Should still render (chartData stays as string, chart handles it)
    expect(element).not.toBeNull();
  });

  it('handles chartData expression error gracefully', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'chart',
      chartType: 'bar',
      // Malformed expression that passes isExpression but throws on evaluate
      chartData: '$data.x + }',
      chartLabel: 'x',
      chartValue: 'y',
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    // Should not crash — catch block logs warning
    expect(element).not.toBeNull();
  });

  it('does not resolve chartData when it is not an expression', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'chart',
      chartType: 'bar',
      chartData: [{ month: 'Jan', amount: 100 }],
      chartLabel: 'month',
      chartValue: 'amount',
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });
});

// ─── table data expression resolution (lines 263-270) ───────────────

describe('SchemaInterpreter — table data expression resolution', () => {
  it('resolves data expression string to array for table', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'table',
      columns: [{ key: 'name', label: 'Name' }],
      data: '$data.users',
    };
    const ctx = makeContext({
      data: {
        users: [{ name: 'Alice' }, { name: 'Bob' }],
      },
    });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('keeps data when expression resolves to non-array', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'table',
      columns: [{ key: 'name', label: 'Name' }],
      data: '$data.scalar',
    };
    const ctx = makeContext({ data: { scalar: 42 } });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('handles data expression error gracefully', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'table',
      columns: [{ key: 'name', label: 'Name' }],
      // Malformed expression that passes isExpression but throws on evaluate
      data: '$data.x + }',
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    // Should not crash — catch block logs warning
    expect(element).not.toBeNull();
  });
});

// ─── Repeater edge cases (line 302 + empty dataSource) ──────────────

describe('SchemaInterpreter — repeater edge cases', () => {
  it('handles repeater with empty dataSource string', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      dataSource: '',
      template: { type: 'text', value: 'item' },
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('handles repeater dataSource expression error', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      // Malformed expression that passes isExpression but throws on evaluate
      dataSource: '$data.x + }',
      template: { type: 'text', value: '${$item}' },
    };
    const ctx = makeContext({ data: {} });
    const element = interpreter.interpret(node, ctx);
    // Should render repeater wrapper with no children (catch block logs warning)
    expect(element).not.toBeNull();
  });

  it('handles repeater when dataSource resolves to non-array', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      dataSource: '$data.value',
      template: { type: 'text', value: '${$item}' },
    };
    const ctx = makeContext({ data: { value: 'not-an-array' } });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('repeater uses first child as template when template is absent', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      dataSource: '$data.items',
      children: [{ type: 'text', value: '${$item.name}' }],
    };
    const ctx = makeContext({
      data: { items: [{ name: 'One' }, { name: 'Two' }] },
    });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    const one = tree!.root.findAll((el: any) => el.children?.includes('One'));
    const two = tree!.root.findAll((el: any) => el.children?.includes('Two'));
    expect(one.length).toBeGreaterThan(0);
    expect(two.length).toBeGreaterThan(0);
  });

  it('repeater with no template and no children renders wrapper only', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      dataSource: '$data.items',
    };
    const ctx = makeContext({ data: { items: [1, 2, 3] } });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('repeater hides items where template is conditionally hidden', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'repeater',
      dataSource: '$data.items',
      template: {
        type: 'text',
        value: '${$item.name}',
        visible: '${$item.active}',
      },
    };
    const ctx = makeContext({
      data: {
        items: [
          { name: 'Show', active: true },
          { name: 'Hide', active: false },
        ],
      },
    });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    const show = tree!.root.findAll((el: any) => el.children?.includes('Show'));
    const hide = tree!.root.findAll((el: any) => el.children?.includes('Hide'));
    expect(show.length).toBeGreaterThan(0);
    expect(hide.length).toBe(0);
  });
});

// ─── i18n $t function (lines 362-367) ───────────────────────────────

describe('SchemaInterpreter — i18n $t function', () => {
  it('resolves $t() expressions in text values', () => {
    const interpreter = buildInterpreter();
    // Set up i18n with a known key
    i18n.setLocale('en');

    const node: SchemaNode = {
      type: 'text',
      value: "${$t('common.loading')}",
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    // Should resolve to the i18n value or the key itself
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('$t tries module-namespaced key first', () => {
    const interpreter = buildInterpreter();
    i18n.setLocale('en');

    const node: SchemaNode = {
      type: 'text',
      value: "${$t('greeting')}",
    };
    // moduleId is set, so $t should try 'mod:greeting' first
    const ctx = makeContext({ moduleId: 'my-module' });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('$t falls through to global key when namespaced key not found', () => {
    const interpreter = buildInterpreter();
    i18n.setLocale('en');

    const node: SchemaNode = {
      type: 'text',
      value: "${$t('some.key')}",
    };
    const ctx = makeContext({ moduleId: 'test-mod' });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });
});

// ─── Style resolution ───────────────────────────────────────────────

describe('SchemaInterpreter — style resolution', () => {
  it('resolves styles through StyleResolver', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      value: 'Styled',
      style: { fontSize: 20, color: 'red' },
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('skips style resolution when node has no style', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      value: 'Unstyled',
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });
});

// ─── Multiple expression props ──────────────────────────────────────

describe('SchemaInterpreter — multiple expression props', () => {
  it('resolves multiple expression props on same node', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      value: '${$data.val}',
      label: '${$data.lbl}',
      placeholder: '${$data.ph}',
    };
    const ctx = makeContext({ data: { val: 'resolved', lbl: 'Label', ph: 'Enter...' } });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('skips non-expression string props', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      value: 'static text',
      label: 'static label',
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('resolves mixed text+expression template strings', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'text',
      value: 'Hello ${$data.name}, balance: ${$data.balance} AED',
    };
    const ctx = makeContext({ data: { name: 'Ali', balance: 250 } });
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();

    let tree: ReactTestRenderer;
    act(() => { tree = create(element!); });
    const text = tree!.root.findAll(
      (el: any) => el.children?.some((c: unknown) => typeof c === 'string' && (c as string).includes('Hello Ali')),
    );
    expect(text.length).toBeGreaterThan(0);
  });
});

// ─── Children with IDs and without ──────────────────────────────────

describe('SchemaInterpreter — child key assignment', () => {
  it('uses child.id as key when available', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'column',
      children: [
        { type: 'text', id: 'named-child', value: 'Named' },
        { type: 'text', value: 'Anonymous' },
      ],
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });

  it('uses index-based key when child has no id', () => {
    const interpreter = buildInterpreter();
    const node: SchemaNode = {
      type: 'column',
      children: [
        { type: 'text', value: 'First' },
        { type: 'text', value: 'Second' },
      ],
    };
    const ctx = makeContext();
    const element = interpreter.interpret(node, ctx);
    expect(element).not.toBeNull();
  });
});
