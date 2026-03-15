/**
 * Kernel Policy Sync & Auth Coverage Tests
 *
 * Tests uncovered branches in Kernel.ts:
 * - doPolicySync() remote policy fetch success/failure paths
 * - doAuth() expired token, missing claims, no onTokenRefresh
 * - resume() from various states
 * - getStatus() shape verification
 * - Full lifecycle transitions
 */

import { RuntimeKernel } from '../../src/kernel/Kernel';
import type { KernelConfig } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockJWT(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

function validClaims(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    sub: 'user-1',
    iss: 'test-issuer',
    aud: 'sdk',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    tenantId: 'test-tenant',
    ...overrides,
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

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let mockFetch: jest.Mock;

function setupFetch(
  impl?: (url: string, init?: RequestInit) => Promise<Partial<Response>>,
): void {
  mockFetch = jest.fn(
    impl ??
      ((_url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
          headers: new Headers(),
        } as Response)),
  );
  globalThis.fetch = mockFetch as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Suppress console noise
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setupFetch();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Kernel – doPolicySync() branches', () => {
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

  it('loads and merges remote policies on successful fetch', async () => {
    const remotePolicies = [
      {
        id: 'remote-deny-admin',
        effect: 'deny',
        resource: 'admin-panel',
        action: 'view',
        priority: 10,
        conditions: [],
      },
    ];

    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(remotePolicies),
          headers: new Headers(),
        } as Response);
      }
      // module list
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    // The policy engine should now contain the remote policy merged with default-allow
    const policies = kernel.getPolicyEngine().getPolicies();
    const remotePolicy = policies.find((p) => p.id === 'remote-deny-admin');
    expect(remotePolicy).toBeDefined();
    expect(remotePolicy?.effect).toBe('deny');
  });

  it('continues with default-allow on remote fetch network error', async () => {
    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBeGreaterThanOrEqual(1);
    expect(policies.some((p) => p.id === 'default-allow-all')).toBe(true);
  });

  it('keeps default-allow only when remote returns empty array', async () => {
    setupFetch((_url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response),
    );

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    const policies = kernel.getPolicyEngine().getPolicies();
    // Only the default-allow should be present (empty remote array doesn't merge)
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });

  it('keeps default-allow when remote returns non-OK status', async () => {
    setupFetch((url: string) => {
      if (url.includes('/sdk/policies')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal' }),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    const policies = kernel.getPolicyEngine().getPolicies();
    expect(policies.length).toBe(1);
    expect(policies[0].id).toBe('default-allow-all');
  });
});

describe('Kernel – doAuth() branches', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
    setupFetch();
  });

  afterEach(async () => {
    const s = kernel.getState();
    if (s === 'ACTIVE' || s === 'SUSPEND' || s === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('rejects expired JWT token with SDKError', async () => {
    const config = createValidConfig({
      authToken: createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      ),
    });

    await expect(kernel.boot(config)).rejects.toThrow('JWT validation failed');
    expect(kernel.getState()).toBe('ERROR');
  });

  it('rejects JWT with missing required claim (no sub)', async () => {
    const config = createValidConfig({
      authToken: createMockJWT(
        validClaims({ sub: undefined }),
      ),
    });

    await expect(kernel.boot(config)).rejects.toThrow('JWT validation failed');
    expect(kernel.getState()).toBe('ERROR');
  });

  it('rejects JWT with missing required claim (no iss)', async () => {
    const config = createValidConfig({
      authToken: createMockJWT(
        validClaims({ iss: '' }),
      ),
    });

    await expect(kernel.boot(config)).rejects.toThrow('JWT validation failed');
    expect(kernel.getState()).toBe('ERROR');
  });

  it('boots without onTokenRefresh callback (logs warning, no refresh manager)', async () => {
    const config = createValidConfig({
      onTokenRefresh: undefined,
    });

    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');
    // Kernel should boot fine without onTokenRefresh — just no proactive refresh
  });

  it('sets up token refresh manager when onTokenRefresh is provided', async () => {
    const refreshFn = jest.fn().mockResolvedValue('new-token');
    const config = createValidConfig({
      onTokenRefresh: refreshFn,
    });

    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');
    // TokenRefreshManager should have been created; verify by suspending
    // (suspend calls stopMonitoring on the manager)
    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');
  });
});

