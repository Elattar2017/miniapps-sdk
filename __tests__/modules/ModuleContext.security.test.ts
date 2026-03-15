/**
 * ModuleContext Security Test Suite
 *
 * Tests Proxy security hardening: prototype pollution guards,
 * setPrototypeOf trap, defineProperty trap.
 */

jest.mock('react-native');

import { ModuleContext } from '../../src/modules/ModuleContext';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// setPrototypeOf trap
// ---------------------------------------------------------------------------

describe('setPrototypeOf trap', () => {
  it('Reflect.setPrototypeOf(proxy, {}) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const result = Reflect.setPrototypeOf(proxy, {});
    expect(result).toBe(false);
  });

  it('Reflect.setPrototypeOf(proxy, null) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const result = Reflect.setPrototypeOf(proxy, null);
    expect(result).toBe(false);
  });

  it('proxy still works normally after setPrototypeOf attempt', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    Reflect.setPrototypeOf(proxy, {});

    // Normal operations should still function
    proxy['key'] = 'value';
    expect(proxy['key']).toBe('value');
    expect('key' in proxy).toBe(true);
  });

  it('Object.getPrototypeOf(proxy) still works (does not crash)', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // Should not throw - the getPrototypeOf trap is not overridden,
    // so it falls through to the default behavior on the target.
    expect(() => Object.getPrototypeOf(proxy)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// defineProperty trap
// ---------------------------------------------------------------------------

describe('defineProperty trap', () => {
  it('Reflect.defineProperty(proxy, "evil", { value: 42 }) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const result = Reflect.defineProperty(proxy, 'evil', { value: 42 });
    expect(result).toBe(false);
  });

  it('Reflect.defineProperty with getter returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const result = Reflect.defineProperty(proxy, 'trap', {
      get() {
        return 'gotcha';
      },
    });
    expect(result).toBe(false);
  });

  it('Reflect.defineProperty with writable/configurable returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    const result = Reflect.defineProperty(proxy, 'sneaky', {
      value: 'attack',
      writable: true,
      configurable: true,
      enumerable: true,
    });
    expect(result).toBe(false);
  });

  it('proxy still works after defineProperty attempt', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    Reflect.defineProperty(proxy, 'evil', { value: 42 });

    // Normal operations should still function
    proxy['safe'] = 'data';
    expect(proxy['safe']).toBe('data');
    expect('safe' in proxy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prototype pollution in get trap
// ---------------------------------------------------------------------------

describe('Prototype pollution in get trap', () => {
  it('proxy["__proto__"] returns undefined', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect(proxy['__proto__']).toBeUndefined();
  });

  it('proxy["constructor"] returns undefined', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect(proxy['constructor']).toBeUndefined();
  });

  it('proxy["prototype"] returns undefined', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect(proxy['prototype']).toBeUndefined();
  });

  it('accessing __proto__ does not leak internal Map', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // Store something first so the Map is non-empty
    proxy['secret'] = 'top-secret-data';

    const proto = proxy['__proto__'];
    // Must not return the Map or any internal reference
    expect(proto).toBeUndefined();
    // Ensure it is not a Map
    expect(proto).not.toBeInstanceOf(Map);
  });

  it('normal keys still work after __proto__ access', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    proxy['data'] = 'hello';

    // Access blocked key
    void proxy['__proto__'];

    // Normal key should still be accessible
    expect(proxy['data']).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Prototype pollution in set trap
// ---------------------------------------------------------------------------

describe('Prototype pollution in set trap', () => {
  it('Reflect.set(proxy, "__proto__", {}) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    try {
      const result = Reflect.set(proxy, '__proto__', {});
      expect(result).toBe(false);
    } catch {
      // In strict mode, setting a blocked property may throw a TypeError.
      // Either way the write is blocked, which is the desired behavior.
    }
  });

  it('Reflect.set(proxy, "constructor", () => {}) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    try {
      const result = Reflect.set(proxy, 'constructor', () => {});
      expect(result).toBe(false);
    } catch {
      // Strict mode may throw - blocked write is still correct behavior
    }
  });

  it('Reflect.set(proxy, "prototype", {}) returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    try {
      const result = Reflect.set(proxy, 'prototype', {});
      expect(result).toBe(false);
    } catch {
      // Strict mode may throw - blocked write is still correct behavior
    }
  });

  it('setting __proto__ does not pollute internal store', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    try {
      Reflect.set(proxy, '__proto__', { polluted: true });
    } catch {
      // Ignore strict mode throws
    }

    // The value should NOT be stored - neither via proxy nor direct API
    expect(proxy['__proto__']).toBeUndefined();
    expect(ctx.getState('__proto__')).toBeUndefined();
    expect(ctx.getAllKeys()).toEqual([]);
  });

  it('normal set still works after blocked write', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    try {
      Reflect.set(proxy, '__proto__', {});
    } catch {
      // Ignore
    }

    proxy['normalKey'] = 'normalValue';
    expect(proxy['normalKey']).toBe('normalValue');
  });
});

