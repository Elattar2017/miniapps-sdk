/**
 * ScreenRenderer capture_camera Test Suite
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

const mockMediaModule = {
  isMock: true,
  captureImage: jest.fn(),
  pickFromLibrary: jest.fn(),
  captureFromView: jest.fn().mockResolvedValue(JSON.stringify({
    uri: 'mock://viewcapture.jpg',
    fileName: 'viewCapture_1.jpg',
    mimeType: 'image/jpeg',
    width: 640,
    height: 480,
    fileSize: 102400,
    timestamp: 1709000000000,
  })),
  checkCameraPermission: jest.fn().mockResolvedValue('granted'),
  checkLibraryPermission: jest.fn().mockResolvedValue('granted'),
  requestCameraPermission: jest.fn().mockResolvedValue('granted'),
  requestLibraryPermission: jest.fn().mockResolvedValue('granted'),
};

jest.mock('../../src/adapters/BridgeAdapter', () => ({
  getNativeModule: jest.fn((name: string) => {
    if (name === 'MediaModule') return mockMediaModule;
    return {};
  }),
}));

import { useKernel, useSDKServices } from '../../src/kernel/KernelContext';
import { useSDK } from '../../src/components/SDKProvider';
import { ScreenRenderer } from '../../src/components/ScreenRenderer';

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
      ok: true, status: 200, data: {}, headers: {}, latencyMs: 50,
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
    interpretScreen: jest.fn().mockReturnValue(React.createElement('View', null, 'Screen')),
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

  mockModuleLoader.loadScreen.mockResolvedValue({
    id: 'screen1',
    title: 'Camera Screen',
    body: { type: 'text', value: 'Camera' },
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
  return create(React.createElement(ScreenRenderer, {
    moduleId: 'mod1',
    screenId: 'screen1',
    ...overrides,
  } as any));
}

describe('ScreenRenderer capture_camera action', () => {
  it('renders screen with capture_camera action configured', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1',
      title: 'Camera Screen',
      body: {
        type: 'column',
        children: [
          { type: 'camera_view', id: 'cam1', cameraFacing: 'back' },
          {
            type: 'button',
            label: 'Capture',
            onPress: {
              action: 'capture_camera',
              cameraId: 'cam1',
              responseKey: 'photo',
              mediaQuality: 0.8,
            },
          },
        ],
      },
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
    expect(mockModuleLoader.loadScreen).toHaveBeenCalledWith('mod1', 'screen1');
  });

  it('renders with includeBase64 option', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1',
      title: 'Camera Screen',
      body: {
        type: 'button',
        label: 'Capture',
        onPress: {
          action: 'capture_camera',
          cameraId: 'cam1',
          responseKey: 'photo',
          mediaIncludeBase64: true,
        },
      },
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders with storage config', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1',
      title: 'Camera Screen',
      body: {
        type: 'button',
        label: 'Capture',
        onPress: {
          action: 'capture_camera',
          cameraId: 'cam1',
          responseKey: 'scanResult',
          mediaMaxDimension: 512,
          mediaStorage: { location: 'temp', persist: false },
        },
      },
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders with onSuccess and onError callbacks', async () => {
    mockModuleLoader.loadScreen.mockResolvedValue({
      id: 'screen1',
      title: 'Camera Screen',
      body: {
        type: 'button',
        label: 'Capture',
        onPress: {
          action: 'capture_camera',
          cameraId: 'cam1',
          responseKey: 'photo',
          onSuccess: [
            { action: 'show_toast', message: 'Captured!' },
          ],
          onError: [
            { action: 'show_toast', message: 'Failed', toastVariant: 'error' },
          ],
        },
      },
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('loads the screen data on mount', async () => {
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(mockModuleLoader.loadScreen).toHaveBeenCalledWith('mod1', 'screen1');
  });
});
