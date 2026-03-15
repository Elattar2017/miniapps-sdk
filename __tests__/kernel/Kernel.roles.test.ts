/**
 * RuntimeKernel Roles & Remote Policy Test Suite
 * Tests JWT roles extraction during auth and remote policy fetching during policy sync.
 */

import { RuntimeKernel } from '../../src/kernel/Kernel';
import type { KernelConfig } from '../../src/types';

// Mock fetch globally
const mockFetch = jest.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFetch.mockReset();
  // Default: fetch rejects (simulates no network / no policy endpoint)
  mockFetch.mockRejectedValue(new Error('Network error'));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Create a mock JWT token with the given claims.
 * Uses base64 encoding (not base64url) since the SDK's base64UrlDecode
 * handles both via character replacement.
 */
function createMockJWT(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

/** Build a valid kernel config with a non-expired JWT */
function createValidConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    authToken: createMockJWT({
      sub: 'user-1',
      iss: 'test',
      aud: 'sdk',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      tenantId: 'test-tenant',
    }),
    tenantId: 'test-tenant',
    userId: 'user-1',
    apiBaseUrl: 'https://api.example.com',
    zones: { main: { type: 'fill', position: 'fill' } },
    ...overrides,
  };
}

describe('RuntimeKernel - JWT Roles Extraction', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
  });

  afterEach(async () => {
    const state = kernel.getState();
    if (state === 'ACTIVE' || state === 'SUSPEND' || state === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('should extract roles from JWT claims during auth', async () => {
    const config = createValidConfig({
      authToken: createMockJWT({
        sub: 'user-1',
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'test-tenant',
        roles: ['admin', 'editor'],
      }),
    });

    await kernel.boot(config);

    expect(kernel.getUserRoles()).toEqual(['admin', 'editor']);
  });

  it('should default to empty roles when JWT has no roles claim', async () => {
    const config = createValidConfig();

    await kernel.boot(config);

    expect(kernel.getUserRoles()).toEqual([]);
  });

  it('should return a copy of roles (not internal array reference)', async () => {
    const config = createValidConfig({
      authToken: createMockJWT({
        sub: 'user-1',
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'test-tenant',
        roles: ['viewer'],
      }),
    });

    await kernel.boot(config);

    const roles1 = kernel.getUserRoles();
    const roles2 = kernel.getUserRoles();
    expect(roles1).toEqual(roles2);
    expect(roles1).not.toBe(roles2);
  });

  it('should reset roles on shutdown', async () => {
    const config = createValidConfig({
      authToken: createMockJWT({
        sub: 'user-1',
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'test-tenant',
        roles: ['admin'],
      }),
    });

    await kernel.boot(config);
    expect(kernel.getUserRoles()).toEqual(['admin']);

    await kernel.shutdown();
    expect(kernel.getUserRoles()).toEqual([]);
  });
});

describe('RuntimeKernel - Remote Policy Sync', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
  });

  afterEach(async () => {
    const state = kernel.getState();
    if (state === 'ACTIVE' || state === 'SUSPEND' || state === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('should load remote policies when fetch succeeds', async () => {
    const remotePolicies = [
      { id: 'remote-deny-admin', effect: 'deny', resource: 'module:admin', action: '*', priority: 10, conditions: [] },
    ];

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/sdk/policies')) {
        return {
          ok: true,
          json: async () => remotePolicies,
        };
      }
      // Module list fetch should fail gracefully
      throw new Error('Not found');
    });

    const config = createValidConfig();
    await kernel.boot(config);

    // Policy engine should contain remote + default policies
    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(2);
    expect(policies.some((p) => p.id === 'remote-deny-admin')).toBe(true);
    expect(policies.some((p) => p.id === 'default-allow-all')).toBe(true);
  });

  it('should fall back to default-allow when remote fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const config = createValidConfig();
    await kernel.boot(config);

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });

  it('should keep default-allow only when remote returns empty array', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/sdk/policies')) {
        return {
          ok: true,
          json: async () => [],
        };
      }
      throw new Error('Not found');
    });

    const config = createValidConfig();
    await kernel.boot(config);

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });

  it('should use correct URL and auth header when fetching remote policies', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/sdk/policies')) {
        return {
          ok: true,
          json: async () => [],
        };
      }
      throw new Error('Not found');
    });

    const config = createValidConfig();
    await kernel.boot(config);

    // Find the call to /sdk/policies
    const policyCall = mockFetch.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('/sdk/policies'),
    );
    expect(policyCall).toBeDefined();
    expect(policyCall![0]).toBe('https://api.example.com/api/sdk/policies');
    expect(policyCall![1]).toEqual({
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.authToken}`,
      },
    });
  });

  it('should keep default-allow when remote returns non-OK response', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/sdk/policies')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal server error' }),
        };
      }
      throw new Error('Not found');
    });

    const config = createValidConfig();
    await kernel.boot(config);

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });

  it('should keep default-allow when remote returns non-array JSON', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/sdk/policies')) {
        return {
          ok: true,
          json: async () => ({ policies: [] }),
        };
      }
      throw new Error('Not found');
    });

    const config = createValidConfig();
    await kernel.boot(config);

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });

  it('should still boot successfully when policy fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

    const config = createValidConfig();
    await kernel.boot(config);

    expect(kernel.getState()).toBe('ACTIVE');
  });
});
