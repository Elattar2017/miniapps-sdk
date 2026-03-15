/**
 * ModuleLoader Error Handling Test Suite
 * Tests timeout handling, HTTP error responses, network failures,
 * cache interactions, and PKI verification delegation.
 */

import { ModuleLoader } from '../../src/modules/ModuleLoader';
import { ModuleCache } from '../../src/modules/ModuleCache';
import { SDKError } from '../../src/kernel/errors/SDKError';
import type { ModuleManifest, ModuleSummary, ScreenSchema } from '../../src/types';

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

/**
 * Create a base64 string encoding `byteCount` bytes.
 */
function createBase64Signature(byteCount: number): string {
  const raw = 'a'.repeat(byteCount);
  return btoa(raw);
}

/** Create a mock manifest with a valid long signature */
function createMockManifest(moduleId: string): ModuleManifest {
  return {
    id: moduleId,
    name: 'Test Module',
    version: '1.0.0',
    description: 'A test module',
    screens: ['main'],
    entryScreen: 'main',
    permissions: { apis: [], storage: false },
    signature: createBase64Signature(33),
    minSDKVersion: '1.0.0',
    icon: 'https://example.com/icon.png',
    category: 'utilities',
  };
}

/** Create a mock screen schema */
function createMockScreen(): ScreenSchema {
  return {
    id: 'main',
    title: 'Main Screen',
    body: {
      type: 'column',
      children: [],
    },
  };
}

describe('ModuleLoader - Error Handling', () => {
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

  // ---------------------------------------------------------------------------
  // fetchWithTimeout
  // ---------------------------------------------------------------------------

  describe('fetchWithTimeout', () => {
    it('should throw SDKError with timeout message when AbortController fires', async () => {
      const moduleId = 'com.test.timeout';

      // Simulate a fetch that never resolves, so the timeout fires
      mockFetch.mockImplementation((_url: string, options: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        });
      });

      // Use a very short timeout to speed up the test.
      // We access the private method indirectly through loadManifest, which
      // uses DEFAULT_TIMEOUTS.MODULE_FETCH (15s). Instead, we mock setTimeout
      // to fire immediately.
      jest.useFakeTimers();

      const promise = loader.loadManifest(moduleId);

      // Advance timers to trigger the abort
      jest.runAllTimers();

      await expect(promise).rejects.toThrow('timed out');

      jest.useRealTimers();
    });

    it('should propagate non-abort fetch errors as SDKError.network', async () => {
      const moduleId = 'com.test.fetcherror';

      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      await expect(loader.loadManifest(moduleId)).rejects.toThrow(SDKError);
      await expect(loader.loadManifest(moduleId)).rejects.toThrow(
        'Failed to load manifest',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // loadManifest error paths
  // ---------------------------------------------------------------------------

  describe('loadManifest', () => {
    it('should throw SDKError on HTTP 404 response', async () => {
      const moduleId = 'com.test.notfound';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(loader.loadManifest(moduleId)).rejects.toThrow('HTTP 404');
    });

    it('should throw SDKError on HTTP 500 response', async () => {
      const moduleId = 'com.test.servererror';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(loader.loadManifest(moduleId)).rejects.toThrow('HTTP 500');
    });

    it('should wrap network failure in SDKError.network', async () => {
      const moduleId = 'com.test.networkfail';

      mockFetch.mockRejectedValue(new Error('Connection refused'));

      try {
        await loader.loadManifest(moduleId);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SDKError);
        expect((error as SDKError).message).toContain('Failed to load manifest');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // loadScreen
  // ---------------------------------------------------------------------------

  describe('loadScreen', () => {
    it('should return cached screen without fetching', async () => {
      const moduleId = 'com.test.cached';
      const screenId = 'main';
      const screen = createMockScreen();

      // Pre-populate cache
      cache.set(`screen:${moduleId}:${screenId}`, screen, 'schema');

      const result = await loader.loadScreen(moduleId, screenId);

      expect(result).toEqual(screen);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch from network on cache miss', async () => {
      const moduleId = 'com.test.cachemiss';
      const screenId = 'main';
      const screen = createMockScreen();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => screen,
      });

      const result = await loader.loadScreen(moduleId, screenId);

      expect(result).toEqual(screen);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toBe(
        `https://api.example.com/api/modules/${moduleId}/screens/${screenId}`,
      );
    });

    it('should throw SDKError on HTTP error', async () => {
      const moduleId = 'com.test.screenerror';
      const screenId = 'main';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(loader.loadScreen(moduleId, screenId)).rejects.toThrow('HTTP 404');
    });

    it('should wrap network error in SDKError.network', async () => {
      const moduleId = 'com.test.screennetwork';
      const screenId = 'main';

      mockFetch.mockRejectedValue(new Error('Network timeout'));

      try {
        await loader.loadScreen(moduleId, screenId);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SDKError);
        expect((error as SDKError).message).toContain('Failed to load screen');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // loadModuleList
  // ---------------------------------------------------------------------------

  describe('loadModuleList', () => {
    it('should return array of ModuleSummary on success', async () => {
      const modules: ModuleSummary[] = [
        {
          id: 'com.test.one',
          name: 'Module One',
          icon: 'icon-one.png',
          category: 'utilities',
          version: '1.0.0',
          description: 'First module',
        },
        {
          id: 'com.test.two',
          name: 'Module Two',
          icon: 'icon-two.png',
          category: 'finance',
          version: '2.0.0',
          description: 'Second module',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => modules,
      });

      const result = await loader.loadModuleList();

      expect(result).toEqual(modules);
      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw SDKError on HTTP error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(loader.loadModuleList()).rejects.toThrow('HTTP 503');
    });

    it('should wrap network error in SDKError.network', async () => {
      mockFetch.mockRejectedValue(new Error('Service unreachable'));

      try {
        await loader.loadModuleList();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SDKError);
        expect((error as SDKError).message).toContain('Failed to load module list');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // verifySignature (delegates to PKIVerifier)
  // ---------------------------------------------------------------------------

  describe('verifySignature (via loadManifest)', () => {
    it('should delegate to PKIVerifier and reject invalid signatures', async () => {
      const moduleId = 'com.test.badsig';
      // Manifest with a short signature that will fail PKIVerifier
      const manifest = createMockManifest(moduleId);
      manifest.signature = createBase64Signature(6); // Too short (< 32 bytes)

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => manifest,
      });

      await expect(loader.loadManifest(moduleId)).rejects.toThrow(
        'Module signature verification failed',
      );
    });
  });
});
