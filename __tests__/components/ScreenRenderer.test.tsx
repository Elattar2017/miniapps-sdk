/**
 * ScreenRenderer Test Suite
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
    loadManifest: jest.fn().mockResolvedValue({ id: 'test-module', designTokens: undefined, i18n: undefined }),
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

describe('ScreenRenderer', () => {
  describe('Loading and rendering', () => {
    it('renders loading indicator initially', () => {
      // loadScreen never resolves to keep in loading state
      mockModuleLoader.loadScreen.mockReturnValue(new Promise(() => {}));

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(createScreenRenderer().element);
      });

      const json = tree!.toJSON();
      expect(json).toBeTruthy();
      // Should find an SDKActivityIndicator
      const indicators = tree!.root.findAll((el: any) => el.type === 'SDKActivityIndicator');
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('renders screen content after loading', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // Should render the screen content from the schema interpreter
      const content = tree.root.findAll((el: any) => el.children?.includes('Screen Content'));
      expect(content.length).toBeGreaterThan(0);
    });

    it('renders error state when loadScreen fails', async () => {
      mockModuleLoader.loadScreen.mockRejectedValue(new Error('Load failed'));

      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // Should show user-friendly error title, not raw error message
      const errorTitle = tree.root.findAll((el: any) => el.children?.includes('Unable to Load'));
      expect(errorTitle.length).toBeGreaterThan(0);
      // Should show description
      const errorDesc = tree.root.findAll((el: any) =>
        typeof el.children?.[0] === 'string' && el.children[0].includes('Something unexpected happened'),
      );
      expect(errorDesc.length).toBeGreaterThan(0);
    });

    it('renders header with screen title', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const titleElements = tree.root.findAll((el: any) => el.children?.includes('Test Screen'));
      expect(titleElements.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation actions', () => {
    it('navigate action calls navigator.navigate', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // Find the ScreenRenderer and trigger a navigate action
      // We access handleAction through the renderContext
      const action = { action: 'navigate' as const, screen: 'screen2' };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith({
        moduleId: 'mod1',
        screenId: 'screen2',
      });
    });

    it('go_back action calls navigator.goBack', async () => {
      mockNavigator.goBack.mockReturnValue(true);

      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = { action: 'go_back' as const };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      expect(mockNavigator.goBack).toHaveBeenCalled();
    });

    it('go_back falls back to onBack when goBack returns false', async () => {
      mockNavigator.goBack.mockReturnValue(false);

      const onBack = jest.fn();
      const { element } = createScreenRenderer({ onBack });
      const tree = await renderAndWait(element);

      const action = { action: 'go_back' as const };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      expect(mockNavigator.goBack).toHaveBeenCalled();
      expect(onBack).toHaveBeenCalled();
    });

    it('back button in header triggers go_back action', async () => {
      mockNavigator.goBack.mockReturnValue(false);
      const onBack = jest.fn();

      const { element } = createScreenRenderer({ onBack });
      const tree = await renderAndWait(element);

      // Find the back button (the touchable with the arrow)
      const touchables = tree.root.findAll((el: any) => el.type === 'SDKTouchableOpacity');
      expect(touchables.length).toBeGreaterThan(0);

      // Press the first touchable (back button)
      act(() => {
        touchables[0].props.onPress();
      });

      expect(mockNavigator.goBack).toHaveBeenCalled();
    });
  });

  describe('State management', () => {
    it('update_state action updates module state', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = { action: 'update_state' as const, key: 'name', value: 'John' };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      // Should have called interpretScreen again with updated state
      // The last call should have state containing { name: 'John' }
      const lastCallArgs = mockSchemaInterpreter.interpretScreen.mock.calls;
      const lastRenderContext = lastCallArgs[lastCallArgs.length - 1]?.[1];
      expect(lastRenderContext?.state).toEqual(expect.objectContaining({ name: 'John' }));
    });
  });

  describe('Intent bridge', () => {
    it('emit_intent action calls intentBridge.emit', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = {
        action: 'emit_intent' as const,
        event: 'NOTIFY_EVENT',
        payload: { key: 'value' },
      };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      expect(mockIntentBridge.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOTIFY_EVENT',
          payload: { key: 'value' },
          source: 'sdk',
        }),
      );
    });

    it('emit_intent handles missing event gracefully', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = { action: 'emit_intent' as const };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      // Should not call emit when no event is provided
      expect(mockIntentBridge.emit).not.toHaveBeenCalled();
    });
  });

  describe('Loading overlay', () => {
    it('show_loading / hide_loading toggle overlay', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // Show loading
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
          action: 'show_loading',
        });
      });

      // After show_loading, there should be a loading overlay with SDKActivityIndicator
      let indicators = tree.root.findAll((el: any) => el.type === 'SDKActivityIndicator');
      expect(indicators.length).toBeGreaterThan(0);

      // Hide loading
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction({
          action: 'hide_loading',
        });
      });

      // After hide_loading, check the overlay is removed
      // The loading indicator in the overlay should be gone
      // (the loading indicator is inside a view with absolute position)
      const overlays = tree.root.findAll(
        (el: any) =>
          el.props?.style?.position === 'absolute' &&
          el.props?.style?.backgroundColor === 'rgba(255,255,255,0.7)',
      );
      expect(overlays).toHaveLength(0);
    });
  });

  describe('Analytics', () => {
    it('analytics action logs event without error', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = {
        action: 'analytics' as const,
        event: 'page_view',
        payload: { page: 'home' },
      };
      // Should not throw
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });
    });
  });

  describe('DataBus events', () => {
    it('publishes sdk:screen:loaded after successful load', async () => {
      const { element } = createScreenRenderer();
      await renderAndWait(element);

      expect(mockDataBus.publish).toHaveBeenCalledWith('sdk:screen:loaded', {
        moduleId: 'mod1',
        screenId: 'screen1',
      });
    });

    it('publishes sdk:action:dispatched on action', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const action = { action: 'show_loading' as const };
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onAction(action);
      });

      expect(mockDataBus.publish).toHaveBeenCalledWith('sdk:action:dispatched', {
        moduleId: 'mod1',
        screenId: 'screen1',
        action: 'show_loading',
      });
    });
  });

  describe('API auth injection', () => {
    it('API call includes Authorization header', async () => {
      // Set up a screen with data sources
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });
      global.fetch = mockFetch as any;

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Test Screen',
        body: { type: 'text', value: 'Hello' },
        dataSources: {
          items: { api: '/api/items', method: 'GET' },
        },
      });

      const { element } = createScreenRenderer();
      await renderAndWait(element);

      // Wait for data sources to be fetched
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/items',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );

      // Clean up
      delete (global as any).fetch;
    });
  });

  describe('Validation', () => {
    it('validate action with valid fields navigates to screen', async () => {
      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: 'Form',
        body: { type: 'text', value: 'Form' },
        validation: {
          name: [{ rule: 'required', message: 'Name is required' }],
        },
      });

      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      // First set a state value
      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onStateChange('name', 'John');
      });

      // Then validate
      act(() => {
        // Get the latest onAction callback
        const lastCall = mockSchemaInterpreter.interpretScreen.mock.calls;
        lastCall[lastCall.length - 1]?.[1]?.onAction({
          action: 'validate',
          screen: 'next_screen',
        });
      });

      expect(mockNavigator.navigate).toHaveBeenCalledWith({
        moduleId: 'mod1',
        screenId: 'next_screen',
      });
    });
  });

  describe('Error state interactions', () => {
    it('go back button on error state calls onBack', async () => {
      mockModuleLoader.loadScreen.mockRejectedValue(new Error('Oops'));

      const onBack = jest.fn();
      const { element } = createScreenRenderer({ onBack });
      const tree = await renderAndWait(element);

      // Find the Go Back touchable text
      const goBackText = tree.root.findAll((el: any) => el.children?.includes('Go Back'));
      expect(goBackText.length).toBeGreaterThan(0);

      // Find all touchables — generic error has Retry + Go Back; Go Back is last
      const touchables = tree.root.findAll((el: any) => el.type === 'SDKTouchableOpacity');
      expect(touchables.length).toBeGreaterThanOrEqual(2);

      act(() => {
        // Press the last touchable (Go Back)
        touchables[touchables.length - 1].props.onPress();
      });

      expect(onBack).toHaveBeenCalled();
    });
  });

  describe('State change handler', () => {
    it('handleStateChange updates both ModuleContext and local state', async () => {
      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      act(() => {
        mockSchemaInterpreter.interpretScreen.mock.calls[0]?.[1]?.onStateChange('field1', 'val1');
      });

      // The next render should have the updated state
      const lastCallArgs = mockSchemaInterpreter.interpretScreen.mock.calls;
      const lastContext = lastCallArgs[lastCallArgs.length - 1]?.[1];
      expect(lastContext?.state).toEqual(expect.objectContaining({ field1: 'val1' }));
    });
  });

  describe('Expression resolution in title', () => {
    it('resolves expression in screen title', async () => {
      mockExpressionEngine.isExpression.mockReturnValue(true);
      mockExpressionEngine.resolveExpressions.mockReturnValue('Resolved Title');

      mockModuleLoader.loadScreen.mockResolvedValue({
        id: 'screen1',
        title: '${data.title}',
        body: { type: 'text', value: 'Hello' },
      });

      const { element } = createScreenRenderer();
      const tree = await renderAndWait(element);

      const titleElements = tree.root.findAll((el: any) => el.children?.includes('Resolved Title'));
      expect(titleElements.length).toBeGreaterThan(0);
    });
  });
});
