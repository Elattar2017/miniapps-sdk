/**
 * Runtime Kernel - Main SDK kernel implementing FSM lifecycle
 * @module kernel/Kernel
 *
 * Manages the full lifecycle: IDLE -> BOOT -> AUTH -> POLICY_SYNC -> MODULE_SYNC -> ZONE_RENDER -> ACTIVE
 * Also handles: SUSPEND, RESUME, SHUTDOWN, ERROR transitions.
 *
 * The kernel is the central coordinator that:
 *  - Validates and normalizes configuration
 *  - Walks through the FSM boot sequence
 *  - Manages identity (JWT validation, token refresh)
 *  - Coordinates policy engine, module system, and zone rendering
 *  - Emits typed events for every state transition
 *  - Enforces the 500ms boot performance budget
 *
 * Current status:
 *  - Policy sync fetches remote policies with default-allow fallback
 *  - Module sync fetches and registers modules from backend API
 *  - Zone render delegates to React component layer (ZoneRenderer)
 */

import type { KernelState, KernelConfig, KernelStatus, SDKEventMap } from '../types';
import { isValidTransition } from '../constants/kernel-states';
import { PERFORMANCE_BUDGETS } from '../constants/performance-budgets';
import { ERROR_CODES } from '../constants/error-codes';
import { logger } from '../utils/logger';
import { timer } from '../utils/timer';
import { TypedEventEmitter } from '../utils/event-emitter';
import { JWTValidator } from './identity/JWTValidator';
import { TokenRefreshManager } from './identity/TokenRefreshManager';
import { PolicyEngine } from './policy/PolicyEngine';
import { IntentBridge } from './communication/IntentBridge';
import { DataBus } from './communication/DataBus';
import { TelemetryCollector } from './telemetry/TelemetryCollector';
import { SDKError } from './errors/SDKError';
import { validateKernelConfig, normalizeKernelConfig } from './KernelConfig';
import { ModuleLoader } from '../modules/ModuleLoader';
import { ModuleCache } from '../modules/ModuleCache';
import { ModuleRegistry } from '../modules/ModuleRegistry';
import { APIProxy } from './network/APIProxy';
import { CryptoAdapter } from './identity/CryptoAdapter';
import { ModuleTokenManager } from './identity/ModuleTokenManager';
import { SyncEngine } from './sync/SyncEngine';
import { ConflictResolver } from './sync/ConflictResolver';
import { createPlatformStorage } from '../adapters/StorageAdapter';

const BOOT_TIMER_LABEL = 'kernel:boot';

export class RuntimeKernel {
  // ---------------------------------------------------------------
  // Private state
  // ---------------------------------------------------------------

  private state: KernelState = 'IDLE';
  private config: KernelConfig | null = null;
  private bootTime: number | undefined;
  private lastError: string | undefined;
  private userRoles: string[] = [];

  // ---------------------------------------------------------------
  // Sub-systems
  // ---------------------------------------------------------------

  private readonly log = logger.child({ component: 'RuntimeKernel' });
  private readonly emitter = new TypedEventEmitter<SDKEventMap>();
  private readonly jwtValidator = new JWTValidator();
  private tokenRefreshManager: TokenRefreshManager | null = null;
  private readonly policyEngine = new PolicyEngine();
  private readonly intentBridge = new IntentBridge();
  private readonly dataBus = new DataBus();
  private readonly telemetry = new TelemetryCollector();
  private readonly moduleCache = new ModuleCache();
  private readonly moduleRegistry = new ModuleRegistry();
  private moduleLoader: ModuleLoader | null = null;
  private apiProxy: APIProxy | null = null;
  private syncEngine: SyncEngine | null = null;

  // ---------------------------------------------------------------
  // Public API — Lifecycle
  // ---------------------------------------------------------------

