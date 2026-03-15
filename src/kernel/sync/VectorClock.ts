/**
 * Vector Clock - Pure functions for causal ordering of distributed events
 * @module kernel/sync/VectorClock
 *
 * All functions are pure: they return new objects and never mutate inputs.
 * Used by SyncEngine for conflict detection between local and remote entries.
 */

import type { VectorClockMap } from '../../types';

/** Ordering relationship between two vector clocks */
export type ClockOrdering = 'before' | 'after' | 'concurrent' | 'equal';

/**
 * Create a new vector clock with the given nodeId initialised to 1.
 */
export function create(nodeId: string): VectorClockMap {
  return { [nodeId]: 1 };
}

/**
 * Increment the counter for `nodeId` in the given clock.
 * If the node does not yet exist in the clock it is created with counter 1.
 * Returns a new clock object; the input is never mutated.
 */
export function increment(clock: VectorClockMap, nodeId: string): VectorClockMap {
  return {
    ...clock,
    [nodeId]: (clock[nodeId] ?? 0) + 1,
  };
}

/**
 * Merge two vector clocks by taking the maximum counter for every node
 * present in either clock.  Returns a new clock object.
 */
export function merge(clockA: VectorClockMap, clockB: VectorClockMap): VectorClockMap {
  const result: VectorClockMap = { ...clockA };
  for (const nodeId of Object.keys(clockB)) {
    result[nodeId] = Math.max(result[nodeId] ?? 0, clockB[nodeId]);
  }
  return result;
}

/**
 * Compare two vector clocks and return their causal ordering.
 *
 * - `'equal'`      : every counter is identical
 * - `'before'`     : clockA <= clockB on all nodes and < on at least one
 * - `'after'`      : clockA >= clockB on all nodes and > on at least one
 * - `'concurrent'` : neither clock dominates the other
 */
export function compare(clockA: VectorClockMap, clockB: VectorClockMap): ClockOrdering {
  const allNodes = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

  let aGreater = false;
  let bGreater = false;

  for (const nodeId of allNodes) {
    const a = clockA[nodeId] ?? 0;
    const b = clockB[nodeId] ?? 0;

    if (a > b) aGreater = true;
    if (b > a) bGreater = true;

    if (aGreater && bGreater) return 'concurrent';
  }

  if (!aGreater && !bGreater) return 'equal';
  if (aGreater) return 'after';
  return 'before';
}

/**
 * Returns true if `candidate` is a descendant of `ancestor`.
 *
 * A candidate is a descendant when its counter is >= the ancestor counter
 * on every node AND strictly > on at least one node.
 */
export function isDescendant(candidate: VectorClockMap, ancestor: VectorClockMap): boolean {
  const allNodes = new Set([...Object.keys(candidate), ...Object.keys(ancestor)]);

  let hasStrictlyGreater = false;

  for (const nodeId of allNodes) {
    const c = candidate[nodeId] ?? 0;
    const a = ancestor[nodeId] ?? 0;

    if (c < a) return false;
    if (c > a) hasStrictlyGreater = true;
  }

  return hasStrictlyGreater;
}
