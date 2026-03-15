/**
 * ModuleRegistry Lifecycle Test Suite
 *
 * Tests suspend, resume, unload, and getModulesByStatus.
 */

import { ModuleRegistry } from '../../src/modules/ModuleRegistry';
import type { ModuleManifest } from '../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createManifest(id = 'com.test.module'): ModuleManifest {
  return {
    id,
    name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    icon: 'test-icon',
    category: 'test',
    entryScreen: 'main',
    screens: ['main'],
    permissions: { apis: [], storage: false },
    minSDKVersion: '1.0.0',
    signature: 'dGVzdA==',
  };
}

function createMockDataBus() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    unsubscribe: jest.fn(),
    getSubscriberCount: jest.fn().mockReturnValue(0),
    getChannels: jest.fn().mockReturnValue([]),
    publishScoped: jest.fn(),
    subscribeScoped: jest.fn(),
    clear: jest.fn(),
  };
}

function createMockTokenManager() {
  return {
    invalidateToken: jest.fn(),
    acquireToken: jest.fn(),
    getToken: jest.fn(),
    refreshToken: jest.fn(),
    startRefreshTimer: jest.fn(),
    stopRefreshTimer: jest.fn(),
  };
}

describe('ModuleRegistry lifecycle', () => {
  it('suspendModule sets status to suspended', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.setModuleState('com.test.module', 'active');

    registry.suspendModule('com.test.module');
    expect(registry.get('com.test.module')?.state).toBe('suspended');
  });

  it('suspendModule publishes sdk:module:suspended event', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.setModuleState('com.test.module', 'active');

    registry.suspendModule('com.test.module');
    expect(dataBus.publish).toHaveBeenCalledWith('sdk:module:suspended', { moduleId: 'com.test.module' });
  });

  it('suspendModule on non-existent module throws', () => {
    const registry = new ModuleRegistry();
    expect(() => registry.suspendModule('nonexistent')).toThrow();
  });

  it('resumeModule sets status back to active', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.setModuleState('com.test.module', 'active');
    registry.suspendModule('com.test.module');

    registry.resumeModule('com.test.module');
    expect(registry.get('com.test.module')?.state).toBe('active');
  });

  it('resumeModule publishes sdk:module:resumed event', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.suspendModule('com.test.module');

    registry.resumeModule('com.test.module');
    expect(dataBus.publish).toHaveBeenCalledWith('sdk:module:resumed', { moduleId: 'com.test.module' });
  });

  it('resumeModule on non-suspended module is no-op', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.setModuleState('com.test.module', 'active');

    registry.resumeModule('com.test.module');
    expect(registry.get('com.test.module')?.state).toBe('active');
    expect(dataBus.publish).not.toHaveBeenCalledWith('sdk:module:resumed', expect.anything());
  });

  it('unloadModule removes module from registry', () => {
    const registry = new ModuleRegistry();
    registry.register(createManifest());
    registry.unloadModule('com.test.module');
    expect(registry.get('com.test.module')).toBeUndefined();
  });

  it('unloadModule publishes sdk:module:unloaded event', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.unloadModule('com.test.module');
    expect(dataBus.publish).toHaveBeenCalledWith('sdk:module:unloaded', { moduleId: 'com.test.module' });
  });

  it('unloadModule calls moduleTokenManager.invalidateToken', () => {
    const tokenManager = createMockTokenManager();
    const registry = new ModuleRegistry(undefined, tokenManager as any);
    registry.register(createManifest());
    registry.unloadModule('com.test.module');
    expect(tokenManager.invalidateToken).toHaveBeenCalledWith('com.test.module');
  });

  it('getModulesByStatus returns correct filtered list', () => {
    const registry = new ModuleRegistry();
    registry.register(createManifest('com.mod.a'));
    registry.register(createManifest('com.mod.b'));
    registry.setModuleState('com.mod.a', 'active');

    const active = registry.getModulesByStatus('active');
    expect(active).toHaveLength(1);
    expect(active[0].manifest.id).toBe('com.mod.a');
  });

  it('full lifecycle: register → active → suspend → resume → unload', () => {
    const dataBus = createMockDataBus();
    const registry = new ModuleRegistry(dataBus as any);
    registry.register(createManifest());
    registry.setModuleState('com.test.module', 'active');
    expect(registry.get('com.test.module')?.state).toBe('active');

    registry.suspendModule('com.test.module');
    expect(registry.get('com.test.module')?.state).toBe('suspended');

    registry.resumeModule('com.test.module');
    expect(registry.get('com.test.module')?.state).toBe('active');

    registry.unloadModule('com.test.module');
    expect(registry.get('com.test.module')).toBeUndefined();
  });

  it('double unload: second call is no-op', () => {
    const registry = new ModuleRegistry();
    registry.register(createManifest());
    registry.unloadModule('com.test.module');
    expect(() => registry.unloadModule('com.test.module')).not.toThrow();
  });

  it('suspend → unload works without resume', () => {
    const registry = new ModuleRegistry();
    registry.register(createManifest());
    registry.suspendModule('com.test.module');
    registry.unloadModule('com.test.module');
    expect(registry.get('com.test.module')).toBeUndefined();
  });

  it('getModulesByStatus with no matches returns empty array', () => {
    const registry = new ModuleRegistry();
    expect(registry.getModulesByStatus('active')).toHaveLength(0);
  });
});