  /**
   * Boot the kernel through the full FSM sequence.
   *
   * Walks through: IDLE -> BOOT -> AUTH -> POLICY_SYNC -> MODULE_SYNC -> ZONE_RENDER -> ACTIVE
   *
   * If any phase fails, the kernel transitions to the ERROR state and
   * the error is re-thrown to the caller.
   *
   * @param config - KernelConfig provided by the host application
   * @throws SDKError if configuration is invalid or any boot phase fails
   */
  async boot(config: KernelConfig): Promise<void> {
    this.log.info('Kernel boot initiated', { tenantId: config.tenantId });

    // Validate configuration
    const validation = validateKernelConfig(config);
    if (!validation.valid) {
      const errorMsg = `Invalid kernel configuration: ${validation.errors.join('; ')}`;
      this.lastError = errorMsg;
      this.log.error(errorMsg);
      throw SDKError.kernel(errorMsg, {
        context: { errors: validation.errors },
      });
    }

    // Normalize configuration
    this.config = normalizeKernelConfig(config);

    // Enable debug logging if requested
    if (this.config.debug) {
      logger.setLevel('DEBUG');
    }

    // Start boot timer
    timer.start(BOOT_TIMER_LABEL);

    try {
      await this.doBoot();
      await this.doAuth();

      // Create API Proxy after auth is complete
      if (this.config) {
        this.apiProxy = new APIProxy({
          baseUrl: this.config.apiBaseUrl,
          authToken: this.config.authToken,
          dataBus: this.dataBus,
          telemetry: this.telemetry,
        });
      }

      // Create SyncEngine after API proxy is available
      if (this.config && this.apiProxy) {
        const syncStorage = createPlatformStorage({
          id: `${this.config.tenantId}:__sync__`,
          encryptionKey: this.config.encryptionKey,
        });
        const conflictResolver = new ConflictResolver(
          { defaultStrategy: 'latest-timestamp', maxConflictQueueSize: 50, conflictTTL: 3600 },
          this.dataBus,
        );
        this.syncEngine = new SyncEngine(
          syncStorage,
          this.apiProxy,
          conflictResolver,
          this.dataBus,
          { nodeId: `${this.config.tenantId}:${this.config.userId}` },
        );
        this.log.debug('SyncEngine initialized');
      }

      await this.doPolicySync();
      await this.doModuleSync();
      await this.doZoneRender();

      // Measure boot duration against performance budget
      this.bootTime = timer.endWithBudget(BOOT_TIMER_LABEL, 'SDK_BOOT_MS');

      this.log.info('Kernel boot complete', {
        bootTimeMs: this.bootTime,
        budgetMs: PERFORMANCE_BUDGETS.SDK_BOOT_MS,
        withinBudget: this.bootTime <= PERFORMANCE_BUDGETS.SDK_BOOT_MS,
      });

      // Track boot performance metric
      this.telemetry.track({
        type: 'performance_metric',
        timestamp: Date.now(),
        tenantId: this.config.tenantId,
        userId: this.config.userId,
        data: {
          label: 'kernel_boot',
          duration: this.bootTime,
          budget: PERFORMANCE_BUDGETS.SDK_BOOT_MS,
        },
      });
    } catch (err) {
      // Clean up boot timer if still running
      if (timer.isRunning(BOOT_TIMER_LABEL)) {
        timer.end(BOOT_TIMER_LABEL);
      }

      // Transition to ERROR state (may already be in ERROR from phase handler)
      if (this.state !== 'ERROR') {
        this.transitionToError(err);
      }

      throw err;
    }
  }

  /**
   * Suspend the kernel (e.g. when host app goes to background).
   * Valid from ACTIVE state.
   */
  async suspend(): Promise<void> {
    this.log.info('Kernel suspend requested');
    this.transition('SUSPEND');

    // Stop token refresh monitoring while suspended
    if (this.tokenRefreshManager) {
      this.tokenRefreshManager.stopMonitoring();
    }

    // Stop auto-sync while suspended
    if (this.syncEngine) {
      this.syncEngine.stop();
    }

    this.log.info('Kernel suspended');
  }

  /**
   * Resume the kernel from a suspended state.
   * Valid from SUSPEND state. Transitions through RESUME to ACTIVE.
   */
  async resume(): Promise<void> {
    this.log.info('Kernel resume requested');
    this.transition('RESUME');

    // Restart token refresh monitoring
    if (this.tokenRefreshManager && this.config) {
      this.tokenRefreshManager.startMonitoring(this.config.authToken);
    }

    // Restart auto-sync
    if (this.syncEngine) {
      this.syncEngine.start();
    }

    // Transition back to ACTIVE
    this.transition('ACTIVE');
    this.log.info('Kernel resumed to ACTIVE');
  }

