/**
 * RuntimeKernel Lifecycle Test Suite
 * Tests lifecycle methods: boot, suspend, resume, shutdown,
 * getState, getStatus, getConfig, and edge cases like double-boot.
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
  // Default: all fetches reject (no network)
  mockFetch.mockRejectedValue(new Error('Network error'));
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * Create a mock JWT token with the given claims.
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

describe('RuntimeKernel - Lifecycle', () => {
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

  it('should reach active state after boot()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');
  });

  it('should transition to SUSPEND after suspend()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');
  });

  it('should transition back to ACTIVE after resume()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    await kernel.suspend();
    expect(kernel.getState()).toBe('SUSPEND');

    await kernel.resume();
    expect(kernel.getState()).toBe('ACTIVE');
  });

  it('should transition to IDLE after shutdown()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    await kernel.shutdown();
    expect(kernel.getState()).toBe('IDLE');
  });

  it('should return a valid status object from getStatus()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);

    const status = kernel.getStatus();
    expect(status.state).toBe('ACTIVE');
    expect(typeof status.bootTime).toBe('number');
    expect(typeof status.moduleCount).toBe('number');
    expect(status.moduleCount).toBeGreaterThanOrEqual(0);
  });

  it('should return the config passed to constructor from getConfig()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);

    const resolvedConfig = kernel.getConfig();
    expect(resolvedConfig.tenantId).toBe('test-tenant');
    expect(resolvedConfig.userId).toBe('user-1');
    expect(resolvedConfig.apiBaseUrl).toBe('https://api.example.com');
  });

  it('should handle double boot safely (second boot throws on invalid transition)', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    expect(kernel.getState()).toBe('ACTIVE');

    // Attempting to boot again should throw because ACTIVE -> BOOT is invalid
    await expect(kernel.boot(config)).rejects.toThrow();
  });

  it('should reject boot with missing authToken', async () => {
    const config = createValidConfig({ authToken: '' });
    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should reject boot with missing apiBaseUrl', async () => {
    const config = createValidConfig({ apiBaseUrl: '' });
    await expect(kernel.boot(config)).rejects.toThrow('Invalid kernel configuration');
  });

  it('should clear config on shutdown and throw on getConfig()', async () => {
    const config = createValidConfig();
    await kernel.boot(config);
    expect(() => kernel.getConfig()).not.toThrow();

    await kernel.shutdown();
    expect(() => kernel.getConfig()).toThrow('Kernel has not been booted');
  });
});
