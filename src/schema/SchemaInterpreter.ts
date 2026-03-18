/**
 * Schema Interpreter - Converts JSON schema trees into React component trees
 * @module schema/SchemaInterpreter
 *
 * The core rendering pipeline of the SDK. Takes a SchemaNode tree (parsed
 * from module JSON) and produces a React element tree by:
 *
 * 1. Evaluating `visible` expressions to conditionally include/exclude nodes
 * 2. Resolving all expression-bearing props ($data, $state, ${...})
 * 3. Looking up the correct React component from the ComponentRegistry
 * 4. Resolving styles through the StyleResolver (theme tokens, security filter)
 * 5. Handling repeater template cloning with $item/$index injection
 * 6. Recursively interpreting child nodes
 * 7. Passing SchemaComponentProps to each component (with pre-resolved values)
 */

import React from 'react';
import { logger } from '../utils/logger';
import { SDKError } from '../kernel/errors/SDKError';
import type {
  SchemaNode,
  ScreenSchema,
  ISchemaInterpreter,
  RenderContext,
  SchemaComponentProps,
} from '../types';

import type { ComponentRegistry } from './ComponentRegistry';
import type { ExpressionEngine } from './ExpressionEngine';
import type { StyleResolver } from './StyleResolver';
import { i18n } from '../i18n';

const interpreterLogger = logger.child({ component: 'SchemaInterpreter' });

/** String-typed props on SchemaNode that may contain expressions */
const EXPRESSION_PROPS: ReadonlyArray<keyof SchemaNode> = [
  'value',
  'placeholder',
  'label',
  'source',
  'alt',
  'emptyMessage',
  'disabled',
  'loading',
  'color',
  'name',
  'loadingText',
  'progress',
  'title',
  'subtitle',
  'chartTitle',
  'gaugeValue',
  'gaugeMax',
  'gaugeUnit',
  'badge',
  'activeTab',
  'isOpen',
  // Stepper
  'nextLabel',
  'prevLabel',
  'submitLabel',
  'completedIcon',
  // Calendar
  'timeSlotsTitle',
  'slotEmptyMessage',
];

export class SchemaInterpreter implements ISchemaInterpreter {
  private readonly registry: ComponentRegistry;
  private readonly expressionEngine: ExpressionEngine;
  private readonly styleResolver: StyleResolver;

  constructor(
    registry: ComponentRegistry,
    expressionEngine: ExpressionEngine,
    styleResolver: StyleResolver,
  ) {
    this.registry = registry;
    this.expressionEngine = expressionEngine;
    this.styleResolver = styleResolver;
  }

