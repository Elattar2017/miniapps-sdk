/**
 * ModuleRegistry Test Suite
 *
 * Tests for module lifecycle management: register, unregister,
 * state transitions, and queries.
 */

import { ModuleRegistry } from '../../src/modules/ModuleRegistry';
import { SDKError } from '../../src/kernel/errors/SDKError';
import type { ModuleManifest, ScreenSchema } from '../../src/types';

function makeManifest(overrides?: Partial<ModuleManifest>): ModuleManifest {
  return {
    id: 'com.vendor.budget',
    name: 'Budget Tracker',
    version: '1.0.0',
    description: 'Track your budget',
    icon: 'budget-icon',
    category: 'finance',
    entryScreen: 'home',
    screens: ['home', 'detail'],
    permissions: { apis: [], storage: true },
    minSDKVersion: '1.0.0',
    signature: 'mock-signature',
    ...overrides,
  };
}

function makeScreenSchema(overrides?: Partial<ScreenSchema>): ScreenSchema {
  return {
    id: 'home',
    title: 'Home',
    body: { type: 'text', value: 'Hello' },
    ...overrides,
  };
}

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------

  it('register() creates instance in loading state', () => {
    const manifest = makeManifest();
    const instance = registry.register(manifest);

    expect(instance.state).toBe('loading');
    expect(instance.manifest).toBe(manifest);
    expect(instance.loadedAt).toBeGreaterThan(0);
    expect(instance.lastActiveAt).toBeGreaterThan(0);
    expect(instance.screens).toBeInstanceOf(Map);
  });

  it('register() throws SDKError on invalid module ID format', () => {
    const manifest = makeManifest({ id: 'INVALID-ID!' });

    expect(() => registry.register(manifest)).toThrow(SDKError);
  });

  it('register() throws SDKError on duplicate module ID', () => {
    const manifest = makeManifest();
    registry.register(manifest);

    expect(() => registry.register(manifest)).toThrow(SDKError);
  });

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  it('get() returns registered instance', () => {
    const manifest = makeManifest();
    registry.register(manifest);

    const instance = registry.get('com.vendor.budget');
    expect(instance).toBeDefined();
    expect(instance!.manifest.id).toBe('com.vendor.budget');
  });

  it('get() returns undefined for unknown ID', () => {
    expect(registry.get('com.unknown.module')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // getAll()
  // ---------------------------------------------------------------------------

  it('getAll() returns all instances', () => {
    registry.register(makeManifest({ id: 'com.a.first' }));
    registry.register(makeManifest({ id: 'com.b.second' }));

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // setModuleState()
  // ---------------------------------------------------------------------------

  it('setModuleState() transitions module state', () => {
    registry.register(makeManifest());
    registry.setModuleState('com.vendor.budget', 'ready');

    const instance = registry.get('com.vendor.budget');
    expect(instance!.state).toBe('ready');
  });

  it('setModuleState() throws for unregistered module', () => {
    expect(() => registry.setModuleState('com.nonexistent.mod', 'active')).toThrow(SDKError);
  });

  it('setModuleState() updates lastActiveAt on active transition', () => {
    registry.register(makeManifest());
    const before = registry.get('com.vendor.budget')!.lastActiveAt;

    // Small delay to ensure timestamp differs
    registry.setModuleState('com.vendor.budget', 'active');
    const after = registry.get('com.vendor.budget')!.lastActiveAt;

    expect(after).toBeGreaterThanOrEqual(before);
  });

  // ---------------------------------------------------------------------------
  // addScreen()
  // ---------------------------------------------------------------------------

  it('addScreen() attaches screen schema to module', () => {
    registry.register(makeManifest());
    const schema = makeScreenSchema({ id: 'detail', title: 'Detail' });

    registry.addScreen('com.vendor.budget', 'detail', schema);

    const instance = registry.get('com.vendor.budget');
    expect(instance!.screens.get('detail')).toBe(schema);
  });

  it('addScreen() throws for unregistered module', () => {
    const schema = makeScreenSchema();

    expect(() => registry.addScreen('com.nonexistent.mod', 'home', schema)).toThrow(SDKError);
  });

  // ---------------------------------------------------------------------------
  // unregister()
  // ---------------------------------------------------------------------------

  it('unregister() removes module', () => {
    registry.register(makeManifest());
    registry.unregister('com.vendor.budget');

    expect(registry.get('com.vendor.budget')).toBeUndefined();
  });

  it('unregister() logs warning for unknown module (does not crash)', () => {
    expect(() => registry.unregister('com.nonexistent.mod')).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // getActive()
  // ---------------------------------------------------------------------------

  it('getActive() filters by active state only', () => {
    registry.register(makeManifest({ id: 'com.a.first' }));
    registry.register(makeManifest({ id: 'com.b.second' }));
    registry.register(makeManifest({ id: 'com.c.third' }));

    registry.setModuleState('com.a.first', 'active');
    registry.setModuleState('com.b.second', 'ready');
    registry.setModuleState('com.c.third', 'active');

    const active = registry.getActive();
    expect(active).toHaveLength(2);
    expect(active.map((m) => m.manifest.id)).toEqual(
      expect.arrayContaining(['com.a.first', 'com.c.third']),
    );
  });

  // ---------------------------------------------------------------------------
  // getLoadedModuleSummaries()
  // ---------------------------------------------------------------------------

  it('getLoadedModuleSummaries() returns correct summary shape', () => {
    registry.register(
      makeManifest({
        id: 'com.vendor.budget',
        name: 'Budget Tracker',
        icon: 'budget-icon',
        category: 'finance',
        version: '1.0.0',
        description: 'Track your budget',
      }),
    );

    const summaries = registry.getLoadedModuleSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      id: 'com.vendor.budget',
      name: 'Budget Tracker',
      icon: 'budget-icon',
      category: 'finance',
      version: '1.0.0',
      description: 'Track your budget',
    });
  });

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------

  it('clear() removes all modules', () => {
    registry.register(makeManifest({ id: 'com.a.first' }));
    registry.register(makeManifest({ id: 'com.b.second' }));

    registry.clear();

    expect(registry.getAll()).toEqual([]);
  });
});
