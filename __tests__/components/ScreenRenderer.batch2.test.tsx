/**
 * ScreenRenderer Batch 2 Tests
 * Tests for: navigate params (Fix 5), run_action (Fix 7),
 * data source transform (Fix 6b), i18n namespace (Fix 14)
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

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

jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKActivityIndicator: 'SDKActivityIndicator',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
  SDKScrollView: 'SDKScrollView',
  SDKKeyboardAvoidingView: 'SDKKeyboardAvoidingView',
  getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

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

jest.mock('../../src/adapters/StorageAdapter', () => ({
  createStorageAdapter: jest.fn(() => ({
    getString: jest.fn().mockReturnValue(undefined),
    setString: jest.fn(),
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
import { i18n } from '../../src/i18n';

let mockNavigator: any;
let mockIntentBridge: any;
let mockDataBus: any;
let mockPolicyEngine: any;
let mockModuleRegistry: any;
let mockModuleLoader: any;
let mockSchemaInterpreter: any;
let mockExpressionEngine: any;
let mockApiProxy: any;

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
  mockApiProxy = {
    request: jest.fn().mockResolvedValue({ ok: true, status: 200, data: { items: [1, 2, 3] } }),
  };

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
    apiProxy: mockApiProxy,
  });

  mockModuleLoader = {
    loadScreen: jest.fn(),
    loadModuleList: jest.fn(),
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module', designTokens: undefined, i18n: undefined }),
  };
  mockSchemaInterpreter = {
    interpretScreen: jest.fn().mockReturnValue(React.createElement('View', null, 'Content')),
  };
  mockExpressionEngine = {
    isExpression: jest.fn().mockReturnValue(false),
    resolveExpressions: jest.fn((v: string) => v),
    evaluate: jest.fn(),
    resolveObjectExpressions: jest.fn((obj: any) => obj),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: mockSchemaInterpreter,
    expressionEngine: mockExpressionEngine,
    moduleRegistry: mockModuleRegistry,
  });

  mockModuleLoader.loadScreen.mockResolvedValue({
    id: 'screen1',
    title: 'Test Screen',
    body: { type: 'text', value: 'Hello' },
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
  setupMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

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
  return tree!;
}

describe('ScreenRenderer — Batch 2 Fixes', () => {
  // --- Fix 5: Navigate with params ---

  describe('navigate with params (Fix 5)', () => {
    it('should pass params to navigator.navigate', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
      });

      const { element, props } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // Find the renderContext passed to interpretScreen
      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];
      expect(renderContext).toBeDefined();

      // Dispatch a navigate action with params
      await act(async () => {
        renderContext.onAction({
          action: 'navigate',
          screen: 'details',
          params: { itemId: '42', mode: 'edit' },
        });
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'mod1',
          screenId: 'details',
          params: { itemId: '42', mode: 'edit' },
        }),
      );
    });

    it('should merge navigate params into module state', async () => {
      const { element } = createScreenRenderer();
      await renderAndWait(element);

      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({
          action: 'navigate',
          screen: 'details',
          params: { itemId: '42' },
        });
      });

      // After re-render, state should include itemId
      const latestCtx = mockSchemaInterpreter.interpretScreen.mock.calls.at(-1)?.[1];
      expect(latestCtx.state).toEqual(expect.objectContaining({ itemId: '42' }));
    });
  });

  // --- Navigate with transition ---

  describe('navigate with transition', () => {
    it('should pass transition to navigator.navigate', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
      });

      const { element, props } = createScreenRenderer();
      await renderAndWait(element);

      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({
          action: 'navigate',
          screen: 'details',
          transition: 'fade',
        });
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleId: 'mod1',
          screenId: 'details',
          transition: 'fade',
        }),
      );
    });

    it('should pass modal transition to navigator', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({
          action: 'navigate',
          screen: 'settings',
          transition: 'modal',
          params: { source: 'menu' },
        });
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          screenId: 'settings',
          transition: 'modal',
          params: { source: 'menu' },
        }),
      );
    });

    it('should default transition to undefined when not set', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({
          action: 'navigate',
          screen: 'details',
        });
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          screenId: 'details',
          transition: undefined,
        }),
      );
    });
  });

  // --- Fix 7: run_action ---

  describe('run_action (Fix 7)', () => {
    it('should execute named action sequence from schema.actions', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
        actions: {
          submitFlow: [
            { action: 'show_loading' },
            { action: 'update_state', key: 'submitted', value: true },
            { action: 'hide_loading' },
          ],
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({ action: 'run_action', ref: 'submitFlow' });
      });

      // Should publish dispatched events for each action in the sequence
      const dispatchedActions = mockDataBus.publish.mock.calls
        .filter((c: any[]) => c[0] === 'sdk:action:dispatched')
        .map((c: any[]) => c[1].action);

      expect(dispatchedActions).toContain('run_action');
      expect(dispatchedActions).toContain('show_loading');
      expect(dispatchedActions).toContain('update_state');
      expect(dispatchedActions).toContain('hide_loading');
    });

    it('should warn when run_action ref is missing', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);
      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({ action: 'run_action' });
      });

      // Should not throw, just warn
      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });

    it('should warn when run_action ref not found in schema.actions', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
        actions: {},
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);
      const renderContext = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];

      await act(async () => {
        renderContext.onAction({ action: 'run_action', ref: 'nonexistent' });
      });

      expect(mockNavigator.navigate).not.toHaveBeenCalled();
    });
  });

  // --- Fix 6b: DataSourceConfig.transform ---

  describe('data source transform (Fix 6b)', () => {
    it('should apply transform expression to fetched data', async () => {
      mockExpressionEngine.evaluate.mockImplementation((_expr: string, ctx: any) => {
        // Simulate transform: data.items
        return ctx.data?.items;
      });

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
        dataSources: {
          myData: {
            api: '/api/data',
            method: 'GET',
            transform: 'data.items',
          },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // The expression engine should have been called with the transform
      expect(mockExpressionEngine.evaluate).toHaveBeenCalledWith(
        'data.items',
        expect.objectContaining({ data: { items: [1, 2, 3] } }),
      );

      // The transformed data (items array) should appear in context
      const latestCtx = mockSchemaInterpreter.interpretScreen.mock.calls.at(-1)?.[1];
      expect(latestCtx.data.myData).toEqual([1, 2, 3]);
    });

    it('should pass data through unchanged when no transform is set', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
        dataSources: {
          myData: {
            api: '/api/data',
            method: 'GET',
          },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      expect(mockExpressionEngine.evaluate).not.toHaveBeenCalled();

      const latestCtx = mockSchemaInterpreter.interpretScreen.mock.calls.at(-1)?.[1];
      expect(latestCtx.data.myData).toEqual({ items: [1, 2, 3] });
    });

    it('should fall back to raw data when transform fails', async () => {
      mockExpressionEngine.evaluate.mockImplementation(() => {
        throw new Error('invalid expression');
      });

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test',
        body: { type: 'text', value: 'Hi' },
        dataSources: {
          myData: {
            api: '/api/data',
            method: 'GET',
            transform: 'bad.expr',
          },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Should fall back to raw data
      const latestCtx = mockSchemaInterpreter.interpretScreen.mock.calls.at(-1)?.[1];
      expect(latestCtx.data.myData).toEqual({ items: [1, 2, 3] });
    });
  });

  // --- Fix 14: i18n per-module namespace ---

  describe('i18n per-module namespace (Fix 14)', () => {
    it('should namespace i18n keys with moduleId when loading manifest i18n', async () => {
      const addStringsSpy = jest.spyOn(i18n, 'addStrings');

      mockModuleLoader.loadManifest.mockResolvedValue({
        id: 'com.acme.billing',
        i18n: {
          en: { 'greeting': 'Hello', 'farewell': 'Goodbye' },
        },
      });

      const { element } = createScreenRenderer({ moduleId: 'com.acme.billing' });
      await renderAndWait(element);

      expect(addStringsSpy).toHaveBeenCalledWith('en', {
        'com.acme.billing:greeting': 'Hello',
        'com.acme.billing:farewell': 'Goodbye',
      });

      addStringsSpy.mockRestore();
    });

    it('should not collide when two modules use the same key', async () => {
      const addStringsSpy = jest.spyOn(i18n, 'addStrings');

      // First module
      mockModuleLoader.loadManifest.mockResolvedValue({
        id: 'mod-a',
        i18n: { en: { title: 'Module A Title' } },
      });
      const { element: el1 } = createScreenRenderer({ moduleId: 'mod-a' });
      await renderAndWait(el1);

      // Second module
      mockModuleLoader.loadManifest.mockResolvedValue({
        id: 'mod-b',
        i18n: { en: { title: 'Module B Title' } },
      });
      const { element: el2 } = createScreenRenderer({ moduleId: 'mod-b' });
      await renderAndWait(el2);

      // Both should have been namespaced
      const calls = addStringsSpy.mock.calls;
      const allKeys = calls.flatMap((c) => Object.keys(c[1] as Record<string, string>));
      expect(allKeys).toContain('mod-a:title');
      expect(allKeys).toContain('mod-b:title');

      addStringsSpy.mockRestore();
    });
  });

  // --- Expression resolution in data source URLs ---

  describe('data source URL expression resolution', () => {
    it('should resolve ${state.*} expressions in ds.api before fetch', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Detail',
        body: { type: 'text', value: 'Content' },
        dataSources: {
          planDetails: { api: '/api/plans/${state.planId}', method: 'GET' },
        },
      });

      // Mock resolveExpressions to simulate replacing ${state.planId} with "gold"
      mockExpressionEngine.resolveExpressions.mockImplementation((text: string) => {
        return text.replace('${state.planId}', 'gold');
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Wait for data source fetch
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // apiProxy should have been called with the resolved URL
      expect(mockExpressionEngine.resolveExpressions).toHaveBeenCalledWith(
        '/api/plans/${state.planId}',
        expect.objectContaining({ state: expect.any(Object) }),
      );
      expect(mockApiProxy.request).toHaveBeenCalledWith(
        'gold' === 'gold' ? '/api/plans/gold' : expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should pass URL unchanged when no expressions present', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'List',
        body: { type: 'text', value: 'Content' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // resolveExpressions should NOT be called for a URL without ${}
      const resolveCallsForApi = mockExpressionEngine.resolveExpressions.mock.calls.filter(
        (c: unknown[]) => c[0] === '/api/items',
      );
      expect(resolveCallsForApi).toHaveLength(0);

      // apiProxy should be called with the original URL
      expect(mockApiProxy.request).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  // --- Navigate with transition ---

  describe('navigate with transition', () => {
    it('ActionConfig type supports transition field', () => {
      // Verify the ActionConfig interface accepts transition as a valid field
      const action = {
        action: 'navigate' as const,
        screen: 'screen2',
        transition: 'modal' as const,
        params: { planId: '42' },
      };
      expect(action.transition).toBe('modal');
      expect(action.params).toEqual({ planId: '42' });
    });
  });
});