  /**
   * Interpret a single SchemaNode into a React element (or null if hidden).
   *
   * @param node - The schema node to render
   * @param context - Current render context (data, state, tokens, etc.)
   * @returns A React element, or null if the node is hidden
   */
  interpret(node: SchemaNode, context: RenderContext): React.ReactElement | null {
    const exprContext = this.buildExpressionContext(context);

    // 1. Evaluate visibility expression
    if (node.visible !== undefined) {
      try {
        const visible = this.expressionEngine.evaluate(node.visible, exprContext);
        if (!visible) {
          return null;
        }
      } catch (error: unknown) {
        interpreterLogger.warn(
          `Failed to evaluate visible expression "${node.visible}" - defaulting to visible`,
          {
            nodeId: node.id,
            nodeType: node.type,
            error: error instanceof Error ? error.message : String(error),
          },
        );
        // Default to visible on expression errors so content is not silently lost
      }
    }

    // 2. Resolve all expression-bearing props on the node
    const resolvedNode = this.resolveNodeExpressions(node, exprContext);

    // 3. Look up the component from the registry
    const Component = this.registry.get(resolvedNode.type);
    if (!Component) {
      interpreterLogger.warn(
        `No component registered for type "${resolvedNode.type}" - skipping node`,
        { nodeId: resolvedNode.id, nodeType: resolvedNode.type },
      );
      return null;
    }

    // 4. Resolve styles
    const resolvedStyle = resolvedNode.style
      ? this.styleResolver.resolve(
          resolvedNode.style as Record<string, unknown>,
          context.designTokens,
        )
      : undefined;

    let styledNode: SchemaNode = resolvedStyle
      ? { ...resolvedNode, style: resolvedStyle }
      : resolvedNode;

    // 4b. RTL-aware layout adjustments
    if (context.isRTL) {
      if (styledNode.type === 'row') {
        const currentStyle = (styledNode.style ?? {}) as Record<string, unknown>;
        if (!currentStyle.flexDirection) {
          styledNode = { ...styledNode, style: { ...currentStyle, flexDirection: 'row-reverse' } };
        }
      } else if (styledNode.type === 'text') {
        const currentStyle = (styledNode.style ?? {}) as Record<string, unknown>;
        if (!currentStyle.textAlign) {
          styledNode = { ...styledNode, style: { ...currentStyle, textAlign: 'right' } };
        }
      }
    }

    // 5. Handle repeater: clone template per data item
    if (node.type === 'repeater') {
      return this.interpretRepeater(styledNode, context, Component);
    }

    // 5b. Handle calendar with time_slot template child
    if (node.type === 'calendar') {
      const slotTemplateNode = node.children?.find(c => c.type === 'time_slot');
      if (slotTemplateNode) {
        const slotsRaw = (resolvedNode as unknown as Record<string, unknown>).timeSlots;
        if (Array.isArray(slotsRaw)) {
          const timeField = (slotTemplateNode.timeField ?? slotTemplateNode.props?.timeField ?? 'time') as string;
          const availableField = (slotTemplateNode.availableField ?? slotTemplateNode.props?.availableField ?? 'available') as string;

          // Get selected time from state for _selected injection
          const rawBindKey = (resolvedNode.props?.value ?? '').toString().replace('$state.', '');
          const calValue = rawBindKey ? context.state[rawBindKey] as Record<string, unknown> | string | undefined : undefined;
          const selectedTime = typeof calValue === 'object' && calValue ? String(calValue.time ?? '') : '';

          // Get color props from calendar for _textColor/_bgColor injection
          const primaryColor = context.designTokens?.colors?.primary ?? '#3B82F6';
          const slotSelectedColor = ((resolvedNode as unknown as Record<string, unknown>).slotSelectedColor ?? primaryColor) as string;
          const slotSelectedTextColor = ((resolvedNode as unknown as Record<string, unknown>).slotSelectedTextColor ?? '#FFFFFF') as string;
          const slotAvailableColor = ((resolvedNode as unknown as Record<string, unknown>).slotAvailableColor ?? '#F3F4F6') as string;
          const slotAvailableTextColor = ((resolvedNode as unknown as Record<string, unknown>).slotAvailableTextColor ?? context.designTokens?.colors?.text ?? '#374151') as string;
          const slotUnavailableColor = ((resolvedNode as unknown as Record<string, unknown>).slotUnavailableColor ?? '#E5E7EB') as string;
          const slotUnavailableTextColor = ((resolvedNode as unknown as Record<string, unknown>).slotUnavailableTextColor ?? '#9CA3AF') as string;
          const fewLeftColor = ((resolvedNode as unknown as Record<string, unknown>).fewLeftColor ?? '#F59E0B') as string;

          const expressionEngine = this.expressionEngine;

          const slotElements = slotsRaw.map((slotData: unknown, idx: number) => {
            const slot = slotData as Record<string, unknown>;
            const timeVal = String(slot[timeField] ?? '');
            const availVal = slot[availableField];
            const isAvailable = typeof availVal === 'boolean' ? availVal : (typeof availVal === 'number' ? availVal > 0 : true);
            const isSelected = timeVal === selectedTime;
            const isDisabled = !isAvailable;
            const remaining = typeof slot.remaining === 'number' ? slot.remaining : undefined;
            const isFewLeft = remaining !== undefined && remaining > 0 && remaining <= 2;

            // Determine colors
            let textColor = slotAvailableTextColor;
            let bgColor = slotAvailableColor;
            if (isSelected) { textColor = slotSelectedTextColor; bgColor = slotSelectedColor; }
            else if (isDisabled) { textColor = slotUnavailableTextColor; bgColor = slotUnavailableColor; }
            else if (isFewLeft) { bgColor = fewLeftColor; }

            // Inject auto-computed fields into slot data
            const enrichedSlot = {
              ...slot,
              _selected: isSelected,
              _disabled: isDisabled,
              _textColor: textColor,
              _bgColor: bgColor,
              _index: idx,
            };

            const slotContext: RenderContext = {
              ...context,
              item: enrichedSlot,
              index: idx,
              onAction: (action) => {
                const resolved = expressionEngine.resolveObjectExpressions(
                  action as unknown as Record<string, unknown>,
                  { slot: enrichedSlot, item: enrichedSlot, index: idx },
                ) as unknown as typeof action;
                context.onAction(resolved);
              },
            };

            const element = this.interpret(slotTemplateNode, slotContext);
            if (!element) return null;
            return React.cloneElement(element, { key: `slot-tmpl-${idx}` });
          }).filter(Boolean);

          // Pass slot elements as children, tag node so CalendarComponent knows they're template-rendered
          const taggedNode: SchemaNode = { ...styledNode, _hasSlotTemplate: true };
          const componentProps: SchemaComponentProps = {
            node: taggedNode,
            context,
            children: slotElements,
          };

          return React.createElement(
            Component,
            { ...componentProps, key: styledNode.id ?? 'node-calendar' },
            slotElements,
          );
        }
      }
    }

    // 6. Recursively interpret children
    //    For 'conditional' nodes, Prisma MySQL JSON may move single-child arrays
    //    into a 'then' field — normalize back to children before rendering.
    let childElements: React.ReactNode = undefined;
    let effectiveChildren = node.children;
    const nodeThen = (node as unknown as Record<string, unknown>).then;
    // For conditional nodes, Prisma MySQL JSON normalization may place the real
    // content tree in `then` while leaving a stale/empty `children` array.
    // Always prefer `then` when it exists on conditional nodes.
    if (nodeThen) {
      if (node.type === 'conditional') {
        effectiveChildren = [nodeThen as SchemaNode];
      } else if (!effectiveChildren || effectiveChildren.length === 0) {
        effectiveChildren = [nodeThen as SchemaNode];
      }
    }
    if (effectiveChildren && effectiveChildren.length > 0) {
      childElements = effectiveChildren
        .map((child, index) => {
          const element = this.interpret(child, context);
          if (element === null) return null;
          return React.cloneElement(element, {
            key: child.id ?? `child-${index}`,
          });
        })
        .filter((el): el is React.ReactElement => el !== null);
    }

    // 7. Build component props
    const componentProps: SchemaComponentProps = {
      node: styledNode,
      context,
      children: childElements,
    };

    // 8. Create the React element
    return React.createElement(
      Component,
      { ...componentProps, key: node.id ?? `node-${node.type}` },
      childElements,
    );
  }

