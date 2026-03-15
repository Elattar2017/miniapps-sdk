/**
 * ScreenRenderer api_submit Test Suite
 * Tests screen loading, action dispatch, navigation, intent bridge, data bus events,
 * module state isolation, and state persistence.
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

// Mock ModuleContext to avoid logger side effects
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

// Mock StorageAdapter
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
    request: jest.fn().mockResolvedValue({
      ok: true, status: 200, data: { id: 1, message: 'success' }, headers: {}, latencyMs: 50,
    }),
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
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }),
  };
  mockSchemaInterpreter = {
    interpretScreen: jest.fn().mockReturnValue(React.createElement('View', null, 'Screen Content')),
  };
  mockExpressionEngine = {
    isExpression: jest.fn().mockReturnValue(false),
    resolveExpressions: jest.fn((v: string) => v),
    evaluate: jest.fn(),
    resolveObjectExpressions: jest.fn((obj: any, _ctx: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) { result[key] = value; }
      return result;
    }),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: mockSchemaInterpreter,
    expressionEngine: mockExpressionEngine,
    moduleRegistry: mockModuleRegistry,
  });

  // Default: loadScreen resolves with a test schema
  mockModuleLoader.loadScreen.mockResolvedValue({
    id: 'screen1',
    title: 'Test Screen',
    body: { type: 'text', value: 'Hello' },
  });
}

// Suppress console output during tests
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
  return tree!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScreenRenderer api_submit', () => {
  it('api_submit action resolves bodyTemplate and calls apiProxy.request', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);

    act(() => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onStateChange('email', 'test@example.com');
    });

    await act(async () => {
      const lastCall = mockSchemaInterpreter.interpretScreen.mock.calls;
      lastCall[lastCall.length - 1]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/submit',
        method: 'POST',
        bodyTemplate: { email: '$state.email' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockExpressionEngine.resolveObjectExpressions).toHaveBeenCalledWith(
      { email: '$state.email' },
      expect.objectContaining({
        state: expect.objectContaining({ email: 'test@example.com' }),
      }),
    );
    expect(mockApiProxy.request).toHaveBeenCalledWith('/api/submit', {
      method: 'POST',
      body: expect.any(Object),
    });
  });

  it('api_submit with onSuccess action fires on success', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit',
        onSuccess: { action: 'navigate', screen: 'success_screen' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockNavigator.navigate).toHaveBeenCalledWith({
      moduleId: 'mod1', screenId: 'success_screen',
    });
  });

  it('api_submit with onError action fires on failure', async () => {
    mockApiProxy.request.mockResolvedValue({
      ok: false, status: 400, data: { error: 'Bad request' }, headers: {}, latencyMs: 30,
    });
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit',
        onError: { action: 'navigate', screen: 'error_screen' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockNavigator.navigate).toHaveBeenCalledWith({
      moduleId: 'mod1', screenId: 'error_screen',
    });
  });

  it('api_submit without bodyTemplate sends empty body', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit', method: 'POST',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockApiProxy.request).toHaveBeenCalledWith('/api/submit', {
      method: 'POST', body: {},
    });
  });

  it('api_submit publishes DataBus event sdk:api:submit', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit', method: 'PUT',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockDataBus.publish).toHaveBeenCalledWith('sdk:api:submit', {
      moduleId: 'mod1', screenId: 'screen1', api: '/api/submit', method: 'PUT',
    });
  });

  it('api_submit method defaults to POST when not specified', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockApiProxy.request).toHaveBeenCalledWith('/api/submit', {
      method: 'POST', body: {},
    });
  });

  it('api_submit sets screenLoading during request', async () => {
    let resolveRequest: (value: any) => void;
    const requestPromise = new Promise((resolve) => { resolveRequest = resolve; });
    mockApiProxy.request.mockReturnValue(requestPromise);
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    act(() => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit',
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const overlays = tree.root.findAll((el: any) => el.props?.style?.position === 'absolute' && el.props?.style?.backgroundColor === 'rgba(255,255,255,0.7)');
    expect(overlays.length).toBeGreaterThan(0);
    await act(async () => {
      resolveRequest!({ ok: true, status: 200, data: {}, headers: {}, latencyMs: 10 });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const overlaysAfter = tree.root.findAll((el: any) => el.props?.style?.position === 'absolute' && el.props?.style?.backgroundColor === 'rgba(255,255,255,0.7)');
    expect(overlaysAfter).toHaveLength(0);
  });

  it('api_submit stores response in data when dataSource is specified', async () => {
    const responseData = { id: 99, name: 'Created' };
    mockApiProxy.request.mockResolvedValue({
      ok: true, status: 201, data: responseData, headers: {}, latencyMs: 40,
    });
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/create', dataSource: 'createdItem',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const lastCallArgs = mockSchemaInterpreter.interpretScreen.mock.calls;
    const lastContext = lastCallArgs[lastCallArgs.length - 1]?.[1];
    expect(lastContext?.data).toEqual(expect.objectContaining({
      createdItem: responseData,
    }));
  });

  it('api_submit without api path logs warning and does nothing', async () => {
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    act(() => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit',
      });
    });
    expect(mockApiProxy.request).not.toHaveBeenCalled();
  });

  it('api_submit calls onError when request throws an exception', async () => {
    mockApiProxy.request.mockRejectedValue(new Error('Network failure'));
    const { element } = createScreenRenderer();
    const tree = await renderAndWait(element);
    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit', api: '/api/submit',
        onError: { action: 'show_loading' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockDataBus.publish).toHaveBeenCalledWith('sdk:action:dispatched', {
      moduleId: 'mod1', screenId: 'screen1', action: 'show_loading',
    });
  });

  it('fetchDataSources passes body for POST data sources via fallback fetch', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ result: 'ok' }),
    });
    globalThis.fetch = mockFetch as any;
    (useSDKServices as jest.Mock).mockReturnValue({
      dataBus: mockDataBus, intentBridge: mockIntentBridge,
      policyEngine: mockPolicyEngine, moduleRegistry: mockModuleRegistry,
      navigator: mockNavigator, apiProxy: undefined,
    });
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1', title: 'Test', body: { type: 'text', value: 'Hello' },
      dataSources: { submit: { api: '/api/submit', method: 'POST', body: { name: 'test', value: 42 } } },
    });
    const { element } = createScreenRenderer();
    await renderAndWait(element);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test.com/api/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test', value: 42 }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    delete (globalThis as any).fetch;
  });

  it('fetchDataSources passes body via apiProxy when body is in DataSourceConfig', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1', title: 'Test', body: { type: 'text', value: 'Hello' },
      dataSources: { submit: { api: '/api/submit', method: 'POST', body: { key: 'value' } } },
    });
    const { element } = createScreenRenderer();
    await renderAndWait(element);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(mockApiProxy.request).toHaveBeenCalledWith('/api/submit', expect.objectContaining({
      method: 'POST', body: { key: 'value' },
    }));
  });
});
