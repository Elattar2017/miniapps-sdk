/**
 * Response Mapping Utility
 * @module utils/responseMapping
 *
 * Maps backend response field names to SDK-expected field names.
 * Used by SubscriptionProvider and AccountIdentifierManager to handle
 * backends that haven't migrated to the new generic field names yet.
 */

/**
 * Renames keys in a single response object according to the mapping.
 *
 * @param data - Raw API response object
 * @param mapping - Maps backend field names to SDK field names (e.g., { planId: 'tierId' })
 * @returns Object with keys renamed per mapping
 *
 * @example
 * applyResponseMapping({ planId: 'gold', name: 'Gold' }, { planId: 'tierId' })
 * // Returns: { tierId: 'gold', name: 'Gold' }
 */
export function applyResponseMapping<T>(
  data: Record<string, unknown>,
  mapping?: Record<string, string>,
): T {
  if (!mapping || Object.keys(mapping).length === 0) return data as T;
  const result = { ...data };
  for (const [backendKey, sdkKey] of Object.entries(mapping)) {
    if (backendKey in result && !(sdkKey in result)) {
      result[sdkKey] = result[backendKey];
      delete result[backendKey];
    }
  }
  return result as T;
}

/**
 * Maps each item in an array response.
 *
 * @param items - Array of raw API response objects
 * @param mapping - Maps backend field names to SDK field names
 * @returns Array with each item's keys renamed per mapping
 */
export function applyResponseMappingToArray<T>(
  items: Record<string, unknown>[],
  mapping?: Record<string, string>,
): T[] {
  if (!mapping || Object.keys(mapping).length === 0) return items as T[];
  return items.map(item => applyResponseMapping<T>(item, mapping));
}
