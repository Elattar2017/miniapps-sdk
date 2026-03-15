/**
 * ModuleLoader Test Suite
 * Tests manifest loading from cache, network fetch on cache miss,
 * and invalid module ID rejection.
 */

import { ModuleLoader } from '../../src/modules/ModuleLoader';
import { ModuleCache } from '../../src/modules/ModuleCache';
import type { ModuleManifest } from '../../src/types';

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
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

/** Create a mock manifest */
function createMockManifest(moduleId: string): ModuleManifest {
  return {
    id: moduleId,
    name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    screens: ['main'],
    entryScreen: 'main',
    permissions: { apis: [], storage: false },
    signature: 'YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFh',
    minSDKVersion: '1.0.0',
    icon: 'https://example.com/icon.png',
    category: 'utilities',
  };
}

describe('ModuleLoader', () => {
  let loader: ModuleLoader;
  let cache: ModuleCache;

  beforeEach(() => {
    cache = new ModuleCache();
    loader = new ModuleLoader('https://api.example.com', cache);
    mockFetch.mockReset();
  });

  afterEach(() => {
    cache.clear();
  });

  it('should load manifest from cache', async () => {
    const moduleId = 'com.test.budget';
    const manifest = createMockManifest(moduleId);

    // Pre-populate cache
    cache.set(`manifest:${moduleId}`, manifest, 'manifest');

    const result = await loader.loadManifest(moduleId);

    expect(result).toEqual(manifest);
    // fetch should NOT have been called since it was in cache
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fetch manifest from network on cache miss', async () => {
    const moduleId = 'com.test.reports';
    const manifest = createMockManifest(moduleId);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    const result = await loader.loadManifest(moduleId);

    expect(result).toEqual(manifest);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the URL used
    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toBe(`https://api.example.com/api/modules/${moduleId}/manifest`);
  });

  it('should cache the manifest after network fetch', async () => {
    const moduleId = 'com.test.cache';
    const manifest = createMockManifest(moduleId);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    // First call: network fetch
    await loader.loadManifest(moduleId);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call: should use cache
    mockFetch.mockReset();
    const cached = await loader.loadManifest(moduleId);
    expect(cached).toEqual(manifest);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should reject invalid module IDs', async () => {
    // Invalid: contains uppercase
    await expect(loader.loadManifest('Com.Test.Bad')).rejects.toThrow('Invalid module ID');

    // Invalid: starts with number
    await expect(loader.loadManifest('1invalid.module')).rejects.toThrow('Invalid module ID');

    // Invalid: contains special characters
    await expect(loader.loadManifest('com.test.m@dule')).rejects.toThrow('Invalid module ID');

    // Invalid: empty string
    await expect(loader.loadManifest('')).rejects.toThrow('Invalid module ID');
  });

  it('should handle HTTP error responses', async () => {
    const moduleId = 'com.test.fail';

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    await expect(loader.loadManifest(moduleId)).rejects.toThrow('HTTP 404');
  });

  it('should handle network errors', async () => {
    const moduleId = 'com.test.network';

    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(loader.loadManifest(moduleId)).rejects.toThrow();
  });

  it('should strip trailing slashes from apiBaseUrl', async () => {
    const loaderWithSlash = new ModuleLoader(
      'https://api.example.com/',
      cache,
    );
    const moduleId = 'com.test.slash';
    const manifest = createMockManifest(moduleId);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    await loaderWithSlash.loadManifest(moduleId);

    const fetchUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchUrl).toBe(`https://api.example.com/api/modules/${moduleId}/manifest`);
    // Should NOT have double slashes
    expect(fetchUrl).not.toContain('//api/');
  });
});
