/**
 * RuntimeKernel Test Suite
 * Tests the kernel FSM lifecycle: boot, state transitions, suspend/resume,
 * shutdown, event emission, and error handling.
 */

import { RuntimeKernel } from '../../src/kernel/Kernel';
import type { KernelConfig } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
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

describe('RuntimeKernel', () => {
  let kernel: RuntimeKernel;

  beforeEach(() => {
    kernel = new RuntimeKernel();
  });

  afterEach(async () => {
    // Ensure kernel is shut down if it was booted
    const state = kernel.getState();
    if (state === 'ACTIVE' || state === 'SUSPEND' || state === 'ERROR') {
      await kernel.shutdown();
    }
  });

  it('should start in IDLE state', () => {
    expect(kernel.getState()).toBe('IDLE');
  });

  it('should boot successfully with valid config', async () => {
    const config = createValidConfig();
    await kernel.boot(config);

    expect(kernel.getState()).toBe('ACTIVE');
  });

  it('should reject invalid config (missing authToken)', async () => {
    const config = createValidConfig({ authToken: '' });

    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should reject invalid config (missing tenantId)', async () => {
    const config = createValidConfig({ tenantId: '' });

    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should reject invalid config (bad apiBaseUrl)', async () => {
    const config = createValidConfig({ apiBaseUrl: 'not-a-url' });

    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should reject invalid config (empty zones)', async () => {
    const config = createValidConfig({ zones: {} });

    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should transition through FSM states during boot', async () => {
    const config = createValidConfig();
    const states: string[] = [];

    const emitter = kernel.getEmitter();
    emitter.on('kernel_state_change', (event: { from: string; to: string }) => {
      states.push(event.to);
    });

    await kernel.boot(config);

    // Expected boot sequence: IDLE -> BOOT -> AUTH -> POLICY_SYNC -> MODULE_SYNC -> ZONE_RENDER -> ACTIVE
    expect(states).toEqual([
      'BOOT',
      'AUTH',
      'POLICY_SYNC',
      'MODULE_SYNC',
      'ZONE_RENDER',
      'ACTIVE',
    ]);
  });

  it('should handle suspend/resume', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');

    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');

    await kernel.resume();
    expect(kernel.getState()).toBe('ACTIVE');
  });

  it('should handle shutdown from ACTIVE state', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');

    await kernel.shutdown();
    expect(kernel.getState()).toBe('IDLE');
  });

  it('should handle shutdown from SUSPEND state', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');

    await kernel.shutdown();
    expect(kernel.getState()).toBe('IDLE');
  });

  it('should emit state change events', async () => {
    const config = createValidConfig();
    const stateChanges: Array<{ from: string; to: string }> = [];

    const emitter = kernel.getEmitter();
    emitter.on('kernel_state_change', (event: { from: string; to: string }) => {
      stateChanges.push(event);
    });

    await kernel.boot(config);

    expect(stateChanges.length).toBeGreaterThan(0);
    // First transition should be from IDLE to BOOT
    expect(stateChanges[0]).toEqual({ from: 'IDLE', to: 'BOOT' });
    // Last transition should be to ACTIVE
    expect(stateChanges[stateChanges.length - 1].to).toBe('ACTIVE');
  });

  it('should transition to ERROR state on auth failure', async () => {
    const config = createValidConfig({
      authToken: createMockJWT({
        sub: 'user-1',
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) - 3600, // expired token
        iat: Math.floor(Date.now() / 1000) - 7200,
        tenantId: 'test-tenant',
      }),
    });

    await expect(kernel.boot(config)).rejects.toThrow();
    expect(kernel.getState()).toBe('ERROR');
  });

  it('should provide kernel status', async () => {
    const config = createValidConfig();
    await kernel.boot(config);

    const status = kernel.getStatus();
    expect(status.state).toBe('ACTIVE');
    expect(status.bootTime).toBeDefined();
    expect(typeof status.bootTime).toBe('number');
    expect(status.moduleCount).toBe(0); // Phase 1
  });

  it('should provide the config after boot', async () => {
    const config = createValidConfig();
    await kernel.boot(config);

    const resolvedConfig = kernel.getConfig();
    expect(resolvedConfig.tenantId).toBe('test-tenant');
    expect(resolvedConfig.userId).toBe('user-1');
  });

  it('should throw when accessing config before boot', () => {
    expect(() => kernel.getConfig()).toThrow('Kernel has not been booted');
  });

  it('should expose sub-systems', () => {
    expect(kernel.getEmitter()).toBeDefined();
    expect(kernel.getJWTValidator()).toBeDefined();
    expect(kernel.getPolicyEngine()).toBeDefined();
    expect(kernel.getIntentBridge()).toBeDefined();
    expect(kernel.getDataBus()).toBeDefined();
    expect(kernel.getTelemetry()).toBeDefined();
  });
});
