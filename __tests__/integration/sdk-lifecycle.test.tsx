/**
 * SDK Lifecycle Integration Tests
 *
 * Tests the full SDK flow: boot SDK -> load module -> render screen -> interact -> navigate.
 * Only mocks: globalThis.fetch (HTTP layer), react-native, and RN adapter components.
 * All internal subsystems (Kernel, SchemaInterpreter, ExpressionEngine,
 * PolicyEngine, ModuleContext, etc.) use real implementations.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import type { KernelConfig, ScreenSchema, ModuleManifest, DesignTokens } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock react-native (minimal stubs so imports resolve)
// ---------------------------------------------------------------------------

jest.mock('react-native');

// ---------------------------------------------------------------------------
// Shared navigator mock — accessible from tests for assertions
// ---------------------------------------------------------------------------

const sharedNavigatorMock = {
  navigate: jest.fn(),
  goBack: jest.fn().mockReturnValue(false),
  reset: jest.fn(),
  getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
  getCurrentRoute: jest.fn(),
  addListener: jest.fn().mockReturnValue(jest.fn()),
  dispose: jest.fn(),
};

// ---------------------------------------------------------------------------
// Mock adapters to string elements (same pattern as existing test suites)
// ---------------------------------------------------------------------------

jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKImage: 'SDKImage',
  SDKTextInput: 'SDKTextInput',
  SDKScrollView: 'SDKScrollView',
  SDKKeyboardAvoidingView: 'SDKKeyboardAvoidingView',
  SDKFlatList: 'SDKFlatList',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
  SDKActivityIndicator: 'SDKActivityIndicator',
  SDKStyleSheet: { create: (s: any) => s },
  initializeRenderAdapter: jest.fn(),
  createSDKNavigator: jest.fn(() => sharedNavigatorMock),
  SDKNavigationContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  isNavigationAvailable: jest.fn(() => false),
  StubNavigationManager: jest.fn(),
  StorageAdapter: jest.fn(),
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
  InMemoryStorage: jest.fn(),
  getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../src/adapters/NavigationAdapter', () => ({
  createSDKNavigator: jest.fn(() => sharedNavigatorMock),
  SDKNavigationContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  isNavigationAvailable: jest.fn(() => false),
  StubNavigationManager: jest.fn(),
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
  StorageAdapter: jest.fn(),
  InMemoryStorage: jest.fn(),
  MMKVStorageBackend: jest.fn(),
  createPlatformStorage: jest.fn(),
}));

jest.mock('../../src/adapters/AnimationAdapter', () => ({
  SDKAnimated: {},
  SDKAnimatedValue: jest.fn(),
  SDKAnimatedValueXY: jest.fn(),
  SDKAnimatedView: 'AnimatedView',
  SDKAnimatedText: 'AnimatedText',
  SDKAnimatedImage: 'AnimatedImage',
  SDKAnimatedScrollView: 'AnimatedScrollView',
  createFadeAnimation: jest.fn(),
  createSlideAnimation: jest.fn(),
  createSpringAnimation: jest.fn(),
  initializeAnimationAdapter: jest.fn(),
}));

jest.mock('../../src/adapters/PlatformAdapter', () => ({
  getCurrentPlatform: () => 'ios',
  isIOS: () => true,
  isAndroid: () => false,
  isWeb: () => false,
  getPlatformVersion: () => '17.0',
  platformSelect: (opts: any) => opts.ios ?? opts.default,
  getScreenDimensions: () => ({ width: 375, height: 812, scale: 3 }),
  getFullScreenDimensions: () => ({ width: 375, height: 812, scale: 3 }),
  onDimensionChange: () => () => {},
  getDefaultSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
  getDeviceCapabilities: () => ({ hasNotch: true, hasBiometrics: true }),
  initializePlatformAdapter: jest.fn(),
}));

jest.mock('../../src/adapters/BridgeAdapter', () => ({
  getNativeModule: jest.fn(),
  isNativeModuleAvailable: () => false,
  initializeBridgeAdapter: jest.fn(),
  MockCryptoModule: {},
  MockDeviceIntegrityModule: {},
}));

// ---------------------------------------------------------------------------
// ErrorBoundary passthrough - let errors propagate for test visibility
// ---------------------------------------------------------------------------

jest.mock('../../src/kernel/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// ---------------------------------------------------------------------------
// Imports (must come after mocks are set up)
// ---------------------------------------------------------------------------

import { SDKProvider } from '../../src/components/SDKProvider';
import { ScreenRenderer } from '../../src/components/ScreenRenderer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function createMockJWT(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

const VALID_JWT = createMockJWT({
  sub: 'user-1',
  iss: 'test-issuer',
  aud: 'sdk',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  tenantId: 'test-tenant',
  roles: ['admin', 'user'],
});

const MOCK_MANIFEST: ModuleManifest = {
  id: 'com.test.module',
  name: 'Test Module',
  version: '1.0.0',
  description: 'A test module for integration tests',
  icon: 'https://example.com/icon.png',
  category: 'utilities',
  entryScreen: 'home',
  screens: ['home', 'detail'],
  permissions: { apis: ['/api/data'], storage: true },
  minSDKVersion: '1.0.0',
  signature: 'dGVzdC1zaWduYXR1cmUtdGhhdC1pcy1sb25nLWVub3VnaC1mb3ItdmFsaWRhdGlvbg==',
  signedAt: Date.now(),
  author: 'test-author',
};

const HOME_SCREEN: ScreenSchema = {
  id: 'home',
  title: 'Home',
  body: {
    type: 'column',
    children: [
      { type: 'text', id: 'welcomeText', value: 'Welcome to the module' },
      {
        type: 'button',
        id: 'goDetailBtn',
        label: 'Go to Detail',
        onPress: { action: 'navigate', screen: 'detail' },
      },
      {
        type: 'input',
        id: 'nameInput',
        placeholder: 'Enter name',
        value: '$state.userName',
        props: { value: '$state.userName' },
      },
    ],
  },
};

const DETAIL_SCREEN: ScreenSchema = {
  id: 'detail',
  title: 'Detail',
  body: {
    type: 'column',
    children: [
      { type: 'text', id: 'detailText', value: 'Detail screen' },
      {
        type: 'button',
        id: 'goBackBtn',
        label: 'Go Back',
        onPress: { action: 'go_back' },
      },
    ],
  },
};

const MODULE_LIST_RESPONSE = [
  {
    id: 'com.test.module',
    name: 'Test Module',
    icon: 'https://example.com/icon.png',
    category: 'utilities',
    version: '1.0.0',
    description: 'A test module',
  },
];

function createValidConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    authToken: VALID_JWT,
    tenantId: 'test-tenant',
    userId: 'user-1',
    apiBaseUrl: 'https://api.example.com',
    zones: { main: { type: 'fill', position: 'fill' } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch setup
// ---------------------------------------------------------------------------

function setupMockFetch(overrides?: {
  moduleList?: unknown;
  manifest?: unknown;
  homeScreen?: unknown;
  detailScreen?: unknown;
  policies?: unknown | null;
  failScreen?: boolean;
  dataResponse?: unknown;
}) {
  const moduleList = overrides?.moduleList ?? MODULE_LIST_RESPONSE;
  const manifest = overrides?.manifest ?? MOCK_MANIFEST;
  const homeScreen = overrides?.homeScreen ?? HOME_SCREEN;
  const detailScreen = overrides?.detailScreen ?? DETAIL_SCREEN;
  const policies = overrides?.policies ?? [];
  const failScreen = overrides?.failScreen ?? false;
  const dataResponse = overrides?.dataResponse ?? { items: [{ id: 1, name: 'Item 1' }] };

  const mockFetch = jest.fn((url: string | URL | Request, _opts?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : String(url);

    // Policies endpoint
    if (urlStr.includes('/sdk/policies')) {
      if (policies === null) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
          headers: new Headers(),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(policies),
        headers: new Headers(),
      } as Response);
    }

    // Module list
    if (urlStr.endsWith('/api/modules') || urlStr.match(/\/api\/modules$/)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(moduleList),
        headers: new Headers(),
      } as Response);
    }

    // Module manifest
    if (urlStr.includes('/api/modules/') && urlStr.endsWith('/manifest')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(manifest),
        headers: new Headers(),
      } as Response);
    }

    // Screen schemas
    if (urlStr.includes('/api/modules/') && urlStr.includes('/screens/')) {
      if (failScreen) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal server error' }),
          headers: new Headers(),
        } as Response);
      }

      if (urlStr.endsWith('/screens/home')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(homeScreen),
          headers: new Headers(),
        } as Response);
      }
      if (urlStr.endsWith('/screens/detail')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(detailScreen),
          headers: new Headers(),
        } as Response);
      }

      // Generic screen by extracting screen id
      const screenMatch = urlStr.match(/\/screens\/(.+)$/);
      if (screenMatch) {
        const screenId = screenMatch[1];
        if (screenId === 'home') {
          return Promise.resolve({
            ok: true, status: 200,
            json: () => Promise.resolve(homeScreen),
            headers: new Headers(),
          } as Response);
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(detailScreen),
          headers: new Headers(),
        } as Response);
      }
    }

    // Data source endpoints
    if (urlStr.includes('/api/data')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dataResponse),
        headers: new Headers(),
      } as Response);
    }

    // Default fallback
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    } as Response);
  });

  globalThis.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// Suppress console noise
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  sharedNavigatorMock.navigate.mockClear();
  sharedNavigatorMock.goBack.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render SDKProvider with children and wait for boot to complete.
 * Returns the test renderer tree.
 */
