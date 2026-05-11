/**
 * Kernel React Context - Provides kernel state to component tree
 * @module kernel/KernelContext
 *
 * Exposes the RuntimeKernel instance and its current state to all
 * descendant components via React Context.  The `useKernel()` hook
 * is the primary consumer API and will throw an informative error
 * if called outside of a `<KernelProvider>` (i.e. outside `<SDKProvider>`).
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { KernelState, KernelConfig, KernelStatus, DesignTokens } from '../types';
import type { DataBus } from './communication/DataBus';
import type { IntentBridge } from './communication/IntentBridge';
import type { PolicyEngine } from './policy/PolicyEngine';
import type { ModuleRegistry } from '../modules/ModuleRegistry';
import type { SDKNavigator } from '../adapters/NavigationAdapter';
import type { APIProxy } from './network/APIProxy';
import type { SyncEngine } from './sync/SyncEngine';
import type { SubscriptionProvider } from './policy/SubscriptionProvider';

// Forward reference — we import the concrete class type for the context
// value but avoid a circular dependency by typing it as an interface here.
// The RuntimeKernel class is injected at runtime by KernelProvider.

/** Public shape of the kernel instance exposed through context */
export interface KernelInstance {
  getState(): KernelState;
  getStatus(): KernelStatus;
  getConfig(): KernelConfig;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  shutdown(): Promise<void>;
  getDataBus(): DataBus;
  getIntentBridge(): IntentBridge;
  getPolicyEngine(): PolicyEngine;
  getModuleRegistry(): ModuleRegistry;
  getAPIProxy(): APIProxy | null;
  getSyncEngine(): SyncEngine | null;
}

/** Value carried by KernelContext */
export interface KernelContextValue {
  /** The RuntimeKernel instance */
  kernel: KernelInstance;
  /** Current FSM state (kept in sync by the provider) */
  state: KernelState;
  /** Resolved kernel config */
  config: KernelConfig;
  /** Snapshot of kernel status metrics */
  status: KernelStatus;
  /** Scoped communication bus for cross-module messaging */
  dataBus: DataBus;
  /** Bidirectional bridge for SDK ↔ Host intents */
  intentBridge: IntentBridge;
  /** RBAC/ABAC policy engine */
  policyEngine: PolicyEngine;
  /** Registry of loaded modules */
  moduleRegistry: ModuleRegistry;
  /** SDK navigation controller */
  navigator: SDKNavigator;
  /** Design tokens for theming */
  designTokens: DesignTokens;
  /** API proxy for kernel-level HTTP requests */
  apiProxy: APIProxy | null;
  /** Sync engine for offline-first data synchronization */
  syncEngine: SyncEngine | null;
  /** User roles extracted from JWT claims */
  userRoles: string[];
  subscriptionProvider?: SubscriptionProvider;
}

/**
 * React Context for the RuntimeKernel.
 * Defaults to null; a non-null value is guaranteed inside `<KernelProvider>`.
 */
export const KernelContext = createContext<KernelContextValue | null>(null);
KernelContext.displayName = 'KernelContext';

/**
 * Hook to access the RuntimeKernel from any component inside `<SDKProvider>`.
 *
 * @throws Error if called outside of a KernelProvider/SDKProvider tree.
 * @returns The current KernelContextValue
 */
export function useKernel(): KernelContextValue {
  const ctx = useContext(KernelContext);
  if (ctx === null) {
    throw new Error(
      'useKernel() must be used within an <SDKProvider>. ' +
        'Wrap your component tree with <SDKProvider> to provide the kernel context.',
    );
  }
  return ctx;
}

/** Props accepted by KernelProvider */
interface KernelProviderProps {
  kernel: KernelInstance;
  state: KernelState;
  config: KernelConfig;
  status: KernelStatus;
  dataBus: DataBus;
  intentBridge: IntentBridge;
  policyEngine: PolicyEngine;
  moduleRegistry: ModuleRegistry;
  navigator: SDKNavigator;
  designTokens: DesignTokens;
  apiProxy: APIProxy | null;
  syncEngine: SyncEngine | null;
  userRoles: string[];
  subscriptionProvider?: SubscriptionProvider;
  children?: React.ReactNode;
}

/**
 * Provider component that injects the RuntimeKernel into React context.
 * Typically mounted by `<SDKProvider>` after a successful boot sequence.
 */
export function KernelProvider({
  kernel,
  state,
  config,
  status,
  dataBus,
  intentBridge,
  policyEngine,
  moduleRegistry,
  navigator,
  designTokens,
  apiProxy,
  syncEngine,
  userRoles,
  subscriptionProvider,
  children,
}: KernelProviderProps): React.JSX.Element {
  const value = useMemo<KernelContextValue>(
    () => ({ kernel, state, config, status, dataBus, intentBridge, policyEngine, moduleRegistry, navigator, designTokens, apiProxy, syncEngine, userRoles, subscriptionProvider }),
    [kernel, state, config, status, dataBus, intentBridge, policyEngine, moduleRegistry, navigator, designTokens, apiProxy, syncEngine, userRoles, subscriptionProvider],
  );

  return React.createElement(KernelContext.Provider, { value }, children);
}

/**
 * Hook to access core SDK subsystems (DataBus, IntentBridge, PolicyEngine,
 * ModuleRegistry, Navigator) from any component inside `<SDKProvider>`.
 *
 * @throws Error if called outside of a KernelProvider/SDKProvider tree.
 * @returns An object containing the five core SDK services.
 */
export function useSDKServices() {
  const ctx = useKernel();
  return {
    dataBus: ctx.dataBus,
    intentBridge: ctx.intentBridge,
    policyEngine: ctx.policyEngine,
    moduleRegistry: ctx.moduleRegistry,
    navigator: ctx.navigator,
    apiProxy: ctx.apiProxy,
    syncEngine: ctx.syncEngine,
    userRoles: ctx.userRoles,
    subscriptionProvider: ctx.subscriptionProvider,
  };
}

/**
 * Hook to access the current DesignTokens from any component inside `<SDKProvider>`.
 *
 * @throws Error if called outside of a KernelProvider/SDKProvider tree.
 * @returns The current DesignTokens
 */
export function useDesignTokens(): DesignTokens {
  const ctx = useKernel();
  return ctx.designTokens;
}
