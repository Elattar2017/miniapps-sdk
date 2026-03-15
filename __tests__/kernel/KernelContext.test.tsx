/**
 * KernelContext Test Suite
 * Tests KernelProvider, useKernel, and useSDKServices hooks.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// Mock NavigationAdapter to avoid runtime require() calls to React Navigation
jest.mock('../../src/adapters/NavigationAdapter', () => ({
  createSDKNavigator: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
    getCurrentRoute: jest.fn(),
    addListener: jest.fn(),
  })),
  SDKNavigationContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  isNavigationAvailable: jest.fn(() => false),
}));

import {
  KernelProvider,
  useKernel,
  useSDKServices,
} from '../../src/kernel/KernelContext';
import type { KernelState, KernelConfig, KernelStatus } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

function createMockKernel() {
  return {
    getState: jest.fn().mockReturnValue('ACTIVE' as KernelState),
    getStatus: jest.fn().mockReturnValue({ state: 'ACTIVE', moduleCount: 0 }),
    getConfig: jest.fn().mockReturnValue({}),
    suspend: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    getDataBus: jest.fn(),
    getIntentBridge: jest.fn(),
    getPolicyEngine: jest.fn(),
    getModuleRegistry: jest.fn(),
  };
}

function createMockConfig(): KernelConfig {
  return {
    authToken: 'mock.jwt.token',
    tenantId: 'test-tenant',
    userId: 'user-1',
    apiBaseUrl: 'https://api.example.com',
    zones: { main: { type: 'fill', position: 'fill' } },
  };
}

function createMockStatus(): KernelStatus {
  return { state: 'ACTIVE', moduleCount: 0 };
}

function createMockDataBus() {
  return { publish: jest.fn(), subscribe: jest.fn(), clear: jest.fn() };
}

function createMockIntentBridge() {
  return { send: jest.fn(), register: jest.fn(), removeAllHandlers: jest.fn() };
}

function createMockPolicyEngine() {
  return { evaluate: jest.fn(), clearPolicies: jest.fn() };
}

function createMockModuleRegistry() {
  return { get: jest.fn(), register: jest.fn(), list: jest.fn() };
}

function createMockNavigator() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
    getCurrentRoute: jest.fn(),
    addListener: jest.fn(),
  };
}

/** Build full KernelProvider props from mock factories */
function createProviderProps(overrides?: Record<string, unknown>) {
  return {
    kernel: createMockKernel(),
    state: 'ACTIVE' as KernelState,
    config: createMockConfig(),
    status: createMockStatus(),
    dataBus: createMockDataBus(),
    intentBridge: createMockIntentBridge(),
    policyEngine: createMockPolicyEngine(),
    moduleRegistry: createMockModuleRegistry(),
    navigator: createMockNavigator(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test helper components
// ---------------------------------------------------------------------------

function UseKernelTestComponent({ onResult }: { onResult: (val: any) => void }) {
  const ctx = useKernel();
  onResult(ctx);
  return null;
}

function UseSDKServicesTestComponent({ onResult }: { onResult: (val: any) => void }) {
  const services = useSDKServices();
  onResult(services);
  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KernelContext', () => {
  describe('useKernel()', () => {
    it('throws when used outside KernelProvider', () => {
      const onResult = jest.fn();
      expect(() => {
        act(() => {
          create(React.createElement(UseKernelTestComponent, { onResult }));
        });
      }).toThrow('useKernel() must be used within an <SDKProvider>');
      expect(onResult).not.toHaveBeenCalled();
    });

    it('returns context when inside KernelProvider', () => {
      const props = createProviderProps();
      const onResult = jest.fn();

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(UseKernelTestComponent, { onResult }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];
      expect(ctx.kernel).toBe(props.kernel);
      expect(ctx.state).toBe('ACTIVE');
      expect(ctx.config).toBe(props.config);
      expect(ctx.status).toBe(props.status);
    });
  });

  describe('useSDKServices()', () => {
    it('throws when used outside KernelProvider', () => {
      const onResult = jest.fn();
      expect(() => {
        act(() => {
          create(React.createElement(UseSDKServicesTestComponent, { onResult }));
        });
      }).toThrow('useKernel() must be used within an <SDKProvider>');
      expect(onResult).not.toHaveBeenCalled();
    });

    it('returns all five services when inside KernelProvider', () => {
      const props = createProviderProps();
      const onResult = jest.fn();

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(UseSDKServicesTestComponent, { onResult }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const services = onResult.mock.calls[0][0];
      expect(services.dataBus).toBe(props.dataBus);
      expect(services.intentBridge).toBe(props.intentBridge);
      expect(services.policyEngine).toBe(props.policyEngine);
      expect(services.moduleRegistry).toBe(props.moduleRegistry);
      expect(services.navigator).toBe(props.navigator);
    });

    it('returns same references across re-renders (memoization)', () => {
      const props = createProviderProps();
      const results: any[] = [];
      const onResult = (val: any) => results.push(val);

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(UseSDKServicesTestComponent, { onResult }),
          ),
        );
      });

      // Force a re-render with same props
      act(() => {
        tree!.update(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(UseSDKServicesTestComponent, { onResult }),
          ),
        );
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      const first = results[0];
      const second = results[1];

      // Because useMemo dependencies haven't changed, the context value
      // should be referentially identical, so the extracted services match.
      expect(first.dataBus).toBe(second.dataBus);
      expect(first.intentBridge).toBe(second.intentBridge);
      expect(first.policyEngine).toBe(second.policyEngine);
      expect(first.moduleRegistry).toBe(second.moduleRegistry);
      expect(first.navigator).toBe(second.navigator);
    });
  });

  describe('KernelProvider', () => {
    it('renders children', () => {
      const props = createProviderProps();

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement('View', null, 'child-content'),
          ),
        );
      });

      const json = tree!.toJSON() as Record<string, unknown>;
      expect(json).toBeTruthy();
      // Find the child element
      const children = tree!.root.findAll((el: any) => el.children?.includes('child-content'));
      expect(children.length).toBeGreaterThan(0);
    });

    it('context value includes all expected fields', () => {
      const props = createProviderProps();
      const onResult = jest.fn();

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(UseKernelTestComponent, { onResult }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];

      // Verify all expected fields are present
      expect(ctx).toHaveProperty('kernel');
      expect(ctx).toHaveProperty('state');
      expect(ctx).toHaveProperty('config');
      expect(ctx).toHaveProperty('status');
      expect(ctx).toHaveProperty('dataBus');
      expect(ctx).toHaveProperty('intentBridge');
      expect(ctx).toHaveProperty('policyEngine');
      expect(ctx).toHaveProperty('moduleRegistry');
      expect(ctx).toHaveProperty('navigator');

      // Verify values match what was provided
      expect(ctx.kernel).toBe(props.kernel);
      expect(ctx.dataBus).toBe(props.dataBus);
      expect(ctx.intentBridge).toBe(props.intentBridge);
      expect(ctx.policyEngine).toBe(props.policyEngine);
      expect(ctx.moduleRegistry).toBe(props.moduleRegistry);
      expect(ctx.navigator).toBe(props.navigator);
    });
  });
});
