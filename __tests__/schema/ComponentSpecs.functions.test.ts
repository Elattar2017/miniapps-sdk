/**
 * ComponentSpecs Function Test Suite
 * Tests getComponentSpec() and getAllComponentSpecs() exports.
 */

import {
  getComponentSpec,
  getAllComponentSpecs,
  COMPONENT_SPECS,
} from '../../src/schema/ComponentSpecs';
import type { ComponentSpec } from '../../src/types';

describe('ComponentSpecs - getComponentSpec()', () => {
  it('should return the text component spec with correct type and category', () => {
    const spec = getComponentSpec('text');
    expect(spec).toBeDefined();
    expect(spec!.type).toBe('text');
    expect(spec!.category).toBe('display');
  });

  it('should return the button component spec with correct type and category', () => {
    const spec = getComponentSpec('button');
    expect(spec).toBeDefined();
    expect(spec!.type).toBe('button');
    expect(spec!.category).toBe('action');
  });

  it('should return the chart component spec with chartType and chartData props', () => {
    const spec = getComponentSpec('chart');
    expect(spec).toBeDefined();
    expect(spec!.type).toBe('chart');
    expect(spec!.props).toHaveProperty('chartType');
    expect(spec!.props).toHaveProperty('chartData');
    expect(spec!.props.chartType.required).toBe(true);
    expect(spec!.props.chartData.required).toBe(true);
  });

  it('should return undefined for an unknown component type', () => {
    const spec = getComponentSpec('unknown_type');
    expect(spec).toBeUndefined();
  });
});

describe('ComponentSpecs - getAllComponentSpecs()', () => {
  it('should return an array with 34 component specs', () => {
    const specs = getAllComponentSpecs();
    expect(Array.isArray(specs)).toBe(true);
    // 28 existing + 6 overlay (scan_frame, corner_brackets, face_guide,
    // grid_overlay, crosshair, scan_line) = 34
    expect(specs).toHaveLength(34);
  });

  it('should include specs with all required fields', () => {
    const specs = getAllComponentSpecs();
    for (const spec of specs) {
      expect(spec).toHaveProperty('type');
      expect(typeof spec.type).toBe('string');

      expect(spec).toHaveProperty('category');
      expect(['display', 'input', 'layout', 'data', 'action', 'overlay']).toContain(spec.category);

      expect(spec).toHaveProperty('description');
      expect(typeof spec.description).toBe('string');

      expect(spec).toHaveProperty('props');
      expect(typeof spec.props).toBe('object');

      expect(spec).toHaveProperty('children');
      expect(typeof spec.children).toBe('boolean');

      expect(spec).toHaveProperty('events');
      expect(Array.isArray(spec.events)).toBe(true);

      expect(spec).toHaveProperty('dataBindable');
      expect(typeof spec.dataBindable).toBe('boolean');

      expect(spec).toHaveProperty('styles');
      expect(Array.isArray(spec.styles)).toBe(true);
    }
  });

  it('should contain at least one spec from each category', () => {
    const specs = getAllComponentSpecs();
    const categories = new Set(specs.map((s) => s.category));
    expect(categories.has('display')).toBe(true);
    expect(categories.has('input')).toBe(true);
    expect(categories.has('action')).toBe(true);
    expect(categories.has('layout')).toBe(true);
    expect(categories.has('data')).toBe(true);
  });

  it('should return the same set of types as the COMPONENT_SPECS keys', () => {
    const specs = getAllComponentSpecs();
    const typesFromGetAll = specs.map((s) => s.type).sort();
    const typesFromKeys = Object.keys(COMPONENT_SPECS).sort();
    expect(typesFromGetAll).toEqual(typesFromKeys);
  });
});
