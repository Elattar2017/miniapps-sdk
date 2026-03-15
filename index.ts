/**
 * Enterprise Module SDK
 * Schema-driven embeddable runtime for React Native applications
 *
 * @packageDocumentation
 */

// Host Integration Components
export { SDKProvider } from './src/components/SDKProvider';
export { ZoneRenderer } from './src/components/ZoneRenderer';
export { ActionZone } from './src/components/ActionZone';
export { ScreenRenderer } from './src/components/ScreenRenderer';

// Kernel (for advanced use)
export { RuntimeKernel } from './src/kernel/Kernel';
export { useKernel } from './src/kernel/KernelContext';

// Icon system (for host app customization)
export { iconRegistry, IconRegistry } from './src/schema/icons';
export { SVGIconProvider } from './src/schema/icons/SVGIconProvider';

// i18n (for host app locale control)
export { setLocale } from './src/i18n';

// Types
export type {
  SDKProviderProps,
  KernelConfig,
  KernelState,
  KernelStatus,
  ZoneConfig,
  ModuleFilter,
  DesignTokens,
} from './src/types';

export type {
  ModuleManifest,
  ModuleSummary,
  ModulePermissions,
} from './src/types';

export type {
  ScreenSchema,
  SchemaNode,
  ActionConfig,
  ActionType,
  DataSourceConfig,
  ValidationRule,
} from './src/types';

export type {
  IntentType,
  Intent,
  IIntentBridge,
} from './src/types';
