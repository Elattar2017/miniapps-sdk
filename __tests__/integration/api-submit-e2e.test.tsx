/**
 * API Submit End-to-End Integration Tests
 *
 * Tests the full api_submit flow through ScreenRenderer, ExpressionEngine,
 * and APIProxy with mocked network and React Native adapters.
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

jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKActivityIndicator: 'SDKActivityIndicator',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
  SDKScrollView: 'SDKScrollView',
  SDKKeyboardAvoidingView: 'SDKKeyboardAvoidingView',
  getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../src/modules/ModuleContext', () => ({
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
}));

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
import { ExpressionEngine } from '../../src/schema/ExpressionEngine';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

let mockNavigator: Record<string, jest.Mock>;
let mockIntentBridge: Record<string, jest.Mock>;
let mockDataBus: Record<string, jest.Mock>;
let mockModuleLoader: Record<string, jest.Mock>;
let mockSchemaInterpreter: Record<string, jest.Mock>;
let mockApiProxy: Record<string, jest.Mock>;

// Use the real ExpressionEngine for end-to-end expression resolution
const realExpressionEngine = new ExpressionEngine();

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
  mockApiProxy = {
    request: jest.fn().mockResolvedValue({
      ok: true, status: 200, data: { id: 1, message: 'success' }, headers: {}, latencyMs: 50,
    }),
  };

  (useKernel as jest.Mock).mockReturnValue({
    config: {
      tenantId: 'test-tenant',
      userId: 'user-42',
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
    policyEngine: { evaluate: jest.fn().mockResolvedValue({ allowed: true }) },
    moduleRegistry: { get: jest.fn() },
    navigator: mockNavigator,
  });

  (useSDKServices as jest.Mock).mockReturnValue({
    dataBus: mockDataBus,
    intentBridge: mockIntentBridge,
    policyEngine: { evaluate: jest.fn().mockResolvedValue({ allowed: true }) },
    moduleRegistry: { get: jest.fn() },
    navigator: mockNavigator,
    apiProxy: mockApiProxy,
  });

  mockModuleLoader = {
    loadScreen: jest.fn().mockResolvedValue({
      id: 'screen1',
      title: 'Test Screen',
      body: { type: 'text', value: 'Hello' },
    }),
    loadModuleList: jest.fn(),
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }),
  };
  mockSchemaInterpreter = {
    interpretScreen: jest.fn().mockReturnValue(
      React.createElement('View', null, 'Screen Content'),
    ),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: mockSchemaInterpreter,
    expressionEngine: realExpressionEngine,
    moduleRegistry: { get: jest.fn() },
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

function createRenderer(overrides?: Record<string, unknown>) {
  const props = {
    moduleId: 'mod1',
    screenId: 'screen1',
    onNavigate: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
  return {
    element: React.createElement(ScreenRenderer, props as Parameters<typeof ScreenRenderer>[0]),
    props,
  };
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

describe('api_submit end-to-end integration', () => {
  it('full flow: api_submit action triggers API call with resolved body template', async () => {
    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    // Set state
    act(() => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onStateChange('username', 'alice');
    });

    // Dispatch api_submit
    await act(async () => {
      const calls = mockSchemaInterpreter.interpretScreen.mock.calls;
      calls[calls.length - 1]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/register',
        method: 'POST',
        bodyTemplate: { name: '$state.username' },
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockApiProxy.request).toHaveBeenCalledWith('/api/register', {
      method: 'POST',
      body: expect.objectContaining({ name: 'alice' }),
    });
  });

  it('api_submit with bodyTemplate resolving $state expressions end-to-end', async () => {
    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    // Set multiple state values
    act(() => {
      const ctx = mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1];
      ctx?.onStateChange('email', 'bob@example.com');
      ctx?.onStateChange('age', 30);
    });

    await act(async () => {
      const calls = mockSchemaInterpreter.interpretScreen.mock.calls;
      calls[calls.length - 1]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/profile',
        method: 'PUT',
        bodyTemplate: {
          email: '$state.email',
          age: '$state.age',
          tenant: '$user.tenantId',
        },
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    const callArgs = mockApiProxy.request.mock.calls[0];
    expect(callArgs[0]).toBe('/api/profile');
    expect(callArgs[1].body).toEqual({
      email: 'bob@example.com',
      age: 30,
      tenant: 'test-tenant',
    });
  });

  it('api_submit failure triggers onError action chain', async () => {
    mockApiProxy.request.mockResolvedValue({
      ok: false, status: 422, data: { error: 'Validation failed' }, headers: {}, latencyMs: 30,
    });

    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/submit',
        onError: { action: 'navigate', screen: 'error_screen' },
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockNavigator.navigate).toHaveBeenCalledWith({
      moduleId: 'mod1', screenId: 'error_screen',
    });
  });

  it('api_submit with dataSource: response stored in state as $data.{dataSource}', async () => {
    const responseData = { orderId: 'ORD-123', total: 59.99 };
    mockApiProxy.request.mockResolvedValue({
      ok: true, status: 201, data: responseData, headers: {}, latencyMs: 40,
    });

    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    await act(async () => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/orders',
        dataSource: 'orderResult',
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    // The last render context should have the response in data
    const lastCalls = mockSchemaInterpreter.interpretScreen.mock.calls;
    const lastContext = lastCalls[lastCalls.length - 1]?.[1];
    expect(lastContext?.data).toEqual(expect.objectContaining({
      orderResult: responseData,
    }));
  });

  it('validation action followed by api_submit: validation blocks if invalid', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1',
      title: 'Form',
      body: { type: 'text', value: 'Form' },
      validation: {
        email: [{ rule: 'required', message: 'Email is required' }],
      },
    });

    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    // Do NOT set the email state - leave it undefined to trigger validation failure
    await act(async () => {
      const calls = mockSchemaInterpreter.interpretScreen.mock.calls;
      const ctx = calls[calls.length - 1]?.[1];

      // First: validate
      ctx?.onAction({
        action: 'validate',
        fields: ['email'],
        screen: 'next_screen', // Would navigate on success
      });
    });

    // Since email is undefined and required, navigation should NOT have happened
    expect(mockNavigator.navigate).not.toHaveBeenCalled();
  });

  it('api_submit with show_loading/hide_loading wrapping actions', async () => {
    let resolveRequest: (value: unknown) => void;
    const requestPromise = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    mockApiProxy.request.mockReturnValue(requestPromise);

    const { element } = createRenderer();
    const tree = await renderAndWait(element);

    // Trigger api_submit (which internally sets screenLoading)
    act(() => {
      mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
        action: 'api_submit',
        api: '/api/submit',
      });
    });

    // Wait for loading state to propagate
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Loading overlay should be visible
    const overlays = tree.root.findAll(
      (el: { props?: { style?: { position?: string; backgroundColor?: string } } }) =>
        el.props?.style?.position === 'absolute' &&
        el.props?.style?.backgroundColor === 'rgba(255,255,255,0.7)',
    );
    expect(overlays.length).toBeGreaterThan(0);

    // Resolve the API call
    await act(async () => {
      resolveRequest!({ ok: true, status: 200, data: {}, headers: {}, latencyMs: 10 });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Loading overlay should be gone
    const overlaysAfter = tree.root.findAll(
      (el: { props?: { style?: { position?: string; backgroundColor?: string } } }) =>
        el.props?.style?.position === 'absolute' &&
        el.props?.style?.backgroundColor === 'rgba(255,255,255,0.7)',
    );
    expect(overlaysAfter).toHaveLength(0);
  });
});
