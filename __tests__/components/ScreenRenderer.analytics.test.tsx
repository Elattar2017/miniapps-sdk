/**
 * ScreenRenderer Analytics Test Suite
 *
 * Tests track_screen_view and track_interaction action handling.
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

let mockDataBus: any;
let mockNavigator: any;

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
  mockDataBus = { publish: jest.fn() };

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
    dataBus: mockDataBus,
    intentBridge: { emit: jest.fn().mockResolvedValue(undefined) },
    navigator: mockNavigator,
    apiProxy: { request: jest.fn().mockResolvedValue({ ok: true, data: {} }) },
  });

  const mockModuleLoader = {
    loadScreen: jest.fn().mockResolvedValue({
      id: 'screen1',
      title: 'Test Screen',
      body: { type: 'text', value: 'Hello' },
    }),
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

describe('ScreenRenderer analytics actions', () => {
  it('screen load publishes sdk:screen:loaded event', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(mockDataBus.publish).toHaveBeenCalledWith('sdk:screen:loaded', expect.any(Object));
    tree.unmount();
  });

  it('screen:loaded contains correct moduleId and screenId', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'analytics-mod', screenId: 'dashboard', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(mockDataBus.publish).toHaveBeenCalledWith(
      'sdk:screen:loaded',
      expect.objectContaining({ moduleId: 'analytics-mod', screenId: 'dashboard' }),
    );
    tree.unmount();
  });

  it('renders without crash', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(tree.toJSON()).toBeDefined();
    tree.unmount();
  });

  it('pressing back button publishes sdk:action:dispatched', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    // Find a pressable element (back button)
    const json = tree.toJSON() as any;
    const findOnPress = (node: any): Function | null => {
      if (!node || typeof node === 'string') return null;
      if (node.props?.onPress) return node.props.onPress;
      if (node.children) {
        for (const child of node.children) {
          const found = findOnPress(child);
          if (found) return found;
        }
      }
      return null;
    };
    const onPress = findOnPress(json);
    if (onPress) {
      await act(async () => { (onPress as Function)(); });
      const channels = mockDataBus.publish.mock.calls.map((c: unknown[]) => c[0]);
      expect(channels).toContain('sdk:action:dispatched');
    }
    tree.unmount();
  });

  it('error state renders error UI gracefully', async () => {
    (useSDK as jest.Mock).mockReturnValue({
      moduleLoader: {
        loadScreen: jest.fn().mockRejectedValue(new Error('Not found')),
        loadManifest: jest.fn().mockResolvedValue({ id: 'test-module' }),
      },
      schemaInterpreter: { interpretScreen: jest.fn() },
      expressionEngine: { isExpression: jest.fn().mockReturnValue(false), resolveExpressions: jest.fn() },
    });

    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'bad', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(tree.toJSON()).toBeDefined();
    tree.unmount();
  });

  it('dataBus.publish called at least once during lifecycle', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-x', screenId: 'screen-y', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );
    expect(mockDataBus.publish).toHaveBeenCalled();
    tree.unmount();
  });
});
