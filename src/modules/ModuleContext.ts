/**
 * Module Context - Proxy-based isolated state per module
 * @module modules/ModuleContext
 *
 * Uses JavaScript Proxy to enforce state isolation between modules.
 * Each module can only read/write state with its own prefix:
 *
 *   {tenantId}:{moduleId}:{key}
 *
 * Cross-module access is blocked and logged as a security event.
 * This is a critical part of the SDK's multi-tenant isolation strategy
 * (see CLAUDE.md "Module Isolation Strategy" section).
 */

import { logger } from '../utils/logger';

export class ModuleContext {
  private readonly log = logger.child({ component: 'ModuleContext' });
  private readonly tenantId: string;
  private readonly moduleId: string;
  private readonly store: Map<string, unknown> = new Map();

  /**
   * @param tenantId  The tenant / organization identifier
   * @param moduleId  The module identifier (reverse-domain notation)
   */
  constructor(tenantId: string, moduleId: string) {
    this.tenantId = tenantId;
    this.moduleId = moduleId;

    this.log.debug('ModuleContext created', { tenantId, moduleId });
  }

  // ---------------------------------------------------------------------------
  // Proxy factory
  // ---------------------------------------------------------------------------

  /**
   * Create a Proxy-based state object for this module.
   *
   * The returned object intercepts all property access and transparently
   * maps keys to the internal store using the scoped prefix. This prevents
   * a module from accessing another module's or tenant's state even if it
   * guesses the raw key.
   *
   * @returns A Proxy that enforces scoped state access
   */
  createStateProxy(): Record<string, unknown> {
    const prefix = this.getPrefix();
    const store = this.store;
    const log = this.log;
    const tenantId = this.tenantId;
    const moduleId = this.moduleId;

    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target: Record<string, unknown>, prop: string | symbol): unknown {
        if (typeof prop === 'symbol') return undefined;

        // Block prototype pollution access
        if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
          log.warn('Blocked prototype pollution access', { tenantId, moduleId, key: prop });
          return undefined;
        }

        const scopedKey = `${prefix}${prop}`;
        return store.get(scopedKey);
      },

      set(_target: Record<string, unknown>, prop: string | symbol, value: unknown): boolean {
        if (typeof prop === 'symbol') return false;

        // Block prototype pollution write
        if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
          log.warn('Blocked prototype pollution write attempt', { tenantId, moduleId, key: prop });
          return false;
        }

        const scopedKey = `${prefix}${prop}`;
        store.set(scopedKey, value);
        log.debug('State set', { tenantId, moduleId, key: prop as string });
        return true;
      },

      has(_target: Record<string, unknown>, prop: string | symbol): boolean {
        if (typeof prop === 'symbol') return false;

        const scopedKey = `${prefix}${prop}`;
        return store.has(scopedKey);
      },

      deleteProperty(_target: Record<string, unknown>, prop: string | symbol): boolean {
        if (typeof prop === 'symbol') return false;

        const scopedKey = `${prefix}${prop}`;
        const deleted = store.delete(scopedKey);
        if (deleted) {
          log.debug('State deleted', { tenantId, moduleId, key: prop as string });
        }
        return deleted;
      },

      ownKeys(): string[] {
        const keys: string[] = [];
        for (const key of store.keys()) {
          if (key.startsWith(prefix)) {
            keys.push(key.slice(prefix.length));
          }
        }
        return keys;
      },

      getOwnPropertyDescriptor(_target: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
        if (typeof prop === 'symbol') return undefined;

        const scopedKey = `${prefix}${prop}`;
        if (store.has(scopedKey)) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: store.get(scopedKey),
          };
        }
        return undefined;
      },

      setPrototypeOf(): boolean {
        log.warn('Blocked setPrototypeOf on state proxy', { tenantId, moduleId });
        return false;
      },

      defineProperty(_target: Record<string, unknown>, prop: string | symbol): boolean {
        log.warn('Blocked defineProperty on state proxy', { tenantId, moduleId, key: String(prop) });
        return false;
      },
    };

    return new Proxy<Record<string, unknown>>({}, handler);
  }

  // ---------------------------------------------------------------------------
  // Direct state access (non-proxy)
  // ---------------------------------------------------------------------------

  /**
   * Read a value from this module's scoped state.
   *
   * @param key  The key (without tenant/module prefix)
   * @returns The stored value, or undefined
   */
  getState(key: string): unknown {
    return this.store.get(`${this.getPrefix()}${key}`);
  }

  /**
   * Write a value to this module's scoped state.
   *
   * @param key   The key (without tenant/module prefix)
   * @param value The value to store
   */
  setState(key: string, value: unknown): void {
    this.store.set(`${this.getPrefix()}${key}`, value);
    this.log.debug('State set (direct)', { tenantId: this.tenantId, moduleId: this.moduleId, key });
  }

  /**
   * Remove all state entries for this module.
   */
  clearState(): void {
    const prefix = this.getPrefix();
    const keysToDelete: string[] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }

    this.log.info('Module state cleared', {
      tenantId: this.tenantId,
      moduleId: this.moduleId,
      keysRemoved: keysToDelete.length,
    });
  }

  /**
   * Get all keys belonging to this module (without the scoped prefix).
   */
  getAllKeys(): string[] {
    const prefix = this.getPrefix();
    const keys: string[] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }

    return keys;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the scoped key prefix for this tenant + module.
   */
  private getPrefix(): string {
    return `${this.tenantId}:${this.moduleId}:`;
  }
}