  /**
   * Shut down the kernel cleanly.
   * Valid from ACTIVE, SUSPEND, or ERROR states.
   */
  async shutdown(): Promise<void> {
    this.log.info('Kernel shutdown requested');
    this.transition('SHUTDOWN');

    // Stop token refresh
    if (this.tokenRefreshManager) {
      this.tokenRefreshManager.stopMonitoring();
      this.tokenRefreshManager = null;
    }

    // Stop and clear sync engine
    if (this.syncEngine) {
      this.syncEngine.stop();
      this.syncEngine = null;
    }

    // Clear subsystems
    this.policyEngine.clearPolicies();
    this.intentBridge.removeAllHandlers();
    this.dataBus.clear();
    this.moduleRegistry.clear();
    this.moduleCache.clear();
    this.moduleLoader = null;
    this.apiProxy = null;
    await this.telemetry.flush();

    // Remove all event listeners
    this.emitter.removeAllListeners();

    // Transition back to IDLE
    this.transition('IDLE');
    this.config = null;
    this.bootTime = undefined;
    this.lastError = undefined;
    this.userRoles = [];

    this.log.info('Kernel shutdown complete');
  }

  // ---------------------------------------------------------------
  // Public API — Getters
  // ---------------------------------------------------------------

  /** Get the current FSM state */
  getState(): KernelState {
    return this.state;
  }

  /** Get a snapshot of the kernel status */
  getStatus(): KernelStatus {
    return {
      state: this.state,
      bootTime: this.bootTime,
      moduleCount: this.moduleRegistry.getAll().length,
      activeModuleId: undefined,
      lastError: this.lastError,
    };
  }

  /** Get the resolved kernel config (throws if not booted) */
  getConfig(): KernelConfig {
    if (!this.config) {
      throw SDKError.kernel('Kernel has not been booted - config is unavailable');
    }
    return this.config;
  }

  // ---------------------------------------------------------------
  // Public API — Sub-system Access
  // ---------------------------------------------------------------

  /** Get the typed event emitter for subscribing to kernel events */
  getEmitter(): TypedEventEmitter<SDKEventMap> {
    return this.emitter;
  }

  /** Get the JWT validator */
  getJWTValidator(): JWTValidator {
    return this.jwtValidator;
  }

  /** Get the policy engine */
  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  /** Get the intent bridge */
  getIntentBridge(): IntentBridge {
    return this.intentBridge;
  }

  /** Get the data bus */
  getDataBus(): DataBus {
    return this.dataBus;
  }

  /** Get the telemetry collector */
  getTelemetry(): TelemetryCollector {
    return this.telemetry;
  }

  /** Get the module registry */
  getModuleRegistry(): ModuleRegistry {
    return this.moduleRegistry;
  }

  /** Get the module loader (null until boot initializes it) */
  getModuleLoader(): ModuleLoader | null {
    return this.moduleLoader;
  }

  /** Get the API proxy (null until boot initializes it after auth) */
  getAPIProxy(): APIProxy | null {
    return this.apiProxy;
  }

  /** Get the sync engine (null until boot initializes it) */
  getSyncEngine(): SyncEngine | null {
    return this.syncEngine;
  }

  /** Get the user roles extracted from the JWT during auth */
  getUserRoles(): string[] {
    return [...this.userRoles];
  }

  // ---------------------------------------------------------------
  // Private — FSM Transition
  // ---------------------------------------------------------------

  /**
   * Transition the kernel to a new state.
   * Validates the transition against the FSM transition map and emits
   * a `kernel_state_change` event on success.
   *
   * @throws SDKError if the transition is not valid from the current state
   */
  private transition(to: KernelState): void {
    const from = this.state;

    if (!isValidTransition(from, to)) {
      const errorMsg = `Invalid kernel state transition: ${from} -> ${to}`;
      this.log.error(errorMsg, { from, to });
      throw SDKError.kernel(errorMsg, {
        context: { from, to, code: ERROR_CODES.KERNEL_INVALID_STATE.code },
      });
    }

    this.state = to;
    this.log.info('Kernel state transition', { from, to });

    this.emitter.emit('kernel_state_change', { from, to });
  }

