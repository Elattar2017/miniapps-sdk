/**
 * Style Resolver - Resolves styles with $theme token references and security filtering
 * @module schema/StyleResolver
 *
 * Responsibilities:
 * 1. Filter style properties against the ALLOWED_STYLE_PROPERTIES whitelist
 *    so that modules cannot inject dangerous CSS/layout overrides.
 * 2. Resolve `$theme.*` token references (e.g. `$theme.colors.primary`)
 *    to concrete values from the current DesignTokens.
 */

import { logger } from '../utils/logger';
import { ALLOWED_STYLE_PROPERTIES } from '../types';
import type { DesignTokens } from '../types';

const styleLogger = logger.child({ component: 'StyleResolver' });

/** Set for O(1) lookup of allowed properties */
const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_STYLE_PROPERTIES);

export class StyleResolver {
  /**
   * Resolve a raw style object from a SchemaNode into a safe, concrete
   * React Native style object.
   *
   * - Properties not in the whitelist are silently dropped (with a warning log).
   * - String values starting with `$theme.` are resolved against designTokens.
   *
   * @param style - Raw style object from the schema node
   * @param designTokens - Current design tokens for theme resolution
   * @returns A filtered, resolved style object safe for RN consumption
   */
  resolve(
    style: Record<string, unknown>,
    designTokens: DesignTokens,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [property, value] of Object.entries(style)) {
      // Security filter: only allow whitelisted properties
      if (!ALLOWED_SET.has(property)) {
        styleLogger.warn(`Blocked disallowed style property "${property}"`, {
          property,
        });
        continue;
      }

      // Resolve theme token references in string values
      if (typeof value === 'string' && value.startsWith('$theme.')) {
        const resolvedValue = this.resolveTokenReference(value, designTokens);
        if (resolvedValue !== null && typeof resolvedValue === 'object' && !Array.isArray(resolvedValue)) {
          // Object tokens (e.g. shadows) are spread into the resolved styles
          Object.assign(resolved, resolvedValue);
        } else {
          resolved[property] = resolvedValue;
        }
      } else {
        resolved[property] = value;
      }
    }

    return resolved;
  }

  /**
   * Resolve a single `$theme.path.to.value` reference by navigating into
   * the DesignTokens object.
   *
   * @param value - Token reference string (e.g. `$theme.colors.primary`)
   * @param tokens - DesignTokens to resolve against
   * @returns The resolved value, or the original string if resolution fails
   */
  private resolveTokenReference(
    value: string,
    tokens: DesignTokens,
  ): unknown {
    // Strip the `$theme.` prefix and split into path segments
    const path = value.slice('$theme.'.length).split('.');

    // Walk the token tree
    let current: unknown = tokens;

    for (const segment of path) {
      if (current == null || typeof current !== 'object') {
        styleLogger.warn(
          `Unable to resolve theme token "${value}" - path segment "${segment}" not found`,
          { tokenRef: value },
        );
        return value; // return original string as fallback
      }

      current = (current as Record<string, unknown>)[segment];
    }

    if (current === undefined) {
      styleLogger.warn(`Theme token "${value}" resolved to undefined`, {
        tokenRef: value,
      });
      return value; // return original string as fallback
    }

    return current;
  }
}