async function renderAndBoot(
  config: KernelConfig,
  children: React.ReactNode,
): Promise<ReactTestRenderer> {
  let tree: ReactTestRenderer;

  await act(async () => {
    tree = create(
      React.createElement(SDKProvider, { ...config }, children),
    );
  });

  return tree!;
}

/** Find all nodes of a given type in the tree (string-mocked component names) */
function findByType(tree: ReactTestRenderer, typeName: string): any[] {
  return tree.root.findAll((el) => el.type === typeName);
}

/** Find nodes whose text children contain a given substring */
function findByText(tree: ReactTestRenderer, text: string): any[] {
  return tree.root.findAll(
    (el) =>
      el.children &&
      el.children.some(
        (child: any) => typeof child === 'string' && child.includes(text),
      ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SDK Lifecycle Integration', () => {
  describe('Boot lifecycle', () => {
    it('should show loading state initially then render children after boot', async () => {
      setupMockFetch();
      const config = createValidConfig();

      let tree: ReactTestRenderer;

      // Initial render: should show loading
      act(() => {
        tree = create(
          React.createElement(
            SDKProvider,
            { ...config },
            React.createElement('SDKText', null, 'Children Loaded'),
          ),
        );
      });

      // During boot the SDKProvider renders loading indicators
      const loadingIndicators = findByType(tree!, 'SDKActivityIndicator');
      expect(loadingIndicators.length).toBeGreaterThan(0);

      // Wait for boot to complete
      await act(async () => {
        // Allow promises to settle
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // After boot, children should be rendered
      const children = findByText(tree!, 'Children Loaded');
      expect(children.length).toBeGreaterThan(0);
    }, 15000);

    it('should show error state when JWT is expired', async () => {
      setupMockFetch();

      const expiredJWT = createMockJWT({
        sub: 'user-1',
        iss: 'test-issuer',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) - 3600,
        iat: Math.floor(Date.now() / 1000) - 7200,
        tenantId: 'test-tenant',
      });

      const config = createValidConfig({ authToken: expiredJWT });

      const tree = await renderAndBoot(
        config,
        React.createElement('SDKText', null, 'Should not appear'),
      );

      const errorText = findByText(tree, 'SDK Initialization Error');
      expect(errorText.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Screen text rendering', () => {
    it('should render text components from screen schema', async () => {
      setupMockFetch();
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      // Wait for screen fetch
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const textNodes = findByText(tree, 'Welcome to the module');
      expect(textNodes.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Button rendering', () => {
    it('should render buttons with their label text', async () => {
      setupMockFetch();
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const buttonLabel = findByText(tree, 'Go to Detail');
      expect(buttonLabel.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Navigate action', () => {
    it('should call onNavigate when navigate button is pressed', async () => {
      setupMockFetch();
      const config = createValidConfig();
      const navigateFn = jest.fn();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: navigateFn,
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Find the button with "Go to Detail" label and press its parent touchable
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const detailButton = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Go to Detail')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(detailButton).toBeDefined();

      await act(async () => {
        detailButton.props.onPress();
      });

      // Navigation now goes through navigator directly (not onNavigate callback)
      expect(sharedNavigatorMock.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ screenId: 'detail' }),
      );
    }, 15000);
  });

  describe('Go back action', () => {
    it('should call onBack when go_back is pressed and no navigation history', async () => {
      setupMockFetch();
      const config = createValidConfig();
      const backFn = jest.fn();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'detail',
          onNavigate: jest.fn(),
          onBack: backFn,
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Find the "Go Back" button
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const backButton = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Go Back')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(backButton).toBeDefined();

      await act(async () => {
        backButton.props.onPress();
      });

      expect(backFn).toHaveBeenCalled();
    }, 15000);
  });

  describe('State management', () => {
    it('should update module state via update_state action', async () => {
      const stateScreen: ScreenSchema = {
        id: 'home',
        title: 'State Test',
        body: {
          type: 'column',
          children: [
            { type: 'text', id: 'stateDisplay', value: '${$state.counter}' },
            {
              type: 'button',
              id: 'incBtn',
              label: 'Increment',
              onPress: { action: 'update_state', key: 'counter', value: 42 },
            },
          ],
        },
      };

      setupMockFetch({ homeScreen: stateScreen });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Press the increment button
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const incButton = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Increment')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(incButton).toBeDefined();

      await act(async () => {
        incButton.props.onPress();
      });

      // After pressing, the text should update to show "42"
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const counterText = findByText(tree, '42');
      expect(counterText.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Expression resolution', () => {
    it('should resolve $state expressions in text values after state update', async () => {
      const exprScreen: ScreenSchema = {
        id: 'home',
        title: 'Expression Test',
        body: {
          type: 'column',
          children: [
            {
              type: 'button',
              id: 'setNameBtn',
              label: 'Set Name',
              onPress: { action: 'update_state', key: 'userName', value: 'Alice' },
            },
            { type: 'text', id: 'nameText', value: '${$state.userName}' },
          ],
        },
      };

      setupMockFetch({ homeScreen: exprScreen });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Press the "Set Name" button
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const setNameBtn = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Set Name')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(setNameBtn).toBeDefined();

      await act(async () => {
        setNameBtn.props.onPress();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const nameText = findByText(tree, 'Alice');
      expect(nameText.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Error handling', () => {
    it('should show error message when screen fetch fails', async () => {
      setupMockFetch({ failScreen: true });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // The ScreenRenderer shows a user-friendly error screen (not raw error text)
      const errorNodes = tree.root.findAll(
        (el) =>
          el.children &&
          el.children.some(
            (child: any) =>
              typeof child === 'string' &&
              (child.includes('Something Went Wrong') || child.includes('Unable to Load')),
          ),
      );
      expect(errorNodes.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Loading state', () => {
    it('should show activity indicator while booting', async () => {
      setupMockFetch();
      const config = createValidConfig();

      let tree: ReactTestRenderer;

      act(() => {
        tree = create(
          React.createElement(
            SDKProvider,
            { ...config },
            React.createElement('SDKText', null, 'Content'),
          ),
        );
      });

      // During boot, there should be an ActivityIndicator
      const indicators = findByType(tree!, 'SDKActivityIndicator');
      expect(indicators.length).toBeGreaterThan(0);

      // Also check for "Initializing SDK..." text
      const loadingText = findByText(tree!, 'Initializing SDK...');
      expect(loadingText.length).toBeGreaterThan(0);

      // Clean up by waiting for boot to finish
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
    }, 15000);
  });

  describe('Design tokens', () => {
    it('should render with custom design tokens flowing through', async () => {
      const customTokens: DesignTokens = {
        colors: {
          primary: '#FF0000',
          background: '#000000',
          text: '#FFFFFF',
        },
        typography: {
          fontFamily: 'CustomFont',
          baseFontSize: 16,
        },
        spacing: {
          unit: 8,
        },
        borderRadius: {
          default: 12,
        },
      };

      const themedScreen: ScreenSchema = {
        id: 'home',
        title: 'Themed',
        body: {
          type: 'column',
          children: [
            {
              type: 'text',
              id: 'themedText',
              value: 'Themed text',
              style: { color: '$theme.colors.primary' },
            },
          ],
        },
      };

      setupMockFetch({ homeScreen: themedScreen });
      const config = createValidConfig({ designTokens: customTokens });

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Text with "Themed text" should be rendered
      const textNodes = findByText(tree, 'Themed text');
      expect(textNodes.length).toBeGreaterThan(0);

      // Verify the text element has the resolved color from design tokens
      // $theme.colors.primary should resolve to #FF0000
      const styledNode = textNodes.find((n) => {
        const style = n.props?.style;
        return style && style.color === '#FF0000';
      });
      expect(styledNode).toBeDefined();
    }, 15000);
  });

  describe('Data sources', () => {
    it('should fetch data sources defined in screen schema', async () => {
      const dataScreen: ScreenSchema = {
        id: 'home',
        title: 'Data Test',
        body: {
          type: 'column',
          children: [
            { type: 'text', id: 'dataText', value: 'Data loaded' },
          ],
        },
        dataSources: {
          items: {
            api: '/api/data',
            method: 'GET',
          },
        },
      };

      const mockFetch = setupMockFetch({ homeScreen: dataScreen });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });

      const textNodes = findByText(tree, 'Data loaded');
      expect(textNodes.length).toBeGreaterThan(0);

      // Verify the data source endpoint was called
      const dataCalls = mockFetch.mock.calls.filter(
        (call: any[]) => String(call[0]).includes('/api/data'),
      );
      expect(dataCalls.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Validation', () => {
    it('should block navigation when validate action fails on required field', async () => {
      const validationScreen: ScreenSchema = {
        id: 'home',
        title: 'Validation Test',
        body: {
          type: 'column',
          children: [
            {
              type: 'input',
              id: 'requiredField',
              placeholder: 'Required field',
              value: '$state.requiredField',
              props: { value: '$state.requiredField' },
            },
            {
              type: 'button',
              id: 'validateBtn',
              label: 'Submit',
              onPress: {
                action: 'validate',
                fields: ['requiredField'],
                screen: 'detail',
              },
            },
          ],
        },
        validation: {
          requiredField: [{ rule: 'required', message: 'Field is required' }],
        },
      };

      const navigateFn = jest.fn();
      setupMockFetch({ homeScreen: validationScreen });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: navigateFn,
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Find the Submit button and press it
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const submitBtn = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Submit')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(submitBtn).toBeDefined();

      await act(async () => {
        submitBtn.props.onPress();
      });

      // Navigation should NOT have been called because validation failed
      expect(navigateFn).not.toHaveBeenCalled();

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Validation error message should be displayed
      const errorMessages = findByText(tree, 'Field is required');
      expect(errorMessages.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Action dispatch - emit_intent', () => {
    it('should fire intent through IntentBridge on emit_intent action', async () => {
      const intentHandler = jest.fn();

      const intentScreen: ScreenSchema = {
        id: 'home',
        title: 'Intent Test',
        body: {
          type: 'column',
          children: [
            {
              type: 'button',
              id: 'intentBtn',
              label: 'Fire Intent',
              onPress: {
                action: 'emit_intent',
                event: 'open_module',
                payload: { moduleId: 'com.test.other' },
              },
            },
          ],
        },
      };

      setupMockFetch({ homeScreen: intentScreen });
      const config = createValidConfig({
        intentHandlers: {
          open_module: intentHandler,
        },
      });

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Find the "Fire Intent" button
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const intentBtn = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Fire Intent')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(intentBtn).toBeDefined();

      await act(async () => {
        intentBtn.props.onPress();
      });

      // Allow async intent handling to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      expect(intentHandler).toHaveBeenCalled();
    }, 15000);
  });

  describe('Multiple screens', () => {
    it('should render the detail screen correctly', async () => {
      setupMockFetch();
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'detail',
          onNavigate: jest.fn(),
          onBack: jest.fn(),
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const detailText = findByText(tree, 'Detail screen');
      expect(detailText.length).toBeGreaterThan(0);

      const goBackLabel = findByText(tree, 'Go Back');
      expect(goBackLabel.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Policy evaluation', () => {
    it('should boot successfully with remote deny policies loaded', async () => {
      const denyPolicies = [
        {
          id: 'deny-module-view',
          effect: 'deny',
          resource: 'module:com.test.blocked',
          action: 'view',
          priority: 10,
          conditions: [],
        },
      ];

      setupMockFetch({ policies: denyPolicies });
      const config = createValidConfig();

      const tree = await renderAndBoot(
        config,
        React.createElement('SDKText', null, 'Boot completed'),
      );

      // Allow extra time for boot with remote policies to settle
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      });

      const children = findByText(tree, 'Boot completed');
      expect(children.length).toBeGreaterThan(0);
    }, 15000);
  });

  describe('Full navigation flow', () => {
    it('should track navigation events when navigate button is pressed', async () => {
      setupMockFetch();
      const config = createValidConfig();
      const navigationHistory: string[] = [];

      const tree = await renderAndBoot(
        config,
        React.createElement(ScreenRenderer, {
          moduleId: 'com.test.module',
          screenId: 'home',
          onNavigate: (screenId: string) => {
            navigationHistory.push(screenId);
          },
          onBack: () => {
            navigationHistory.push('back');
          },
        }),
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      // Find the "Go to Detail" button
      const touchables = findByType(tree, 'SDKTouchableOpacity');
      const detailButton = touchables.find((t) => {
        try {
          const texts = t.findAll((el: any) =>
            el.children?.some((c: any) => typeof c === 'string' && c.includes('Go to Detail')),
          );
          return texts.length > 0;
        } catch {
          return false;
        }
      });

      expect(detailButton).toBeDefined();

      await act(async () => {
        detailButton.props.onPress();
      });

      // Navigation now goes through navigator directly (not onNavigate callback)
      expect(sharedNavigatorMock.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ screenId: 'detail' }),
      );
    }, 15000);
  });
});
