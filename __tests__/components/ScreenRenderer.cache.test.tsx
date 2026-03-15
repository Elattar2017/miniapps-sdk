/**
 * ScreenRenderer Cache Test Suite
 *
 * Tests data source response caching in ScreenRenderer:
 * - cache-first, network-first, and no-cache policies
 * - Cache freshness checks
 * - Cache key format
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// ---------------------------------------------------------------------------
// Mock kernel and SDK contexts
// ---------------------------------------------------------------------------

jest.mock('../../src/kernel/KernelContext', () => {
  const actual = jest.requireActual('../../src/kernel/KernelContext');
  return {
    ...actual,
    useKernel: jest.fn(),
    useSDKServices: jest.fn(),
  };
});

jest.mock('../../src/components/SDKProvider', () => ({
  useSDK: jest.fn(),
}));

// Mock adapters
jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKActivityIndicator: 'SDKActivityIndicator',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
  SDKScrollView: 'SDKScrollView',
  SDKKeyboardAvoidingView: 'SDKKeyboardAvoidingView',
  getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock ModuleContext
jest.mock('../../src/modules/ModuleContext', () => {
  return {
    ModuleContext: jest.fn().mockImplementation(() => {
      const store = new Map<string, unknown>();
      return {
        setState: jest.fn((key: string, value: unknown) => store.set(key, value)),
        getState: jest.fn((key: string) => store.get(key)),
        getAllKeys: jest.fn(() => Array.from(store.keys())),
        clearState: jest.fn(() => store.clear()),
        createStateProxy: jest.fn(() => ({})),
      };
    }),
  };
});

// Track storage calls for caching assertions.
// NOTE: The mock createStorageAdapter returns an object that does NOT prefix keys.
// ScreenRenderer calls storageRef.current.getString/setString with raw keys
// like '__ds_cache__:https://...' and '__module_state__'.
let mockStorageData: Record<string, string> = {};
const mockGetString = jest.fn((key: string) => mockStorageData[key]);
const mockSetString = jest.fn((key: string, value: string) => {
  mockStorageData[key] = value;
});

jest.mock('../../src/adapters/StorageAdapter', () => ({
  createStorageAdapter: jest.fn(() => ({
    getString: mockGetString,
    setString: mockSetString,
    getNumber: jest.fn(),
    setNumber: jest.fn(),
    getBoolean: jest.fn(),
    setBoolean: jest.fn(),
    delete: jest.fn(),
    contains: jest.fn(),
    getAllKeys: jest.fn().mockReturnValue([]),
    clearAll: jest.fn(),
    query: jest.fn(),
    execute: jest.fn(),
  })),
}));

import { useKernel, useSDKServices } from '../../src/kernel/KernelContext';
import { useSDK } from '../../src/components/SDKProvider';
import { ScreenRenderer } from '../../src/components/ScreenRenderer';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

let mockNavigator: any;
let mockIntentBridge: any;
let mockDataBus: any;
let mockPolicyEngine: any;
let mockModuleRegistry: any;
let mockModuleLoader: any;
let mockSchemaInterpreter: any;
let mockExpressionEngine: any;
let mockFetch: jest.Mock;

function setupMocks() {
  mockNavigator = {
    navigate: jest.fn(),
    goBack: jest.fn().mockReturnValue(true),
    getCurrentRoute: jest.fn(),
    reset: jest.fn(),
    getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
    addListener: jest.fn().mockReturnValue(jest.fn()),
    dispose: jest.fn(),
  };
  mockIntentBridge = { emit: jest.fn().mockResolvedValue(undefined) };
  mockDataBus = { publish: jest.fn() };
  mockPolicyEngine = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
  mockModuleRegistry = { get: jest.fn() };

  (useKernel as jest.Mock).mockReturnValue({
    config: {
      tenantId: 'test',
      userId: 'u1',
      apiBaseUrl: 'https://api.test.com',
      authToken: 'test-token',
      zones: {},
      designTokens: {
        colors: { primary: '#0066CC', background: '#FFFFFF' },
        typography: { fontFamily: 'System', baseFontSize: 14 },
        spacing: { unit: 4 },
        borderRadius: { default: 8 },
      },
    },
    state: 'ACTIVE',
    status: { state: 'ACTIVE', moduleCount: 0 },
    kernel: {},
    dataBus: mockDataBus,
    intentBridge: mockIntentBridge,
    policyEngine: mockPolicyEngine,
    moduleRegistry: mockModuleRegistry,
    navigator: mockNavigator,
  });

  (useSDKServices as jest.Mock).mockReturnValue({
    dataBus: mockDataBus,
    intentBridge: mockIntentBridge,
    policyEngine: mockPolicyEngine,
    moduleRegistry: mockModuleRegistry,
    navigator: mockNavigator,
  });

  mockModuleLoader = {
    loadScreen: jest.fn(),
    loadModuleList: jest.fn(),
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }),
  };
  mockSchemaInterpreter = {
    interpretScreen: jest.fn().mockReturnValue(React.createElement('View', null, 'Screen Content')),
  };
  mockExpressionEngine = {
    isExpression: jest.fn().mockReturnValue(false),
    resolveExpressions: jest.fn((v: string) => v),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: mockSchemaInterpreter,
    expressionEngine: mockExpressionEngine,
    moduleRegistry: mockModuleRegistry,
  });

  mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ items: [1, 2, 3] }),
  });
  global.fetch = mockFetch as any;
}

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
  mockStorageData = {};
  setupMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as any).fetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createScreenRenderer(overrides?: Record<string, unknown>) {
  const defaultProps = {
    moduleId: 'mod1',
    screenId: 'screen1',
    onNavigate: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
  return { element: React.createElement(ScreenRenderer, defaultProps as any), props: defaultProps };
}

async function renderAndWait(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  // Allow data source fetching to complete
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return tree!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScreenRenderer data source caching', () => {
  describe('cache-first policy (default)', () => {
    it('uses cached response when cache is fresh (no fetch call)', async () => {
      const freshTimestamp = Date.now() - 60_000; // 1 minute ago (within 5 min TTL)
      const cachedData = { data: { cached: true }, timestamp: freshTimestamp };

      // Key WITHOUT tenant:module prefix because the mock storage skips prefixing
      mockStorageData['__ds_cache__:https://api.test.com/api/items'] =
        JSON.stringify(cachedData);

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // fetch should NOT be called because cache is fresh
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches when cache is expired', async () => {
      const expiredTimestamp = Date.now() - 400_000; // 6+ minutes ago (past 5 min TTL)
      const cachedData = { data: { stale: true }, timestamp: expiredTimestamp };

      mockStorageData['__ds_cache__:https://api.test.com/api/items'] =
        JSON.stringify(cachedData);

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // fetch SHOULD be called because cache is expired
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/items',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('fetches when no cache exists', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/items',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('stores response in cache after successful fetch', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should have stored to cache (key without tenant prefix since mock bypasses prefixing)
      expect(mockSetString).toHaveBeenCalledWith(
        '__ds_cache__:https://api.test.com/api/items',
        expect.any(String),
      );

      // Verify the stored value contains data and timestamp
      const storedCall = mockSetString.mock.calls.find(
        (c: any[]) => c[0] === '__ds_cache__:https://api.test.com/api/items',
      );
      expect(storedCall).toBeDefined();
      const storedValue = JSON.parse(storedCall![1]);
      expect(storedValue.data).toEqual({ items: [1, 2, 3] });
      expect(typeof storedValue.timestamp).toBe('number');
    });
  });

  describe('network-first policy', () => {
    it('always fetches even when fresh cache exists', async () => {
      const freshTimestamp = Date.now() - 30_000; // 30 seconds ago
      const cachedData = { data: { cached: true }, timestamp: freshTimestamp };

      mockStorageData['__ds_cache__:https://api.test.com/api/data'] =
        JSON.stringify(cachedData);

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          data: { api: '/api/data', method: 'GET', cachePolicy: 'network-first' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // fetch SHOULD be called even with fresh cache
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/data',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('updates cache after successful fetch', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          data: { api: '/api/data', method: 'GET', cachePolicy: 'network-first' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should have stored the response
      expect(mockSetString).toHaveBeenCalledWith(
        '__ds_cache__:https://api.test.com/api/data',
        expect.any(String),
      );
    });
  });

  describe('no-cache policy', () => {
    it('always fetches and does not write cache', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          data: { api: '/api/nocache', method: 'GET', cachePolicy: 'no-cache' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should have fetched
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/nocache',
        expect.objectContaining({ method: 'GET' }),
      );

      // Should NOT have written to cache
      const dsCacheCalls = mockSetString.mock.calls.filter(
        (c: any[]) => c[0].includes('__ds_cache__'),
      );
      expect(dsCacheCalls).toHaveLength(0);
    });

    it('does not read from cache', async () => {
      const freshTimestamp = Date.now() - 10_000; // very fresh
      mockStorageData['__ds_cache__:https://api.test.com/api/nocache'] =
        JSON.stringify({ data: { cached: true }, timestamp: freshTimestamp });

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          data: { api: '/api/nocache', method: 'GET', cachePolicy: 'no-cache' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should still have fetched even with fresh cache
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/nocache',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('cache key format', () => {
    it('cache key uses full URL including base URL', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/v2/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // The getString should have been called with a cache key containing the full URL
      const cacheReadCall = mockGetString.mock.calls.find(
        (c: any[]) => c[0].includes('__ds_cache__'),
      );
      expect(cacheReadCall).toBeDefined();
      expect(cacheReadCall![0]).toBe('__ds_cache__:https://api.test.com/api/v2/items');
    });
  });

  describe('corrupt cache handling', () => {
    it('fetches from network when cache data is corrupt', async () => {
      // Store corrupt JSON in cache
      mockStorageData['__ds_cache__:https://api.test.com/api/items'] =
        'not-valid-json{{{';

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should fall through to fetch when JSON parse fails
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/items',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });
});
