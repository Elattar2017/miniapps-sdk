/**
 * Schema System - Barrel exports for the schema interpreter subsystem
 * @module schema
 *
 * Exports:
 * - SchemaInterpreter: Converts JSON schema trees into React component trees
 * - ComponentRegistry: Maps component type strings to React components
 * - COMPONENT_SPECS: Single source of truth for all component specifications
 * - StyleResolver: Resolves styles with $theme token references
 * - ExpressionEngine: Safe expression evaluation (recursive descent parser)
 * - ValidationEngine: Declarative form field validation
 * - All 15 built-in component implementations
 */

// Core classes
export { SchemaInterpreter } from './SchemaInterpreter';
export { ComponentRegistry } from './ComponentRegistry';
export { StyleResolver } from './StyleResolver';
export { ExpressionEngine } from './ExpressionEngine';
export { ValidationEngine } from './ValidationEngine';
export type { ValidationResult } from './ValidationEngine';

// Component specifications (single source of truth)
export {
  COMPONENT_SPECS,
  getComponentSpec,
  getAllComponentSpecs,
} from './ComponentSpecs';

// Built-in component implementations
export {
  TextComponent,
  InputComponent,
  ButtonComponent,
  ImageComponent,
  RowComponent,
  ColumnComponent,
  CardComponent,
  ScrollComponent,
  RepeaterComponent,
  ConditionalComponent,
  SpacerComponent,
  DividerComponent,
  BadgeComponent,
  IconComponent,
  LoadingComponent,
} from './components';
