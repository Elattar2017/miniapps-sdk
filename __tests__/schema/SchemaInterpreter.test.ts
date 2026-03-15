/**
 * SchemaInterpreter Test Suite
 * Tests schema-to-React rendering pipeline including component lookup,
 * conditional visibility, recursive children, and unknown types.
 */

import React from 'react';
import { SchemaInterpreter } from '../../src/schema/SchemaInterpreter';
import { ExpressionEngine } from '../../src/schema/ExpressionEngine';
import type { ComponentRegistry } from '../../src/schema/ComponentRegistry';
import type { StyleResolver } from '../../src/schema/StyleResolver';
import type { SchemaNode, RenderContext, SchemaComponentProps } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

/** Simple test component that renders a div-like element */
function MockTextComponent(props: SchemaComponentProps): React.ReactElement {
  return React.createElement('mock-text', { id: props.node.id }, props.node.props?.text as string);
}

function MockColumnComponent(props: SchemaComponentProps): React.ReactElement {
  return React.createElement('mock-column', { id: props.node.id }, props.children);
}

function MockRowComponent(props: SchemaComponentProps): React.ReactElement {
  return React.createElement('mock-row', { id: props.node.id }, props.children);
}

/** Create a mock ComponentRegistry */
function createMockRegistry(): ComponentRegistry {
  const components = new Map<string, React.ComponentType<SchemaComponentProps>>();
  components.set('text', MockTextComponent as React.ComponentType<SchemaComponentProps>);
  components.set('column', MockColumnComponent as React.ComponentType<SchemaComponentProps>);
  components.set('row', MockRowComponent as React.ComponentType<SchemaComponentProps>);

  return {
    get(type: string): React.ComponentType<SchemaComponentProps> | undefined {
      return components.get(type);
    },
    register: jest.fn(),
    getSpec: jest.fn(),
    getAllSpecs: jest.fn().mockReturnValue([]),
    has(type: string): boolean {
      return components.has(type);
    },
  } as unknown as ComponentRegistry;
}

/** Create a mock StyleResolver */
function createMockStyleResolver(): StyleResolver {
  return {
    resolve(style: Record<string, unknown>): Record<string, unknown> {
      return style;
    },
  } as unknown as StyleResolver;
}

/** Create a default render context */
function createRenderContext(overrides?: Partial<RenderContext>): RenderContext {
  return {
    tenantId: 'test-tenant',
    moduleId: 'com.test.module',
    screenId: 'home',
    data: {},
    state: {},
    user: { id: 'user-1' },
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

describe('SchemaInterpreter', () => {
  let interpreter: SchemaInterpreter;
  let expressionEngine: ExpressionEngine;
  let registry: ComponentRegistry;
  let styleResolver: StyleResolver;

  beforeEach(() => {
    expressionEngine = new ExpressionEngine();
    registry = createMockRegistry();
    styleResolver = createMockStyleResolver();
    interpreter = new SchemaInterpreter(registry, expressionEngine, styleResolver);
  });

  it('should render a text component', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'title',
      props: { text: 'Hello World' },
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).not.toBeNull();
    expect(element!.type).toBe(MockTextComponent);
  });

  it('should handle conditional visibility (hidden)', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'hidden-text',
      props: { text: 'You cannot see me' },
      visible: 'false',
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).toBeNull();
  });

  it('should handle conditional visibility (visible)', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'visible-text',
      props: { text: 'I am visible' },
      visible: 'true',
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).not.toBeNull();
  });

  it('should handle conditional visibility with data-driven expression', () => {
    const node: SchemaNode = {
      type: 'text',
      id: 'conditional-text',
      props: { text: 'Premium only' },
      visible: '$data.isPremium',
    };

    // Not premium
    const hiddenResult = interpreter.interpret(
      node,
      createRenderContext({ data: { isPremium: false } }),
    );
    expect(hiddenResult).toBeNull();

    // Premium
    const visibleResult = interpreter.interpret(
      node,
      createRenderContext({ data: { isPremium: true } }),
    );
    expect(visibleResult).not.toBeNull();
  });

  it('should render children recursively', () => {
    const node: SchemaNode = {
      type: 'column',
      id: 'parent',
      children: [
        {
          type: 'text',
          id: 'child-1',
          props: { text: 'First' },
        },
        {
          type: 'text',
          id: 'child-2',
          props: { text: 'Second' },
        },
      ],
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).not.toBeNull();
    // The element should be a column with children
    expect(element!.type).toBe(MockColumnComponent);
  });

  it('should return null for unknown component types', () => {
    const node: SchemaNode = {
      type: 'unknown-widget',
      id: 'mystery',
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).toBeNull();
  });

  it('should render a complete screen', () => {
    const schema = {
      id: 'home-screen',
      title: 'Home',
      body: {
        type: 'column',
        id: 'root',
        children: [
          {
            type: 'text',
            id: 'greeting',
            props: { text: 'Welcome' },
          },
          {
            type: 'row',
            id: 'actions',
            children: [
              {
                type: 'text',
                id: 'action-1',
                props: { text: 'Action 1' },
              },
            ],
          },
        ],
      },
    };

    const context = createRenderContext();
    const element = interpreter.interpretScreen(schema, context);

    expect(element).not.toBeNull();
    expect(element.type).toBe(MockColumnComponent);
  });

  it('should throw when screen has no body', () => {
    const schema = {
      id: 'empty-screen',
      title: 'Empty',
      body: undefined as unknown as SchemaNode,
    };

    const context = createRenderContext();
    expect(() => interpreter.interpretScreen(schema, context)).toThrow('no body');
  });

  it('should skip hidden children but render visible siblings', () => {
    const node: SchemaNode = {
      type: 'column',
      id: 'container',
      children: [
        {
          type: 'text',
          id: 'visible-child',
          props: { text: 'I show up' },
          visible: 'true',
        },
        {
          type: 'text',
          id: 'hidden-child',
          props: { text: 'I am hidden' },
          visible: 'false',
        },
      ],
    };

    const context = createRenderContext();
    const element = interpreter.interpret(node, context);

    expect(element).not.toBeNull();
    // The column should still render (with only the visible child)
    expect(element!.type).toBe(MockColumnComponent);
  });
});
