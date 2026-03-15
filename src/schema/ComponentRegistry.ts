/**
 * Component Registry - Maps component type strings to React components
 * @module schema/ComponentRegistry
 *
 * Maintains a mapping from schema type identifiers (e.g. "text", "button")
 * to their React component implementations and ComponentSpec metadata.
 * The registry is initialised with built-in specs and can be extended at
 * runtime for custom components registered by module developers.
 */

import React from 'react';
import { logger } from '../utils/logger';
import type {
  ComponentSpec,
  IComponentRegistry,
  SchemaComponentProps,
} from '../types';

const registryLogger = logger.child({ component: 'ComponentRegistry' });

/** Internal entry stored for each registered component */
interface RegistryEntry {
  spec: ComponentSpec;
  component: React.ComponentType<SchemaComponentProps>;
}

export class ComponentRegistry implements IComponentRegistry {
  private readonly entries: Map<string, RegistryEntry> = new Map();

  /**
   * Creates a new ComponentRegistry.
   *
   * @param specs - Component specifications to register. Components are
   *   registered without an implementation; call `register()` to bind a
   *   React component to each spec.
   */
  constructor(specs: Record<string, ComponentSpec>) {
    for (const [type, spec] of Object.entries(specs)) {
      if (this.entries.has(type)) {
        registryLogger.warn(`Duplicate component spec for type "${type}" - skipping`, { type });
        continue;
      }

      // Store the spec without a component initially.  The SchemaInterpreter
      // or init routine will call `register()` to bind implementations.
      this.entries.set(type, {
        spec,
        component: undefined as unknown as React.ComponentType<SchemaComponentProps>,
      });
    }

    registryLogger.debug(`ComponentRegistry initialised with ${this.entries.size} specs`);
  }

  /**
   * Register (or replace) the React component for a given spec.
   * If the spec has not been registered yet it will be added.
   */
  register(spec: ComponentSpec, component: React.ComponentType<SchemaComponentProps>): void {
    const existing = this.entries.get(spec.type);

    if (existing && existing.component) {
      registryLogger.warn(`Overwriting existing component for type "${spec.type}"`);
    }

    this.entries.set(spec.type, { spec, component });
    registryLogger.debug(`Registered component for type "${spec.type}"`);
  }

  /**
   * Retrieve the React component for the given schema type.
   * Returns `undefined` if the type has no bound component.
   */
  get(type: string): React.ComponentType<SchemaComponentProps> | undefined {
    const entry = this.entries.get(type);
    if (!entry) {
      registryLogger.warn(`No registry entry for component type "${type}"`);
      return undefined;
    }
    return entry.component;
  }

  /**
   * Retrieve the specification for the given schema type.
   */
  getSpec(type: string): ComponentSpec | undefined {
    return this.entries.get(type)?.spec;
  }

  /**
   * Return all registered ComponentSpecs.
   */
  getAllSpecs(): ComponentSpec[] {
    return Array.from(this.entries.values()).map((entry) => entry.spec);
  }

  /**
   * Check whether a component type has been registered (spec or component).
   */
  has(type: string): boolean {
    return this.entries.has(type);
  }
}
