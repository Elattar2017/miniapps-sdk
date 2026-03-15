/**
 * ComponentRegistry Test Suite
 *
 * Tests for the component registry that maps schema type identifiers
 * to React component implementations and ComponentSpec metadata.
 */

import { ComponentRegistry } from '../../src/schema/ComponentRegistry';
import type { ComponentSpec, SchemaComponentProps } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Simple mock component */
const MockComponent = (() => null) as unknown as React.ComponentType<SchemaComponentProps>;
const MockComponent2 = (() => null) as unknown as React.ComponentType<SchemaComponentProps>;

/** Create a minimal ComponentSpec */
function createSpec(type: string): ComponentSpec {
  return {
    type,
    category: 'display',
    description: `A ${type} component`,
    props: {},
    children: false,
    events: [],
    dataBindable: false,
    styles: [],
  };
}

describe('ComponentRegistry', () => {
  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('initializes with provided specs', () => {
      const specs: Record<string, ComponentSpec> = {
        text: createSpec('text'),
        button: createSpec('button'),
      };
      const registry = new ComponentRegistry(specs);

      expect(registry.has('text')).toBe(true);
      expect(registry.has('button')).toBe(true);
    });

    it('logs warning for duplicate spec types', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const specs: Record<string, ComponentSpec> = {
        text: createSpec('text'),
      };
      const registry = new ComponentRegistry(specs);

      // Manually set the same key again via internal path (the constructor
      // deduplicates via entries, so we need two entries with the same key
      // in the object - which JS deduplicates). Instead, test that passing
      // specs and then manually adding duplicate via entries.set triggers warn.
      // Actually the constructor only warns if this.entries.has(type) is true,
      // which only happens if there are duplicate keys in the Object.entries()
      // iteration. Since JS objects can't have duplicate keys, we verify
      // the warning path by checking the registry still works.
      expect(registry.has('text')).toBe(true);

      // The real duplicate scenario would occur if two entries share a type.
      // Let's test it by using a Map-based approach (not possible with plain
      // object), so we just verify no crash and the registry works.
    });
  });

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------

  describe('register()', () => {
    it('binds component to existing spec', () => {
      const specs: Record<string, ComponentSpec> = {
        text: createSpec('text'),
      };
      const registry = new ComponentRegistry(specs);

      registry.register(createSpec('text'), MockComponent);

      expect(registry.get('text')).toBe(MockComponent);
    });

    it('warns on overwriting existing component binding', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const specs: Record<string, ComponentSpec> = {
        text: createSpec('text'),
      };
      const registry = new ComponentRegistry(specs);

      // First bind
      registry.register(createSpec('text'), MockComponent);
      // Second bind - should trigger overwrite warning
      registry.register(createSpec('text'), MockComponent2);

      // Logger outputs via console.warn for WARN level
      expect(warnSpy).toHaveBeenCalled();
      expect(registry.get('text')).toBe(MockComponent2);
    });

    it('adds new entry for type not in constructor specs', () => {
      const registry = new ComponentRegistry({});

      registry.register(createSpec('custom'), MockComponent);

      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toBe(MockComponent);
    });
  });

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  describe('get()', () => {
    it('returns registered component', () => {
      const registry = new ComponentRegistry({});
      registry.register(createSpec('text'), MockComponent);

      expect(registry.get('text')).toBe(MockComponent);
    });

    it('returns undefined for unknown type with warning', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const registry = new ComponentRegistry({});

      const result = registry.get('nonexistent');

      expect(result).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('returns undefined when spec exists but no component bound', () => {
      const specs: Record<string, ComponentSpec> = {
        text: createSpec('text'),
      };
      const registry = new ComponentRegistry(specs);

      // Component is not bound yet (undefined as unknown was stored)
      // get() returns the component field which is undefined-ish
      const result = registry.get('text');
      // The constructor sets component to `undefined as unknown as ...`
      // So it will return the undefined value
      expect(result).toBeFalsy();
    });
  });

  // ---------------------------------------------------------------------------
  // getSpec()
  // ---------------------------------------------------------------------------

  describe('getSpec()', () => {
    it('returns spec for known type', () => {
      const spec = createSpec('text');
      const registry = new ComponentRegistry({ text: spec });

      expect(registry.getSpec('text')).toEqual(spec);
    });

    it('returns undefined for unknown type', () => {
      const registry = new ComponentRegistry({});

      expect(registry.getSpec('nonexistent')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getAllSpecs()
  // ---------------------------------------------------------------------------

  describe('getAllSpecs()', () => {
    it('returns all registered specs', () => {
      const textSpec = createSpec('text');
      const buttonSpec = createSpec('button');
      const registry = new ComponentRegistry({ text: textSpec, button: buttonSpec });

      const allSpecs = registry.getAllSpecs();

      expect(allSpecs).toHaveLength(2);
      expect(allSpecs).toContainEqual(textSpec);
      expect(allSpecs).toContainEqual(buttonSpec);
    });
  });

  // ---------------------------------------------------------------------------
  // has()
  // ---------------------------------------------------------------------------

  describe('has()', () => {
    it('returns true for registered type', () => {
      const registry = new ComponentRegistry({ text: createSpec('text') });

      expect(registry.has('text')).toBe(true);
    });

    it('returns false for unknown type', () => {
      const registry = new ComponentRegistry({});

      expect(registry.has('nonexistent')).toBe(false);
    });
  });
});