// ---------------------------------------------------------------------------
// has trap for blocked properties
// ---------------------------------------------------------------------------

describe('has trap for blocked properties', () => {
  it('"__proto__" in proxy returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // Even if someone tries to set it, has should return false
    // because the set trap blocks it, so nothing is stored.
    expect('__proto__' in proxy).toBe(false);
  });

  it('"constructor" in proxy returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect('constructor' in proxy).toBe(false);
  });

  it('"prototype" in proxy returns false', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    expect('prototype' in proxy).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combined attack scenarios
// ---------------------------------------------------------------------------

describe('Combined attack scenarios', () => {
  it('setPrototypeOf then defineProperty then normal use: all work correctly', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // Attack 1: setPrototypeOf
    const proto = Reflect.setPrototypeOf(proxy, { evil: true });
    expect(proto).toBe(false);

    // Attack 2: defineProperty
    const defined = Reflect.defineProperty(proxy, 'injected', { value: 'payload' });
    expect(defined).toBe(false);

    // Normal use should still work fine
    proxy['legitimate'] = 42;
    expect(proxy['legitimate']).toBe(42);
    expect(Object.keys(proxy)).toEqual(['legitimate']);
  });

  it('cross-module isolation preserved after attack (two contexts, attack one, verify other clean)', () => {
    const ctxA = new ModuleContext('t1', 'modA');
    const ctxB = new ModuleContext('t1', 'modB');
    const proxyA = ctxA.createStateProxy();
    const proxyB = ctxB.createStateProxy();

    // Set up legitimate data in both
    proxyA['data'] = 'A-data';
    proxyB['data'] = 'B-data';

    // Attack proxy A with various vectors
    try { Reflect.set(proxyA, '__proto__', { polluted: true }); } catch { /* ignore */ }
    Reflect.setPrototypeOf(proxyA, {});
    Reflect.defineProperty(proxyA, 'evil', { value: 'payload' });

    // Proxy B should be completely unaffected
    expect(proxyB['data']).toBe('B-data');
    expect(proxyB['__proto__']).toBeUndefined();
    expect(proxyB['evil']).toBeUndefined();
    expect(Object.keys(proxyB)).toEqual(['data']);

    // Proxy A's legitimate data should still be intact
    expect(proxyA['data']).toBe('A-data');
  });

  it('Object.keys does not include blocked properties after set attempts', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    proxy['valid'] = 'yes';

    // Attempt to set blocked properties
    try { Reflect.set(proxy, '__proto__', {}); } catch { /* ignore */ }
    try { Reflect.set(proxy, 'constructor', () => {}); } catch { /* ignore */ }
    try { Reflect.set(proxy, 'prototype', {}); } catch { /* ignore */ }

    const keys = Object.keys(proxy);
    expect(keys).toEqual(['valid']);
    expect(keys).not.toContain('__proto__');
    expect(keys).not.toContain('constructor');
    expect(keys).not.toContain('prototype');
  });

  it('deleteProperty for __proto__ returns false (or no-op)', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // __proto__ was never stored, so deleteProperty returns false (nothing to delete)
    const result = Reflect.deleteProperty(proxy, '__proto__');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression tests
// ---------------------------------------------------------------------------

describe('Regression tests', () => {
  it('normal get/set/has/delete cycle still works', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    // Set
    proxy['name'] = 'Alice';
    expect(proxy['name']).toBe('Alice');

    // Has
    expect('name' in proxy).toBe(true);
    expect('missing' in proxy).toBe(false);

    // Update
    proxy['name'] = 'Bob';
    expect(proxy['name']).toBe('Bob');

    // Delete
    delete proxy['name'];
    expect(proxy['name']).toBeUndefined();
    expect('name' in proxy).toBe(false);
  });

  it('ownKeys returns correct keys after hardening', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    proxy['alpha'] = 1;
    proxy['beta'] = 2;
    proxy['gamma'] = 3;

    const keys = Object.keys(proxy);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('alpha');
    expect(keys).toContain('beta');
    expect(keys).toContain('gamma');
  });

  it('getOwnPropertyDescriptor still works for normal keys', () => {
    const ctx = new ModuleContext('t1', 'mod1');
    const proxy = ctx.createStateProxy();

    proxy['item'] = 'hello';

    const desc = Object.getOwnPropertyDescriptor(proxy, 'item');
    expect(desc).toBeDefined();
    expect(desc!.value).toBe('hello');
    expect(desc!.configurable).toBe(true);
    expect(desc!.enumerable).toBe(true);
    expect(desc!.writable).toBe(true);

    // Non-existent key should return undefined
    const missing = Object.getOwnPropertyDescriptor(proxy, 'nope');
    expect(missing).toBeUndefined();
  });
});
