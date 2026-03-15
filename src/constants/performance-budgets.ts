/**
 * Performance Budgets - Strict thresholds enforced in CI/CD
 * @module constants/performance-budgets
 */

export const PERFORMANCE_BUDGETS = {
  /** SDK boot: SDKProvider mount -> ACTIVE state */
  SDK_BOOT_MS: 500,
  /** Module load from cache: request -> first screen render */
  MODULE_LOAD_CACHED_MS: 100,
  /** Module load from network: fetch + verify + render */
  MODULE_LOAD_NETWORK_MS: 2000,
  /** Screen transition: navigation trigger -> visible */
  SCREEN_TRANSITION_MS: 200,
  /** Input response: user keystroke -> UI update */
  INPUT_RESPONSE_MS: 50,
  /** Chart render: data available -> chart visible */
  CHART_RENDER_MS: 300,
  /** Expression evaluation: single expression */
  EXPRESSION_EVAL_MS: 5,
  /** Memory per active module */
  MEMORY_PER_MODULE_MB: 15,
  /** Total SDK memory (all modules + kernel) */
  SDK_TOTAL_MEMORY_MB: 50,
  /** Compressed SDK package size */
  BUNDLE_SIZE_KB: 500,
} as const;

export type PerformanceBudgetKey = keyof typeof PERFORMANCE_BUDGETS;
