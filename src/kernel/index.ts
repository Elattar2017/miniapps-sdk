/**
 * Runtime Kernel - Barrel exports
 * @module kernel
 *
 * Re-exports all kernel subsystems for convenient single-path imports:
 *   import { RuntimeKernel, useKernel, PolicyEngine, ... } from './kernel';
 */

// Core kernel
export { RuntimeKernel } from './Kernel';
export {
  validateKernelConfig,
  normalizeKernelConfig,
  type KernelConfigValidation,
} from './KernelConfig';
export {
  KernelContext,
  KernelProvider,
  useKernel,
  type KernelContextValue,
  type KernelInstance,
} from './KernelContext';

// Communication
export { IntentBridge } from './communication/IntentBridge';
export { DataBus } from './communication/DataBus';

// Telemetry
export { TelemetryCollector } from './telemetry/TelemetryCollector';

// Identity & Security
export {
  JWTValidator,
  type JWTValidationResult,
  TokenRefreshManager,
  type TokenRefreshCallback,
  PKIVerifier,
  CryptoAdapter,
} from './identity';

// Policy
export { PolicyEngine, PolicyCache } from './policy';

// Errors
export {
  SDKError,
  type SDKErrorOptions,
  ErrorBoundary,
  type ErrorBoundaryProps,
  CircuitBreaker,
  ErrorRecovery,
} from './errors';