describe('Kernel – resume() branches', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
    setupFetch();
  });

  afterEach(async () => {
    const s = kernel.getState();
    if (s === 'ACTIVE' || s === 'SUSPEND' || s === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('resumes from SUSPEND state back to ACTIVE', async () => {
    await kernel.boot(createValidConfig());
    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');

    await kernel.resume();
    expect(kernel.getState()).toBe('ACTIVE');
  });

  it('throws on resume from non-SUSPEND state (ACTIVE)', async () => {
    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    // ACTIVE -> RESUME is not a valid transition
    await expect(kernel.resume()).rejects.toThrow('Invalid kernel state transition');
  });

  it('resumes with token refresh manager restart when onTokenRefresh provided', async () => {
    const refreshFn = jest.fn().mockResolvedValue('refreshed-token');
    const config = createValidConfig({ onTokenRefresh: refreshFn });

    await kernel.boot(config);
    await kernel.suspend();
    await kernel.resume();
    expect(kernel.getState()).toBe('ACTIVE');
  });
});

describe('Kernel – getStatus() and lifecycle', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
    setupFetch();
  });

  afterEach(async () => {
    const s = kernel.getState();
    if (s === 'ACTIVE' || s === 'SUSPEND' || s === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('returns correct status after boot', async () => {
    await kernel.boot(createValidConfig());
    const status = kernel.getStatus();

    expect(status.state).toBe('ACTIVE');
    expect(typeof status.bootTime).toBe('number');
    expect(status.bootTime).toBeGreaterThanOrEqual(0);
    expect(status.moduleCount).toBe(0);
    expect(status.activeModuleId).toBeUndefined();
    expect(status.lastError).toBeUndefined();
  });

  it('getStatus reflects error after auth failure', async () => {
    const config = createValidConfig({
      authToken: createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 1 }),
      ),
    });

    await expect(kernel.boot(config)).rejects.toThrow();

    const status = kernel.getStatus();
    expect(status.state).toBe('ERROR');
    expect(status.lastError).toBeDefined();
    expect(status.lastError).toContain('JWT validation failed');
  });

  it('full lifecycle: boot -> suspend -> resume -> shutdown -> IDLE', async () => {
    const stateLog: string[] = [];
    const emitter = kernel.getEmitter();
    emitter.on('kernel_state_change', (evt: { from: string; to: string }) => {
      stateLog.push(evt.to);
    });

    await kernel.boot(createValidConfig());
    expect(kernel.getState()).toBe('ACTIVE');

    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');

    await kernel.resume();
    expect(kernel.getState()).toBe('ACTIVE');

    await kernel.shutdown();
    expect(kernel.getState()).toBe('IDLE');

    // Verify the expected state progression
    // Note: shutdown() removes all listeners before transitioning to IDLE,
    // so the IDLE transition is NOT captured by the listener.
    expect(stateLog).toEqual([
      'BOOT', 'AUTH', 'POLICY_SYNC', 'MODULE_SYNC', 'ZONE_RENDER', 'ACTIVE',
      'SUSPEND',
      'RESUME', 'ACTIVE',
      'SHUTDOWN',
    ]);
  });

  it('shutdown from ERROR state transitions to IDLE', async () => {
    const config = createValidConfig({
      authToken: createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 100 }),
      ),
    });

    await expect(kernel.boot(config)).rejects.toThrow();
    expect(kernel.getState()).toBe('ERROR');

    await kernel.shutdown();
    expect(kernel.getState()).toBe('IDLE');
  });
});
