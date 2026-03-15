/**
 * Module Registry - Tracks active module instances
 * @module modules/ModuleRegistry
 *
 * The registry maintains a map of module IDs to their runtime instances.
 * It provides lifecycle management (register, unregister, state transitions)
 * and query methods for enumerating modules by state.
 */

import { logger } from '../utils/logger';
import { isValidModuleId } from '../utils/validation';
import { SDKError } from '../kernel/errors/SDKError';
import { ERROR_CODES } from '../constants/error-codes';
import type { DataBus } from '../kernel/communication/DataBus';
import type { ModuleTokenManager } from '../kernel/identity/ModuleTokenManager';
import type {
  ModuleManifest,
  ModuleInstance,
  ModuleRuntimeState,
  ModuleSummary,
  ScreenSchema,
} from '../types';

export class ModuleRegistry {
  private readonly log = logger.child({ component: 'ModuleRegistry' });
  private readonly modules: Map<string, ModuleInstance> = new Map();
  private readonly dataBus?: DataBus;
  private readonly moduleTokenManager?: ModuleTokenManager;

  constructor(dataBus?: DataBus, moduleTokenManager?: ModuleTokenManager) {
    this.dataBus = dataBus;
    this.moduleTokenManager = moduleTokenManager;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Register a new module from its manifest.
   *
   * Creates a ModuleInstance in the 'loading' state. Throws if the module
   * ID is invalid or if a module with the same ID is already registered.
   *
   * @param manifest The module manifest to register
   * @returns The newly created ModuleInstance
   */
  register(manifest: ModuleManifest): ModuleInstance {
    const { id } = manifest;

    if (!isValidModuleId(id)) {
      throw SDKError.module(`Invalid module ID format: ${id}`, {
        context: { moduleId: id },
      });
    }

    if (this.modules.has(id)) {
      const entry = ERROR_CODES.MODULE_ALREADY_LOADED;
      throw new SDKError(entry.code, `Module "${id}" is already registered`, {
        category: entry.category,
        severity: entry.severity,
        context: { moduleId: id },
      });
    }

    const instance: ModuleInstance = {
      manifest,
      state: 'loading',
      loadedAt: Date.now(),
      lastActiveAt: Date.now(),
      screens: new Map<string, ScreenSchema>(),
    };

    this.modules.set(id, instance);
    this.log.info('Module registered', { moduleId: id, version: manifest.version });

    return instance;
  }

  /**
   * Get a module instance by ID.
   *
   * @param moduleId Module identifier
   * @returns The ModuleInstance, or undefined if not registered
   */
  get(moduleId: string): ModuleInstance | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get all registered module instances.
   */
  getAll(): ModuleInstance[] {
    return Array.from(this.modules.values());
  }

  /**
   * Transition a module to a new runtime state.
   *
   * Throws if the module is not registered. Updates lastActiveAt when
   * transitioning to 'active'.
   *
   * @param moduleId Module identifier
   * @param state    The new runtime state
   */
  setModuleState(moduleId: string, state: ModuleRuntimeState): void {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw SDKError.module(`Module "${moduleId}" is not registered`, {
        context: { moduleId, requestedState: state },
      });
    }

    const previousState = instance.state;
    instance.state = state;

    if (state === 'active') {
      instance.lastActiveAt = Date.now();
    }

    this.log.info('Module state changed', {
      moduleId,
      previousState,
      newState: state,
    });
  }

  /**
   * Add a loaded screen schema to a module instance.
   *
   * @param moduleId Module identifier
   * @param screenId Screen identifier
   * @param schema   The ScreenSchema to attach
   */
  addScreen(moduleId: string, screenId: string, schema: ScreenSchema): void {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw SDKError.module(`Module "${moduleId}" is not registered`, {
        context: { moduleId, screenId },
      });
    }

    instance.screens.set(screenId, schema);
    this.log.debug('Screen added to module', { moduleId, screenId });
  }

  /**
   * Unregister a module and release its resources.
   *
   * @param moduleId Module identifier
   */
  unregister(moduleId: string): void {
    if (!this.modules.has(moduleId)) {
      this.log.warn('Attempted to unregister unknown module', { moduleId });
      return;
    }

    this.modules.delete(moduleId);
    this.log.info('Module unregistered', { moduleId });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle management
  // ---------------------------------------------------------------------------

  /**
   * Suspend a module, pausing its activity.
   */
  suspendModule(moduleId: string): void {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw SDKError.module(`Module "${moduleId}" is not registered`, {
        context: { moduleId },
      });
    }
    this.setModuleState(moduleId, 'suspended');
    this.dataBus?.publish('sdk:module:suspended', { moduleId });
  }

  /**
   * Resume a previously suspended module.
   */
  resumeModule(moduleId: string): void {
    const instance = this.modules.get(moduleId);
    if (!instance) {
      throw SDKError.module(`Module "${moduleId}" is not registered`, {
        context: { moduleId },
      });
    }
    if (instance.state !== 'suspended') {
      this.log.warn('resumeModule called on non-suspended module', { moduleId, state: instance.state });
      return;
    }
    this.setModuleState(moduleId, 'active');
    this.dataBus?.publish('sdk:module:resumed', { moduleId });
  }

  /**
   * Unload a module, cleaning up all resources.
   */
  unloadModule(moduleId: string): void {
    if (!this.modules.has(moduleId)) {
      this.log.warn('Attempted to unload unknown module', { moduleId });
      return;
    }
    this.moduleTokenManager?.invalidateToken(moduleId);
    this.unregister(moduleId);
    this.dataBus?.publish('sdk:module:unloaded', { moduleId });
  }

  /**
   * Get all modules with a specific status.
   */
  getModulesByStatus(status: ModuleRuntimeState): ModuleInstance[] {
    return this.getAll().filter(m => m.state === status);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Get all modules that are currently in the 'active' state.
   */
  getActive(): ModuleInstance[] {
    return this.getAll().filter((m) => m.state === 'active');
  }

  /**
   * Build ModuleSummary items from all registered modules.
   *
   * This is the data shape consumed by the ActionZone UI for rendering
   * module tiles.
   */
  getLoadedModuleSummaries(): ModuleSummary[] {
    return this.getAll().map((instance) => ({
      id: instance.manifest.id,
      name: instance.manifest.name,
      icon: instance.manifest.icon,
      category: instance.manifest.category,
      version: instance.manifest.version,
      description: instance.manifest.description,
    }));
  }

  /**
   * Remove all registered modules.
   */
  clear(): void {
    const count = this.modules.size;
    this.modules.clear();
    this.log.info('Module registry cleared', { modulesRemoved: count });
  }
}
