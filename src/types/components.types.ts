/**
 * Component Types - Component specs, registry, render context
 * @module types/components
 */

import type { ScreenSchema, SchemaNode, ActionConfig } from './schema.types';
import type { DesignTokens } from './kernel.types';

/** Component specification - shared between renderer and validator */
export interface ComponentSpec {
  type: string;
  category: 'display' | 'input' | 'layout' | 'data' | 'action' | 'overlay';
  description: string;
  props: Record<string, PropSpec>;
  children: boolean;
  events: string[];
  dataBindable: boolean;
  styles: string[];
}

/** Property specification for a component */
export interface PropSpec {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'expression';
  required: boolean;
  description: string;
  defaultValue?: unknown;
  enum?: string[];
}

/** Component registry interface */
export interface IComponentRegistry {
  register(spec: ComponentSpec, component: React.ComponentType<SchemaComponentProps>): void;
  get(type: string): React.ComponentType<SchemaComponentProps> | undefined;
  getSpec(type: string): ComponentSpec | undefined;
  getAllSpecs(): ComponentSpec[];
  has(type: string): boolean;
}

/** Schema interpreter interface */
export interface ISchemaInterpreter {
  interpret(node: SchemaNode, context: RenderContext): React.ReactElement | null;
  interpretScreen(schema: ScreenSchema, context: RenderContext): React.ReactElement;
}

/** Props passed to every schema component */
export interface SchemaComponentProps {
  node: SchemaNode;
  context: RenderContext;
  children?: React.ReactNode;
}

/** Render context passed through component tree */
export interface RenderContext {
  tenantId: string;
  moduleId: string;
  screenId: string;
  data: Record<string, unknown>;
  state: Record<string, unknown>;
  user: Record<string, unknown>;
  item?: unknown;
  index?: number;
  designTokens: DesignTokens;
  onAction: (action: ActionConfig) => void;
  onStateChange: (key: string, value: unknown) => void;
  validationRules?: Record<string, import('./schema.types').ValidationRule[]>;
  validationErrors?: Record<string, string[]>;
  isRTL?: boolean;
  locale?: string;
  /** Resolve asset:// references to full URLs */
  resolveAssetUrl?: (moduleId: string, reference: string) => string | null;
  /** Whether the SDK header is visible (used by safe_area_view to avoid double top padding) */
  headerVisible?: boolean;
}

/** Allowed style properties (security whitelist) */
export const ALLOWED_STYLE_PROPERTIES = [
  // Text
  'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign',
  'textDecorationLine', 'lineHeight', 'letterSpacing',
  // Box
  'backgroundColor', 'padding', 'paddingHorizontal', 'paddingVertical',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'margin', 'marginHorizontal', 'marginVertical',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'borderWidth', 'borderColor', 'borderRadius', 'borderStyle',
  'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
  // Layout
  'flex', 'flexDirection', 'alignItems', 'alignSelf', 'justifyContent',
  'flexWrap', 'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  // Visual
  'opacity', 'elevation', 'shadowColor', 'shadowOffset',
  'shadowOpacity', 'shadowRadius', 'overflow',
] as const;

export type AllowedStyleProperty = typeof ALLOWED_STYLE_PROPERTIES[number];

/** Validation result for schema nodes */
export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

export interface SchemaValidationError {
  path: string;
  message: string;
  nodeType?: string;
}
