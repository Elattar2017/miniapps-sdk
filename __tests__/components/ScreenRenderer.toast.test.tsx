/**
 * ScreenRenderer Toast Test Suite
 *
 * Tests show_toast action handling, auto-dismiss, expression resolution,
 * and rapid toast replacement.
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
let capturedHandleAction: ((action: any) => void) | null = null;

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

  // Capture handleAction by intercepting interpretScreen (it's passed as context.onAction)
  capturedHandleAction = null;
  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    schemaInterpreter: {
      interpretScreen: jest.fn((_schema: any, context: any) => {
        if (context?.onAction) {
          capturedHandleAction = context.onAction;
        }
        return React.createElement('SDKView', null, 'Content');
      }),
    },
    expressionEngine: {
      isExpression: jest.fn((v: string) => typeof v === 'string' && v.includes('$')),
      resolveExpressions: jest.fn((v: string) => v.replace(/\$\{[^}]+\}/g, 'resolved')),
      evaluate: jest.fn((expr: string) => expr),
      resolveObjectExpressions: jest.fn((obj: any) => obj),
    },
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
  setupMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderAndWait(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree: ReactTestRenderer;
  await act(async () => { tree = create(element); });
  return tree!;
}

function findTextContent(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.includes(text);
  if (node.children) {
    for (const child of node.children) {
      if (findTextContent(child, text)) return true;
    }
  }
  return false;
}

describe('ScreenRenderer toast actions', () => {
  it('show_toast sets toast state and renders toast message', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    expect(capturedHandleAction).toBeDefined();
    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Operation successful',
        toastVariant: 'success',
      });
    });

    const json = tree.toJSON();
    expect(findTextContent(json, 'Operation successful')).toBe(true);
    tree.unmount();
  });

  it('show_toast publishes sdk:toast:shown event', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Test toast',
        toastVariant: 'error',
      });
    });

    expect(mockDataBus.publish).toHaveBeenCalledWith(
      'sdk:toast:shown',
      expect.objectContaining({ moduleId: 'mod-1', screenId: 'screen-1', variant: 'error' }),
    );
    tree.unmount();
  });

  it('show_toast auto-dismisses after duration', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Temporary toast',
        toastVariant: 'info',
        duration: 2000,
      });
    });

    // Toast should be visible
    expect(findTextContent(tree.toJSON(), 'Temporary toast')).toBe(true);

    // Advance past duration
    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    // Toast should be gone
    expect(findTextContent(tree.toJSON(), 'Temporary toast')).toBe(false);
    tree.unmount();
  });

  it('show_toast defaults to 3000ms duration', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Default duration',
        toastVariant: 'warning',
      });
    });

    // Still visible at 2.5s
    await act(async () => { jest.advanceTimersByTime(2500); });
    expect(findTextContent(tree.toJSON(), 'Default duration')).toBe(true);

    // Gone at 3.5s
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(findTextContent(tree.toJSON(), 'Default duration')).toBe(false);
    tree.unmount();
  });

  it('show_toast defaults variant to info when not specified', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'No variant specified',
      });
    });

    expect(mockDataBus.publish).toHaveBeenCalledWith(
      'sdk:toast:shown',
      expect.objectContaining({ variant: 'info' }),
    );
    tree.unmount();
  });

  it('show_toast with title renders both title and message', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Check your connection',
        title: 'Network Error',
        toastVariant: 'error',
      });
    });

    const json = tree.toJSON();
    expect(findTextContent(json, 'Network Error')).toBe(true);
    expect(findTextContent(json, 'Check your connection')).toBe(true);
    tree.unmount();
  });

  it('show_toast with empty message does nothing', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    const publishCountBefore = mockDataBus.publish.mock.calls
      .filter((c: any[]) => c[0] === 'sdk:toast:shown').length;

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: '',
        toastVariant: 'success',
      });
    });

    const publishCountAfter = mockDataBus.publish.mock.calls
      .filter((c: any[]) => c[0] === 'sdk:toast:shown').length;

    // Should not publish toast event for empty message
    expect(publishCountAfter).toBe(publishCountBefore);
    tree.unmount();
  });

  it('rapid toast calls replace previous toast', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'First toast',
        toastVariant: 'info',
        duration: 3000,
      });
    });

    expect(findTextContent(tree.toJSON(), 'First toast')).toBe(true);

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Second toast',
        toastVariant: 'success',
        duration: 3000,
      });
    });

    // Second toast should replace first
    const json = tree.toJSON();
    expect(findTextContent(json, 'Second toast')).toBe(true);
    expect(findTextContent(json, 'First toast')).toBe(false);
    tree.unmount();
  });

  it('show_toast resolves expressions in message', async () => {
    const tree = await renderAndWait(
      React.createElement(ScreenRenderer, {
        moduleId: 'mod-1', screenId: 'screen-1', onNavigate: jest.fn(), onBack: jest.fn(),
      } as any),
    );

    await act(async () => {
      capturedHandleAction!({
        action: 'show_toast',
        message: 'Saved ${$state.count} items',
        toastVariant: 'success',
      });
    });

    // Expression should be resolved (our mock replaces ${...} with 'resolved')
    const json = tree.toJSON();
    expect(findTextContent(json, 'resolved')).toBe(true);
    tree.unmount();
  });
});