  /**
   * Transition to ERROR state, capturing the error message.
   */
  private transitionToError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.lastError = message;

    try {
      this.transition('ERROR');
    } catch {
      // If transition to ERROR is itself invalid (should not happen per FSM),
      // force the state as a last resort.
      this.state = 'ERROR';
      this.log.error('Forced transition to ERROR state', { error: message });
    }

    this.emitter.emit('error', {
      code: ERROR_CODES.KERNEL_BOOT_FAILED.code,
      message,
    });
  }

  // ---------------------------------------------------------------
  // Private — Boot Phases
  // ---------------------------------------------------------------

  /**
   * Phase: BOOT
   * Initialize core kernel infrastructure.
   */
  private async doBoot(): Promise<void> {
    this.transition('BOOT');
    this.log.debug('Boot phase: initializing kernel infrastructure');

    // Register intent handlers from config
    if (this.config?.intentHandlers) {
      for (const [type, handler] of Object.entries(this.config.intentHandlers)) {
        this.intentBridge.registerHandler(
          type as Parameters<typeof this.intentBridge.registerHandler>[0],
          handler,
        );
      }
    }

    this.log.debug('Boot phase: complete');
  }

  /**
   * Phase: AUTH
   * Validate the JWT token and set up proactive token refresh.
   */
  private async doAuth(): Promise<void> {
    this.transition('AUTH');
    this.log.debug('Auth phase: validating JWT token');

    if (!this.config) {
      throw SDKError.kernel('Config is null during AUTH phase');
    }

    // Validate the JWT
    const result = this.jwtValidator.validate(this.config.authToken);
    if (!result.valid) {
      const errorMsg = `JWT validation failed: ${result.error ?? 'unknown error'}`;
      this.log.error(errorMsg);
      throw SDKError.auth(errorMsg, {
        context: { error: result.error },
      });
    }

    if (result.valid && result.claims) {
      this.userRoles = result.claims.roles ?? [];
      this.log.debug('Extracted user roles from JWT', { roles: this.userRoles });
    }

    this.log.debug('Auth phase: JWT validated', {
      sub: result.claims?.sub,
      tenantId: result.claims?.tenantId,
    });

    // Set up token refresh if the host provided a callback
    if (this.config.onTokenRefresh) {
      this.tokenRefreshManager = new TokenRefreshManager(this.config.onTokenRefresh);
      this.tokenRefreshManager.startMonitoring(this.config.authToken);
      this.log.debug('Auth phase: token refresh monitoring started');
    } else {
      this.log.warn('Auth phase: no onTokenRefresh callback provided; tokens will not auto-refresh');
    }

    this.log.debug('Auth phase: complete');
  }

  /**
   * Phase: POLICY_SYNC
   * Load policies from the backend.
   * Phase 1: No-op — policies will be fetched remotely in Phase 3.
   */
  private async doPolicySync(): Promise<void> {
    this.transition('POLICY_SYNC');
    this.log.debug('Policy sync phase: loading default policies');

    // Load a default-allow policy as baseline
    this.policyEngine.loadPolicies([
      {
        id: 'default-allow-all',
        effect: 'allow' as const,
        resource: '*',
        action: '*',
        priority: 0,
        conditions: [],
      },
    ]);

    // Try to fetch remote policies
    if (this.config) {
      try {
        const registryUrl = this.config.moduleRegistryUrl ?? this.config.apiBaseUrl;
        const response = await fetch(`${registryUrl}/api/sdk/policies`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.authToken}`,
          },
        });
        if (response.ok) {
          const remotePolicies = await response.json();
          if (Array.isArray(remotePolicies) && remotePolicies.length > 0) {
            // Merge remote policies with default-allow (remote policies take higher priority)
            this.policyEngine.loadPolicies([
              { id: 'default-allow-all', effect: 'allow' as const, resource: '*', action: '*', priority: 0, conditions: [] },
              ...remotePolicies,
            ]);
            this.log.info('Remote policies loaded', { count: remotePolicies.length });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.warn('Failed to fetch remote policies, continuing with default-allow', { error: message });
      }
    }

    this.log.debug('Policy sync phase: complete (default-allow loaded)');
  }

  /**
   * Phase: MODULE_SYNC
   * Synchronize available modules from backend and local cache.
   *
   * Fetches the module list from the API, then registers each module
   * in the ModuleRegistry. Errors are logged but do not crash the kernel
   * — a partial module list is acceptable (the user may still use
   * whatever modules were successfully registered).
   */
  private async doModuleSync(): Promise<void> {
    this.transition('MODULE_SYNC');
    this.log.debug('Module sync phase: synchronizing modules');

    if (!this.config) {
      throw SDKError.kernel('Config is null during MODULE_SYNC phase');
    }

    // Initialize the module loader with the configured API base URL and PKI config
    const moduleRegistryUrl = this.config.moduleRegistryUrl ?? this.config.apiBaseUrl;

    // PKI config: always provide CryptoAdapter so per-module signingPublicKey
    // (stapled by server in each manifest) can be used for verification.
    // The global signingPublicKey is a fallback for manifests without a stapled key.
    const pkiConfig = {
      cryptoAdapter: new CryptoAdapter(),
      publicKey: this.config.signingPublicKey,
    };

    // Create ModuleTokenManager when encryptionKey is configured
    let moduleTokenManager: ModuleTokenManager | undefined;
    if (this.config.encryptionKey && this.apiProxy) {
      moduleTokenManager = new ModuleTokenManager({
        apiProxy: this.apiProxy,
        cryptoAdapter: new CryptoAdapter(),
        dataBus: this.dataBus,
        encryptionKey: this.config.encryptionKey,
      });
    }

    this.moduleLoader = new ModuleLoader(moduleRegistryUrl, this.moduleCache, undefined, moduleTokenManager, pkiConfig);

    try {
      // Fetch the module list from the API
      const modules = await this.moduleLoader.loadModuleList();
      this.log.info('Module list fetched', { count: modules.length });

      // Register each module in the registry
      for (const moduleSummary of modules) {
        try {
          // Load the full manifest for this module
          const manifest = await this.moduleLoader.loadManifest(moduleSummary.id);

          // Register in the registry (creates instance in 'loading' state)
          this.moduleRegistry.register(manifest);

          // Transition to 'ready' state since we have the manifest
          this.moduleRegistry.setModuleState(manifest.id, 'ready');

          this.log.debug('Module registered', {
            moduleId: manifest.id,
            version: manifest.version,
          });
        } catch (moduleErr) {
          // Log and continue — don't crash the kernel for a single module failure
          const message = moduleErr instanceof Error ? moduleErr.message : String(moduleErr);
          this.log.warn('Failed to load/register module, skipping', {
            moduleId: moduleSummary.id,
            error: message,
          });
        }
      }

      this.log.info('Module sync phase: complete', {
        registeredCount: this.moduleRegistry.getAll().length,
      });
    } catch (err) {
      // Network or API failure fetching the module list.
      // Log the error but do not re-throw — the kernel can still boot
      // with zero modules. Modules can be loaded on demand later.
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Module sync phase: failed to fetch module list, continuing with empty registry', {
        error: message,
      });
    }
  }

  /**
   * Phase: ZONE_RENDER
   * Prepare registered zones for rendering.
   * Phase 1: Just transitions to ACTIVE — actual zone rendering
   * is handled by the React component layer (ZoneRenderer).
   */
  private async doZoneRender(): Promise<void> {
    this.transition('ZONE_RENDER');
    this.log.debug('Zone render phase: preparing zones (Phase 1: no-op)');

    if (this.config) {
      const zoneCount = Object.keys(this.config.zones).length;
      this.log.debug('Zone render phase: zones registered', { zoneCount });
    }

    // Transition to ACTIVE — kernel is now fully operational
    this.transition('ACTIVE');
    this.log.debug('Zone render phase: complete, kernel is ACTIVE');
  }
}
