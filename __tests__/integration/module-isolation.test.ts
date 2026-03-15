/**
 * Module Isolation Integration Tests
 *
 * Tests module isolation guarantees across ModuleContext, StorageAdapter, and DataBus.
 * Uses real implementations - no mocking of internal subsystems.
 */

import { ModuleContext } from '../../src/modules/ModuleContext';
import { createStorageAdapter } from '../../src/adapters/StorageAdapter';
import { DataBus } from '../../src/kernel/communication/DataBus';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Module Isolation', () => {
  // -------------------------------------------------------------------------
  // ModuleContext isolation
  // -------------------------------------------------------------------------

  describe('ModuleContext isolation', () => {
    it('should isolate state between two different modules', () => {
      const moduleA = new ModuleContext('tenant-1', 'com.vendor.module-a');
      const moduleB = new ModuleContext('tenant-1', 'com.vendor.module-b');

      // Set the same key name on both modules
      moduleA.setState('key', 'value_a');
      moduleB.setState('key', 'value_b');

      // Each module should get its own value
      expect(moduleA.getState('key')).toBe('value_a');
      expect(moduleB.getState('key')).toBe('value_b');

      // Modifying one should not affect the other
      moduleA.setState('key', 'updated_a');
      expect(moduleA.getState('key')).toBe('updated_a');
      expect(moduleB.getState('key')).toBe('value_b');
    });

    it('should isolate state between same moduleId but different tenantId', () => {
      const tenantAModule = new ModuleContext('tenant-alpha', 'com.vendor.module');
      const tenantBModule = new ModuleContext('tenant-beta', 'com.vendor.module');

      tenantAModule.setState('setting', 'alpha_value');
      tenantBModule.setState('setting', 'beta_value');

      expect(tenantAModule.getState('setting')).toBe('alpha_value');
      expect(tenantBModule.getState('setting')).toBe('beta_value');

      // Clearing one tenant's state should not affect the other
      tenantAModule.clearState();
      expect(tenantAModule.getState('setting')).toBeUndefined();
      expect(tenantBModule.getState('setting')).toBe('beta_value');
    });
  });

  // -------------------------------------------------------------------------
  // ModuleContext - getAllKeys
  // -------------------------------------------------------------------------

  describe('ModuleContext getAllKeys', () => {
    it('should only return keys for that specific module context', () => {
      const moduleA = new ModuleContext('tenant-1', 'com.vendor.module-a');
      const moduleB = new ModuleContext('tenant-1', 'com.vendor.module-b');

      moduleA.setState('keyA1', 'val1');
      moduleA.setState('keyA2', 'val2');
      moduleA.setState('keyA3', 'val3');

      moduleB.setState('keyB1', 'val1');
      moduleB.setState('keyB2', 'val2');

      const keysA = moduleA.getAllKeys();
      const keysB = moduleB.getAllKeys();

      // Module A should have exactly its 3 keys
      expect(keysA).toHaveLength(3);
      expect(keysA).toContain('keyA1');
      expect(keysA).toContain('keyA2');
      expect(keysA).toContain('keyA3');

      // Module B should have exactly its 2 keys
      expect(keysB).toHaveLength(2);
      expect(keysB).toContain('keyB1');
      expect(keysB).toContain('keyB2');

      // No cross-contamination
      expect(keysA).not.toContain('keyB1');
      expect(keysB).not.toContain('keyA1');
    });
  });

  // -------------------------------------------------------------------------
  // ModuleContext - Proxy-based state access
  // -------------------------------------------------------------------------

  describe('ModuleContext state proxy', () => {
    it('should enforce isolation through Proxy-based state access', () => {
      const moduleA = new ModuleContext('tenant-1', 'com.vendor.module-a');
      const moduleB = new ModuleContext('tenant-1', 'com.vendor.module-b');

      const proxyA = moduleA.createStateProxy();
      const proxyB = moduleB.createStateProxy();

      // Set via proxy
      proxyA.counter = 10;
      proxyB.counter = 20;

      // Read via proxy
      expect(proxyA.counter).toBe(10);
      expect(proxyB.counter).toBe(20);

      // Cross-verify with direct API
      expect(moduleA.getState('counter')).toBe(10);
      expect(moduleB.getState('counter')).toBe(20);

      // Proxy 'has' check
      expect('counter' in proxyA).toBe(true);
      expect('nonexistent' in proxyA).toBe(false);

      // Proxy delete
      delete proxyA.counter;
      expect(proxyA.counter).toBeUndefined();
      expect(proxyB.counter).toBe(20); // Module B unaffected
    });
  });

  // -------------------------------------------------------------------------
  // StorageAdapter isolation
  // -------------------------------------------------------------------------

  describe('StorageAdapter isolation', () => {
    it('should isolate storage between different modules via key prefixing', () => {
      const storageA = createStorageAdapter({
        tenantId: 'tenant-1',
        moduleId: 'com.vendor.module-a',
      });
      const storageB = createStorageAdapter({
        tenantId: 'tenant-1',
        moduleId: 'com.vendor.module-b',
      });

      // Set same key name on both storages
      storageA.setString('data', 'A');
      storageB.setString('data', 'B');

      // Each adapter should return its own value
      expect(storageA.getString('data')).toBe('A');
      expect(storageB.getString('data')).toBe('B');

      // Number storage
      storageA.setNumber('count', 100);
      storageB.setNumber('count', 200);
      expect(storageA.getNumber('count')).toBe(100);
      expect(storageB.getNumber('count')).toBe(200);

      // Boolean storage
      storageA.setBoolean('active', true);
      storageB.setBoolean('active', false);
      expect(storageA.getBoolean('active')).toBe(true);
      expect(storageB.getBoolean('active')).toBe(false);
    });

    it('should isolate storage between different tenants', () => {
      const storageTenantA = createStorageAdapter({
        tenantId: 'tenant-alpha',
        moduleId: 'com.vendor.module',
      });
      const storageTenantB = createStorageAdapter({
        tenantId: 'tenant-beta',
        moduleId: 'com.vendor.module',
      });

      storageTenantA.setString('config', 'alpha_config');
      storageTenantB.setString('config', 'beta_config');

      expect(storageTenantA.getString('config')).toBe('alpha_config');
      expect(storageTenantB.getString('config')).toBe('beta_config');

      // Clear one tenant's storage
      storageTenantA.clearAll();
      expect(storageTenantA.getString('config')).toBeUndefined();
      expect(storageTenantB.getString('config')).toBe('beta_config');
    });

    it('should return only own keys from getAllKeys', () => {
      const storageA = createStorageAdapter({
        tenantId: 'tenant-1',
        moduleId: 'com.vendor.module-a',
      });
      const storageB = createStorageAdapter({
        tenantId: 'tenant-1',
        moduleId: 'com.vendor.module-b',
      });

      storageA.setString('keyX', 'valX');
      storageA.setString('keyY', 'valY');
      storageB.setString('keyZ', 'valZ');

      const keysA = storageA.getAllKeys();
      const keysB = storageB.getAllKeys();

      expect(keysA).toContain('keyX');
      expect(keysA).toContain('keyY');
      expect(keysA).not.toContain('keyZ');

      expect(keysB).toContain('keyZ');
      expect(keysB).not.toContain('keyX');
    });
  });

  // -------------------------------------------------------------------------
  // DataBus scoped publish
  // -------------------------------------------------------------------------

  describe('DataBus scoped publish', () => {
    it('should NOT notify a different module scoped subscriber on publishScoped', () => {
      const dataBus = new DataBus();

      const moduleACallback = jest.fn();

      // Module A subscribes to scoped channel
      dataBus.subscribeScoped('tenant-1', 'com.vendor.module-a', 'events', moduleACallback);

      // Module B publishes to the SAME channel name but with its own scope
      dataBus.publishScoped('tenant-1', 'com.vendor.module-b', 'events', { msg: 'from B' });

      // Module A's scoped callback should NOT have been called
      // because the scoped channel is tenant-1:com.vendor.module-b:events
      // and module A is subscribed to tenant-1:com.vendor.module-a:events
      expect(moduleACallback).not.toHaveBeenCalled();

      dataBus.clear();
    });

    it('should notify the same module scoped subscriber on publishScoped', () => {
      const dataBus = new DataBus();

      const callback = jest.fn();

      // Module A subscribes to its own scoped channel
      dataBus.subscribeScoped('tenant-1', 'com.vendor.module-a', 'events', callback);

      // Module A publishes on its own scoped channel
      dataBus.publishScoped('tenant-1', 'com.vendor.module-a', 'events', { msg: 'self' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ msg: 'self' });

      dataBus.clear();
    });

    it('should also publish to the global channel on publishScoped', () => {
      const dataBus = new DataBus();

      const globalCallback = jest.fn();

      // Subscribe to the global (unscoped) channel
      dataBus.subscribe('events', globalCallback);

      // Publish scoped for module B
      dataBus.publishScoped('tenant-1', 'com.vendor.module-b', 'events', { msg: 'global too' });

      // The global channel should receive the message
      expect(globalCallback).toHaveBeenCalledTimes(1);
      expect(globalCallback).toHaveBeenCalledWith({ msg: 'global too' });

      dataBus.clear();
    });

    it('should support unsubscribing from scoped channels', () => {
      const dataBus = new DataBus();

      const callback = jest.fn();

      const unsubscribe = dataBus.subscribeScoped(
        'tenant-1',
        'com.vendor.module-a',
        'events',
        callback,
      );

      // First publish should trigger callback
      dataBus.publishScoped('tenant-1', 'com.vendor.module-a', 'events', { msg: 'first' });
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second publish should NOT trigger callback
      dataBus.publishScoped('tenant-1', 'com.vendor.module-a', 'events', { msg: 'second' });
      expect(callback).toHaveBeenCalledTimes(1);

      dataBus.clear();
    });
  });
});
