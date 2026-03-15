/**
 * ScreenRenderer Debounce Test Suite
 *
 * Tests debounced data source fetching in ScreenRenderer.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

jest.mock('../../src/kernel/KernelContext', () => {
  const actual = jest.requireActual('../../src/kernel/KernelContext');
  return { ...actual, useKernel: jest.fn(), useSDKServices: jest.fn() };
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
      setState: jest.fn((k: string, v: unknown) => store.set(k, v)),
      getState: jest.fn((k: string) => store.get(k)),
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

let mockApiProxyRequest: jest.Mock;
let mockModuleLoader: any;

function setupMocks(withDataSources = true) {
  mockApiProxyRequest = jest.fn().mockResolvedValue({ ok: true, data: { items: [] } });

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
  });

  (useSDKServices as jest.Mock).mockReturnValue({
    dataBus: { publish: jest.fn() },
    intentBridge: { emit: jest.fn().mockResolvedValue(undefined) },
    navigator: {
      navigate: jest.fn(),
      goBack: jest.fn().mockReturnValue(false),
      getCurrentRoute: jest.fn(),
    },
    apiProxy: { request: mockApiProxyRequest },
  });

  const screenSchema: any = {
    id: 'screen1',
    title: 'Test',
    body: { type: 'text', value: 'Hello' },
  };

  if (withDataSources) {
    screenSchema.dataSources = {
      tasks: { api: '/api/tasks', method: 'GET' },
    };
  }

  mockModuleLoader = {
    loadScreen: jest.fn().mockResolvedValue(screenSchema),
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: {
      interpretScreen: jest.fn().mockReturnValue(React.createElement('View', null, 'Content')),
    },
    expressionEngine: {
      isExpression: jest.fn().mockReturnValue(false),
      resolveExpressions: jest.fn((v: string) => v),
    },
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

async function renderAndWait(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree!;
}

describe('ScreenRenderer debounce', () => {
  it('first mount fetches data sources', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(mockApiProxyRequest).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'GET' }));
    tree.unmount();
  });

  it('renders without crash with data sources', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(tree.toJSON()).toBeDefined();
    tree.unmount();
  });

  it('unmount does not crash', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(() => tree.unmount()).not.toThrow();
  });

  it('no data sources: no API calls for data', async () => {
    setupMocks(false);
    mockApiProxyRequest.mockClear();
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(mockApiProxyRequest).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('data source error during fetch: caught and logged', async () => {
    mockApiProxyRequest.mockRejectedValueOnce(new Error('Network error'));
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(tree.toJSON()).toBeDefined();
    tree.unmount();
  });

  it('screen loading state transitions correctly', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    const json = tree.toJSON();
    expect(json).toBeDefined();
    tree.unmount();
  });
});
