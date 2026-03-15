/**
 * ModuleContext Test Suite
 *
 * Tests for the Proxy-based isolated state system that enforces
 * tenant/module scoping at the JavaScript level.
 */

import { ModuleContext } from '../../src/modules/ModuleContext';

describe('ModuleContext', () => {
  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  it('creates context with tenant and module ID', () => {
    const ctx = new ModuleContext('tenant-a', 'com.vendor.budget');
    // Constructor does not throw; context is usable
    expect(ctx).toBeDefined();
    expect(ctx.getAllKeys()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // createStateProxy() - basics
  // ---------------------------------------------------------------------------

  it('createStateProxy() returns a Proxy object', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    expect(proxy).toBeDefined();
    expect(typeof proxy).toBe('object');
  });

  // ---------------------------------------------------------------------------
  // Proxy set / get
  // ---------------------------------------------------------------------------

  it('Proxy set stores value with scoped key internally', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['count'] = 42;

    // Verify via direct API that it was stored with the prefix
    expect(ctx.getState('count')).toBe(42);
  });

  it('Proxy get retrieves value that was set', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['name'] = 'test';

    expect(proxy['name']).toBe('test');
  });

  it('Proxy get returns undefined for symbol props (not string keys)', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    const sym = Symbol('test');

    expect((proxy as any)[sym]).toBeUndefined();
  });

  it('Proxy set returns false for symbol props', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    const sym = Symbol('test');

    // In strict mode, setting a symbol returns false from the handler
    // We test via Reflect.set which returns the boolean
    const result = Reflect.set(proxy, sym, 'value');
    expect(result).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Proxy has
  // ---------------------------------------------------------------------------

  it('Proxy has returns true for existing key', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['exists'] = true;

    expect('exists' in proxy).toBe(true);
  });

  it('Proxy has returns false for missing key', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect('missing' in proxy).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Proxy deleteProperty
  // ---------------------------------------------------------------------------

  it('Proxy deleteProperty removes key', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['toRemove'] = 'value';

    delete proxy['toRemove'];
    expect(proxy['toRemove']).toBeUndefined();
    expect('toRemove' in proxy).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Proxy ownKeys
  // ---------------------------------------------------------------------------

  it('Proxy ownKeys returns only this module\'s keys (unprefixed)', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['alpha'] = 1;
    proxy['beta'] = 2;

    const keys = Object.keys(proxy);
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
    expect(keys).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Proxy getOwnPropertyDescriptor
  // ---------------------------------------------------------------------------

  it('Proxy getOwnPropertyDescriptor returns descriptor for existing key', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();
    proxy['item'] = 'hello';

    const desc = Object.getOwnPropertyDescriptor(proxy, 'item');
    expect(desc).toBeDefined();
    expect(desc!.value).toBe('hello');
    expect(desc!.configurable).toBe(true);
    expect(desc!.enumerable).toBe(true);
    expect(desc!.writable).toBe(true);
  });

  it('Proxy getOwnPropertyDescriptor returns undefined for missing key', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const desc = Object.getOwnPropertyDescriptor(proxy, 'nope');
    expect(desc).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Direct state API: getState / setState
  // ---------------------------------------------------------------------------

  it('getState(key) returns stored value', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    ctx.setState('color', 'blue');

    expect(ctx.getState('color')).toBe('blue');
  });

  it('getState(key) returns undefined for unknown key', () => {
    const ctx = new ModuleContext('t1', 'mod1');

    expect(ctx.getState('unknown')).toBeUndefined();
  });

  it('setState(key, value) stores value', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    ctx.setState('count', 10);

    expect(ctx.getState('count')).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // clearState()
  // ---------------------------------------------------------------------------

  it('clearState() removes all module-scoped entries', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    ctx.setState('a', 1);
    ctx.setState('b', 2);
    ctx.setState('c', 3);

    ctx.clearState();

    expect(ctx.getState('a')).toBeUndefined();
    expect(ctx.getState('b')).toBeUndefined();
    expect(ctx.getState('c')).toBeUndefined();
    expect(ctx.getAllKeys()).toEqual([]);
  });

  it('clearState() does NOT affect other modules\' entries (cross-module isolation)', () => {
    // ModuleContext uses a per-instance store so each context is fully isolated.
    // This test verifies that clearing one context does not touch another.
    const ctxA = new ModuleContext('t1', 'modA');
    const ctxB = new ModuleContext('t1', 'modB');

    ctxA.setState('shared', 'A-value');
    ctxB.setState('shared', 'B-value');

    ctxA.clearState();

    expect(ctxA.getState('shared')).toBeUndefined();
    expect(ctxB.getState('shared')).toBe('B-value');
  });

  // ---------------------------------------------------------------------------
  // getAllKeys()
  // ---------------------------------------------------------------------------

  it('getAllKeys() returns unprefixed keys', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    ctx.setState('x', 1);
    ctx.setState('y', 2);

    const keys = ctx.getAllKeys();
    expect(keys).toContain('x');
    expect(keys).toContain('y');
    expect(keys).toHaveLength(2);
    // Keys should NOT contain the tenant:module prefix
    keys.forEach((k) => {
      expect(k).not.toContain(':');
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-module isolation
  // ---------------------------------------------------------------------------

  it('two ModuleContexts with different moduleIds cannot see each other\'s state', () => {
    const ctxA = new ModuleContext('t1', 'modA');
    const ctxB = new ModuleContext('t1', 'modB');

    ctxA.setState('secret', 'A-secret');
    ctxB.setState('secret', 'B-secret');

    // Each context only sees its own value
    expect(ctxA.getState('secret')).toBe('A-secret');
    expect(ctxB.getState('secret')).toBe('B-secret');

    // Proxy-based access is also isolated
    const proxyA = ctxA.createStateProxy();
    const proxyB = ctxB.createStateProxy();
    proxyA['val'] = 100;
    proxyB['val'] = 200;

    expect(proxyA['val']).toBe(100);
    expect(proxyB['val']).toBe(200);
  });
});