  /**
   * Interpret a full ScreenSchema by rendering its body node.
   *
   * @param schema - The screen schema definition
   * @param context - Current render context
   * @returns A React element representing the entire screen
   */
  interpretScreen(schema: ScreenSchema, context: RenderContext): React.ReactElement {
    if (!schema.body) {
      throw SDKError.schema('ScreenSchema has no body node', {
        context: { screenId: schema.id },
      });
    }

    // Update context with the screen id
    const screenContext: RenderContext = {
      ...context,
      screenId: schema.id,
    };

    const element = this.interpret(schema.body, screenContext);

    if (element === null) {
      interpreterLogger.warn(
        `Screen "${schema.id}" body evaluated to null (hidden). Returning empty fragment.`,
        { screenId: schema.id },
      );
      return React.createElement(React.Fragment);
    }

    return element;
  }

  /**
   * Resolve all expression-bearing string props on a SchemaNode.
   * Returns a new node with expressions replaced by their evaluated values.
   */
  private resolveNodeExpressions(
    node: SchemaNode,
    exprContext: Record<string, unknown>,
  ): SchemaNode {
    let changed = false;
    const updates: Partial<SchemaNode> = {};
    // Preserve original expression strings in node.props so components can
    // extract two-way binding keys (e.g., InputComponent, CalendarComponent
    // read node.props.value to find "$state.fieldName" for state writes).
    const preservedProps: Record<string, unknown> = { ...(node.props ?? {}) };
    let propsChanged = false;

    for (const prop of EXPRESSION_PROPS) {
      const raw = node[prop];
      if (typeof raw !== 'string') continue;
      if (!this.expressionEngine.isExpression(raw)) continue;

      // Preserve the raw expression in node.props before resolving
      if (!(prop in preservedProps)) {
        preservedProps[prop] = raw;
        propsChanged = true;
      }

      try {
        // Determine if this is a pure expression or a template with static text.
        // Pure expression: "${$data.count}" (starts with ${ and ends with })
        // Template string: "Total: ${$data.amount} AED" or "${$data.count} items"
        const isPureExpression = raw.startsWith('${') && raw.endsWith('}')
          && raw.indexOf('}') === raw.length - 1;
        let resolved: unknown;

        if (!isPureExpression && raw.includes('${')) {
          // Mixed text+expression: "Hello ${$data.name}!" -> "Hello World!"
          resolved = this.expressionEngine.resolveExpressions(raw, exprContext);
        } else {
          // Pure expression: "${$data.count}" -> 42, or "$data.count" -> 42
          resolved = this.expressionEngine.evaluate(raw, exprContext);
        }

        (updates as Record<string, unknown>)[prop] = resolved == null ? '' : resolved;
        changed = true;
      } catch (error: unknown) {
        interpreterLogger.warn(`Failed to resolve expression for ${prop}: "${raw}"`, {
          nodeId: node.id,
          nodeType: node.type,
          error: error instanceof Error ? error.message : String(error),
        });
        // Keep original value on error
      }
    }

    // Resolve data-bearing props that may be expression strings pointing to arrays
    // (e.g., chartData: '$data.usage.daily', data: '$data.usageRecords')
    if (typeof node.chartData === 'string' && this.expressionEngine.isExpression(node.chartData)) {
      try {
        const resolved = this.expressionEngine.evaluate(node.chartData, exprContext);
        if (Array.isArray(resolved)) {
          (updates as Record<string, unknown>).chartData = resolved;
          changed = true;
        }
      } catch (error: unknown) {
        interpreterLogger.warn(`Failed to resolve chartData expression: "${node.chartData}"`, {
          nodeId: node.id, nodeType: node.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (typeof node.data === 'string' && this.expressionEngine.isExpression(node.data)) {
      try {
        const resolved = this.expressionEngine.evaluate(node.data, exprContext);
        if (Array.isArray(resolved)) {
          (updates as Record<string, unknown>).data = resolved;
          changed = true;
        }
      } catch (error: unknown) {
        interpreterLogger.warn(`Failed to resolve table data expression: "${node.data}"`, {
          nodeId: node.id, nodeType: node.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Resolve calendar data-bearing props (objects and arrays from $data expressions)
    for (const calProp of ['availabilityData', 'timeSlots', 'markedDates', 'disabledDates'] as const) {
      const raw = (node as unknown as Record<string, unknown>)[calProp];
      if (typeof raw === 'string' && this.expressionEngine.isExpression(raw)) {
        try {
          const resolved = this.expressionEngine.evaluate(raw, exprContext);
          if (resolved !== undefined && resolved !== null) {
            (updates as Record<string, unknown>)[calProp] = resolved;
            changed = true;
          }
        } catch {
          // Keep as expression string — CalendarComponent handles loading state
        }
      }
    }

    if (propsChanged) {
      (updates as Record<string, unknown>).props = preservedProps;
      changed = true;
    }
    return changed ? { ...node, ...updates } : node;
  }

  /**
   * Handle repeater node: resolve dataSource, then clone template
   * per data item with $item/$index injected into context.
   */
  private interpretRepeater(
    node: SchemaNode,
    context: RenderContext,
    Component: React.ComponentType<SchemaComponentProps>,
  ): React.ReactElement {
    const exprContext = this.buildExpressionContext(context);

    // Resolve the data source array
    const rawSource = node.dataSource ?? '';
    let dataItems: unknown[] = [];

    if (typeof rawSource === 'string' && rawSource.length > 0) {
      try {
        const resolved = this.expressionEngine.evaluate(rawSource, exprContext);
        if (Array.isArray(resolved)) {
          dataItems = resolved;
        }
      } catch (error: unknown) {
        interpreterLogger.warn(`Failed to resolve repeater dataSource: "${rawSource}"`, {
          nodeId: node.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clone template for each item
    let childElements: React.ReactNode = undefined;
    const template = node.template ?? (node.children?.[0] ?? null);

    if (template && dataItems.length > 0) {
      const expressionEngine = this.expressionEngine;
      childElements = dataItems
        .map((item, index) => {
          // Create a child context with $item and $index.
          // Wrap onAction so that action configs dispatched from repeater items
          // have $item/$index references resolved (e.g., update_state value: '$item').
          const itemContext: RenderContext = {
            ...context,
            item,
            index,
            onAction: (action) => {
              const resolved = expressionEngine.resolveObjectExpressions(
                action as unknown as Record<string, unknown>,
                { item, index },
              ) as unknown as typeof action;
              context.onAction(resolved);
            },
          };

          const element = this.interpret(template, itemContext);
          if (element === null) return null;
          return React.cloneElement(element, {
            key: `repeater-item-${index}`,
          });
        })
        .filter((el): el is React.ReactElement => el !== null);
    }

    // Build the repeater wrapper with the resolved node (for emptyMessage etc.)
    const componentProps: SchemaComponentProps = {
      node,
      context,
      children: childElements,
    };

    return React.createElement(
      Component,
      { ...componentProps, key: node.id ?? 'node-repeater' },
      childElements,
    );
  }

  /**
   * Build the expression context object from the render context.
   * Maps RenderContext fields to the $-prefixed variables the
   * ExpressionEngine expects.
   */
  private buildExpressionContext(
    context: RenderContext,
  ): Record<string, unknown> {
    return {
      data: context.data,
      state: context.state,
      user: context.user,
      item: context.item,
      slot: context.item,    // alias — $slot.xxx works same as $item.xxx
      index: context.index,
      $t: (key: string) => {
        // Try module-namespaced key first, then global
        if (context.moduleId) {
          const namespacedKey = `${context.moduleId}:${key}`;
          const result = i18n.t(namespacedKey);
          if (result !== namespacedKey) return result;
        }
        return i18n.t(key);
      },
    };
  }
}
