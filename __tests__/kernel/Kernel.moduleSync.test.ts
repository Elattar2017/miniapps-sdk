/**
 * Kernel Module Sync Coverage Tests
 *
 * Tests uncovered branches in Kernel.ts doModuleSync() method:
 * - Successful module list fetch and registration
 * - Individual module manifest load failure (skipped, logged)
 * - Empty module list from server
 * - Mixed success/failure registration
 * - Module state transitions during sync
 * - Network error during module list fetch
 * - Module count in getStatus() after sync
 */

import { RuntimeKernel } from '../../src/kernel/Kernel';
import type { KernelConfig, ModuleSummary, ModuleManifest } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJWT(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

function validClaims(): Record<string, unknown> {
  return {
    sub: 'user-1',
    iss: 'test-issuer',
    aud: 'sdk',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    tenantId: 'test-tenant',
  };
}

function createValidConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    authToken: createMockJWT(validClaims()),
    tenantId: 'test-tenant',
    userId: 'user-1',
    apiBaseUrl: 'https://api.example.com',
    zones: { main: { type: 'fill', position: 'fill' } },
    ...overrides,
  };
}

function makeModuleSummary(id: string): ModuleSummary {
  return {
    id,
    name: `Module ${id}`,
    icon: 'icon.png',
    category: 'tools',
    version: '1.0.0',
    description: `Description for ${id}`,
  };
}

function makeManifest(id: string): ModuleManifest {
  return {
    id,
    name: `Module ${id}`,
    version: '1.0.0',
    icon: 'icon.png',
    category: 'tools',
    description: `Description for ${id}`,
    entryScreen: 'home',
    screens: ['home'],
    requiredPermissions: [],
    // Signature must decode to >= 32 bytes for PKIVerifier
    signature: btoa('a]b]c]d]e]f]g]h]i]j]k]l]m]n]o]p]'),
  };
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let mockFetch: jest.Mock;

function setupFetch(
  impl: (url: string, init?: RequestInit) => Promise<Partial<Response>>,
): void {
  mockFetch = jest.fn(impl);
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Suppress console noise
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kernel – doModuleSync() branches', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
  });

  afterEach(async () => {
    const s = kernel.getState();
    if (s === 'ACTIVE' || s === 'SUSPEND' || s === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('fetches and registers all modules on successful module list', async () => {
    const summaries: ModuleSummary[] = [
      makeModuleSummary('com.vendor.budgetapp'),
      makeModuleSummary('com.vendor.reportapp'),
    ];

    setupFetch((url: string) => {
      // Policy endpoint
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      // Module list endpoint
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(summaries),
          headers: new Headers(),
        } as Response);
      }
      // Individual manifest endpoints
      if (url.includes('/api/modules/') && url.includes('/manifest')) {
        const moduleId = url.split('/api/modules/')[1].split('/manifest')[0];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(makeManifest(moduleId)),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    const status = kernel.getStatus();
    expect(status.moduleCount).toBe(2);

    const registry = kernel.getModuleRegistry();
    const all = registry.getAll();
    expect(all.length).toBe(2);
    // Modules should be in 'ready' state after successful sync
    expect(all[0].state).toBe('ready');
    expect(all[1].state).toBe('ready');
  });

  it('skips module with failed manifest load and continues with rest', async () => {
    const summaries: ModuleSummary[] = [
      makeModuleSummary('com.vendor.goodmodule'),
      makeModuleSummary('com.vendor.badmodule'),
    ];

    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(summaries),
          headers: new Headers(),
        } as Response);
      }
      // Good module manifest
      if (url.includes('/com.vendor.goodmodule/manifest')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(makeManifest('com.vendor.goodmodule')),
          headers: new Headers(),
        } as Response);
      }
      // Bad module manifest - returns 500
      if (url.includes('/com.vendor.badmodule/manifest')) {
        return Promise.resolve({
          ok: false, status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' }),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    // Only the good module should be registered
    const status = kernel.getStatus();
    expect(status.moduleCount).toBe(1);

    const registry = kernel.getModuleRegistry();
    expect(registry.get('com.vendor.goodmodule')).toBeDefined();
    expect(registry.get('com.vendor.badmodule')).toBeUndefined();
  });

  it('completes without error when module list is empty', async () => {
    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');
    expect(kernel.getStatus().moduleCount).toBe(0);
  });

  it('registers only successful modules in mixed success/failure scenario', async () => {
    const summaries: ModuleSummary[] = [
      makeModuleSummary('com.ok.first'),
      makeModuleSummary('com.fail.second'),
      makeModuleSummary('com.ok.third'),
    ];

    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(summaries),
          headers: new Headers(),
        } as Response);
      }
      if (url.includes('/com.ok.first/manifest')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(makeManifest('com.ok.first')),
          headers: new Headers(),
        } as Response);
      }
      if (url.includes('/com.fail.second/manifest')) {
        return Promise.reject(new Error('Network timeout'));
      }
      if (url.includes('/com.ok.third/manifest')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(makeManifest('com.ok.third')),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');
    expect(kernel.getStatus().moduleCount).toBe(2);

    const registry = kernel.getModuleRegistry();
    expect(registry.get('com.ok.first')).toBeDefined();
    expect(registry.get('com.fail.second')).toBeUndefined();
    expect(registry.get('com.ok.third')).toBeDefined();
  });

  it('module state transitions: loading -> ready after registration', async () => {
    const summaries: ModuleSummary[] = [
      makeModuleSummary('com.vendor.statetest'),
    ];

    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(summaries),
          headers: new Headers(),
        } as Response);
      }
      if (url.includes('/com.vendor.statetest/manifest')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(makeManifest('com.vendor.statetest')),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());

    const instance = kernel.getModuleRegistry().get('com.vendor.statetest');
    expect(instance).toBeDefined();
    // After doModuleSync, module should be in 'ready' state
    expect(instance!.state).toBe('ready');
  });

  it('handles network error during module list fetch gracefully', async () => {
    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.reject(new Error('DNS resolution failed'));
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    // Kernel should still boot to ACTIVE with empty module registry
    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');
    expect(kernel.getStatus().moduleCount).toBe(0);
  });

  it('module count in getStatus reflects registered modules', async () => {
    const summaries: ModuleSummary[] = [
      makeModuleSummary('com.test.moduleone'),
      makeModuleSummary('com.test.moduletwo'),
      makeModuleSummary('com.test.modulethree'),
    ];

    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response);
      }
      if (url.endsWith('/api/modules')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(summaries),
          headers: new Headers(),
        } as Response);
      }
      if (url.includes('/manifest')) {
        const moduleId = url.split('/api/modules/')[1].split('/manifest')[0];
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(makeManifest(moduleId)),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({}),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getStatus().moduleCount).toBe(3);
  });
});
