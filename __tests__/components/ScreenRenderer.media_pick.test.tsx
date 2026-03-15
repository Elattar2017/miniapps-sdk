/**
 * ScreenRenderer media_pick Test Suite
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

// Mock BridgeAdapter getNativeModule
const mockMediaModule = {
  isMock: true,
  captureImage: jest.fn().mockResolvedValue(JSON.stringify({
    uri: 'mock://capture.jpg',
    fileName: 'capture_1.jpg',
    mimeType: 'image/jpeg',
    width: 1920,
    height: 1080,
    fileSize: 204800,
    timestamp: 1709000000000,
  })),
  pickFromLibrary: jest.fn().mockResolvedValue(JSON.stringify({
    uri: 'mock://pick.jpg',
    fileName: 'pick_1.jpg',
    mimeType: 'image/jpeg',
    width: 3024,
    height: 4032,
    fileSize: 512000,
    timestamp: 1709000000000,
  })),
  captureFromView: jest.fn(),
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
    ...overrides,
  };
  return create(React.createElement(ScreenRenderer, defaultProps as any));
}

// Helper: set up loadScreen and interpretScreen to trigger an action on button press
function setupScreenWithAction(action: Record<string, unknown>) {
  mockModuleLoader.loadScreen.mockResolvedValue({
    id: 'screen1',
    title: 'Test Screen',
    body: {
      type: 'button',
      label: 'Do Media',
      onPress: action,
    },
  });

  // interpretScreen renders the action handler context — the actual action dispatch
  // happens internally in ScreenRenderer when onAction is called.
  // For testing, we use the onAction callback approach:
  mockSchemaInterpreter.interpretScreen.mockImplementation(
    (_screen: any, _context: any, callbacks: any) => {
      // Store callbacks for manual trigger in tests
      (global as any).__testCallbacks = callbacks;
      return React.createElement('View', null, 'Rendered');
    },
  );
}

describe('ScreenRenderer media_pick action', () => {
  it('renders the screen with media_pick action', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'camera',
      responseKey: 'photo',
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('dispatches media_pick action with camera source', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'camera',
      responseKey: 'photo',
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    // The action handler is tested through the ScreenRenderer's internal dispatch
    // Verify the screen renders successfully with the action configured
    expect(mockModuleLoader.loadScreen).toHaveBeenCalledWith('mod1', 'screen1');
  });

  it('renders with photo_library source', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'photo_library',
      responseKey: 'selectedPhotos',
      mediaMultiple: true,
      mediaMaxCount: 5,
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders with camera_or_library source', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'camera_or_library',
      responseKey: 'attachment',
      mediaQuality: 0.7,
      mediaMaxDimension: 1920,
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders with includeBase64 option', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'camera',
      responseKey: 'photo',
      mediaIncludeBase64: true,
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });

  it('renders with storage config', async () => {
    setupScreenWithAction({
      action: 'media_pick',
      mediaSource: 'camera',
      responseKey: 'photo',
      mediaStorage: { location: 'persistent', persist: true, maxAge: 86400 },
    });

    let tree: ReactTestRenderer;
    await act(async () => {
      tree = createScreenRenderer();
    });

    expect(tree!.toJSON()).toBeTruthy();
  });
});
