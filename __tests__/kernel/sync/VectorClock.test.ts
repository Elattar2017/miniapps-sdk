/**
 * VectorClock Test Suite
 *
 * Tests pure vector clock functions: create, increment, merge, compare, isDescendant.
 * All functions must be pure (return new objects, never mutate input).
 */

import * as VectorClock from '../../../src/kernel/sync/VectorClock';

describe('VectorClock', () => {
  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('creates clock with nodeId set to 1', () => {
      const clock = VectorClock.create('node-A');
      expect(clock).toEqual({ 'node-A': 1 });
    });
  });

  // ---------------------------------------------------------------------------
  // increment()
  // ---------------------------------------------------------------------------

  describe('increment()', () => {
    it('increments the correct node counter', () => {
      const clock = { 'node-A': 2, 'node-B': 3 };
      const result = VectorClock.increment(clock, 'node-A');
      expect(result['node-A']).toBe(3);
      expect(result['node-B']).toBe(3);
    });

    it('creates node counter if missing', () => {
      const clock = { 'node-A': 1 };
      const result = VectorClock.increment(clock, 'node-B');
      expect(result['node-B']).toBe(1);
      expect(result['node-A']).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // merge()
  // ---------------------------------------------------------------------------

  describe('merge()', () => {
    it('takes the max of each counter', () => {
      const clockA = { 'node-A': 3, 'node-B': 1 };
      const clockB = { 'node-A': 1, 'node-B': 5 };
      const result = VectorClock.merge(clockA, clockB);
      expect(result).toEqual({ 'node-A': 3, 'node-B': 5 });
    });

    it('handles disjoint node sets', () => {
      const clockA = { 'node-A': 2 };
      const clockB = { 'node-B': 3 };
      const result = VectorClock.merge(clockA, clockB);
      expect(result).toEqual({ 'node-A': 2, 'node-B': 3 });
    });
  });

  // ---------------------------------------------------------------------------
  // compare()
  // ---------------------------------------------------------------------------

  describe('compare()', () => {
    it('equal clocks return "equal"', () => {
      const clockA = { 'node-A': 2, 'node-B': 3 };
      const clockB = { 'node-A': 2, 'node-B': 3 };
      expect(VectorClock.compare(clockA, clockB)).toBe('equal');
    });

    it('strictly greater returns "after"', () => {
      const clockA = { 'node-A': 3, 'node-B': 4 };
      const clockB = { 'node-A': 2, 'node-B': 3 };
      expect(VectorClock.compare(clockA, clockB)).toBe('after');
    });

    it('strictly less returns "before"', () => {
      const clockA = { 'node-A': 1, 'node-B': 2 };
      const clockB = { 'node-A': 3, 'node-B': 4 };
      expect(VectorClock.compare(clockA, clockB)).toBe('before');
    });

    it('incomparable returns "concurrent"', () => {
      const clockA = { 'node-A': 3, 'node-B': 1 };
      const clockB = { 'node-A': 1, 'node-B': 3 };
      expect(VectorClock.compare(clockA, clockB)).toBe('concurrent');
    });

    it('empty clocks return "equal"', () => {
      expect(VectorClock.compare({}, {})).toBe('equal');
    });

    it('single-node clocks compare correctly', () => {
      expect(VectorClock.compare({ x: 1 }, { x: 2 })).toBe('before');
      expect(VectorClock.compare({ x: 2 }, { x: 1 })).toBe('after');
      expect(VectorClock.compare({ x: 1 }, { x: 1 })).toBe('equal');
    });
  });

  // ---------------------------------------------------------------------------
  // isDescendant()
  // ---------------------------------------------------------------------------

  describe('isDescendant()', () => {
    it('returns true for a descendant', () => {
      const ancestor = { 'node-A': 1, 'node-B': 2 };
      const candidate = { 'node-A': 2, 'node-B': 3 };
      expect(VectorClock.isDescendant(candidate, ancestor)).toBe(true);
    });

    it('returns false for a non-descendant (reversed)', () => {
      const ancestor = { 'node-A': 3, 'node-B': 4 };
      const candidate = { 'node-A': 1, 'node-B': 2 };
      expect(VectorClock.isDescendant(candidate, ancestor)).toBe(false);
    });

    it('returns false for concurrent clocks', () => {
      const clockA = { 'node-A': 3, 'node-B': 1 };
      const clockB = { 'node-A': 1, 'node-B': 3 };
      expect(VectorClock.isDescendant(clockA, clockB)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Immutability
  // ---------------------------------------------------------------------------

  describe('Immutability', () => {
    it('increment does not mutate the original clock', () => {
      const original = { 'node-A': 1 };
      const originalCopy = { ...original };
      VectorClock.increment(original, 'node-A');
      expect(original).toEqual(originalCopy);
    });

    it('merge does not mutate the original clocks', () => {
      const clockA = { 'node-A': 1 };
      const clockB = { 'node-B': 2 };
      const clockACopy = { ...clockA };
      const clockBCopy = { ...clockB };
      VectorClock.merge(clockA, clockB);
      expect(clockA).toEqual(clockACopy);
      expect(clockB).toEqual(clockBCopy);
    });
  });
});
