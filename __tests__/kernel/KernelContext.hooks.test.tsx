/**
 * KernelContext Hooks Test Suite
 *
 * Tests useDesignTokens, useSDKServices extended fields,
 * and KernelProvider memoization behavior.
 */

jest.mock('react-native');

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';
import {
  KernelProvider,
  useKernel,
  useDesignTokens,
  useSDKServices,
} from '../../src/kernel/KernelContext';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProviderProps(overrides?: Partial<any>) {
  return {
    kernel: {
      getState: jest.fn().mockReturnValue('ACTIVE'),
      getStatus: jest.fn().mockReturnValue({}),
      getConfig: jest.fn().mockReturnValue({}),
      suspend: jest.fn(),
      resume: jest.fn(),
      shutdown: jest.fn(),
      getDataBus: jest.fn(),
      getIntentBridge: jest.fn(),
      getPolicyEngine: jest.fn(),
      getModuleRegistry: jest.fn(),
      getAPIProxy: jest.fn().mockReturnValue(null),
    },
    state: 'ACTIVE' as const,
    config: {
      tenantId: 'test',
      userId: 'u1',
      apiBaseUrl: 'https://api.test.com',
      authToken: 'token',
      zones: {},
      designTokens: {
        colors: { primary: '#0066CC', background: '#FFFFFF' },
        typography: { fontFamily: 'System', baseFontSize: 14 },
        spacing: { unit: 4 },
        borderRadius: { default: 8 },
      },
    },
    status: {},
    dataBus: { publish: jest.fn(), subscribe: jest.fn() },
    intentBridge: { emit: jest.fn(), on: jest.fn() },
    policyEngine: { evaluate: jest.fn() },
    moduleRegistry: { getModule: jest.fn() },
    navigator: { navigate: jest.fn(), goBack: jest.fn() },
    designTokens: {
      colors: { primary: '#0066CC', background: '#FFFFFF' },
      typography: { fontFamily: 'System', baseFontSize: 14 },
      spacing: { unit: 4 },
      borderRadius: { default: 8 },
    },
    apiProxy: null,
    userRoles: ['admin'],
    ...overrides,
  };
}

function TestHookComponent({ hook, onResult }: { hook: () => any; onResult: (val: any) => void }) {
  const result = hook();
  onResult(result);
  return React.createElement('View', null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KernelContext Hooks', () => {
  // -------------------------------------------------------------------------
  // useDesignTokens
  // -------------------------------------------------------------------------
  describe('useDesignTokens', () => {
    it('throws when used outside KernelProvider', () => {
      let error: Error | undefined;
      const ThrowComponent = () => {
        try {
          useDesignTokens();
        } catch (e) {
          error = e as Error;
        }
        return React.createElement('View', null);
      };

      act(() => {
        create(React.createElement(ThrowComponent));
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain('useKernel');
    });

    it('returns designTokens from provider props', () => {
      const props = makeProviderProps();
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useDesignTokens,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const tokens = onResult.mock.calls[0][0];
      expect(tokens.colors.primary).toBe('#0066CC');
      expect(tokens.typography.fontFamily).toBe('System');
      expect(tokens.spacing.unit).toBe(4);
      expect(tokens.borderRadius.default).toBe(8);
    });

    it('returns updated tokens on re-render with new props', () => {
      const props = makeProviderProps();
      const results: any[] = [];
      const onResult = (val: any) => results.push(val);

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useDesignTokens,
              onResult,
            }),
          ),
        );
      });

      // Update with new design tokens
      const updatedTokens = {
        colors: { primary: '#FF0000', background: '#000000' },
        typography: { fontFamily: 'Roboto', baseFontSize: 16 },
        spacing: { unit: 8 },
        borderRadius: { default: 12 },
      };

      const updatedProps = makeProviderProps({ designTokens: updatedTokens });

      act(() => {
        tree!.update(
          React.createElement(
            KernelProvider,
            updatedProps as any,
            React.createElement(TestHookComponent, {
              hook: useDesignTokens,
              onResult,
            }),
          ),
        );
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      const latestTokens = results[results.length - 1];
      expect(latestTokens.colors.primary).toBe('#FF0000');
      expect(latestTokens.typography.fontFamily).toBe('Roboto');
    });
  });

  // -------------------------------------------------------------------------
  // useSDKServices
  // -------------------------------------------------------------------------
  describe('useSDKServices', () => {
    it('returns apiProxy from context', () => {
      const mockApiProxy = { request: jest.fn() };
      const props = makeProviderProps({ apiProxy: mockApiProxy });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useSDKServices,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const services = onResult.mock.calls[0][0];
      expect(services.apiProxy).toBe(mockApiProxy);
    });

    it('returns userRoles from context', () => {
      const props = makeProviderProps({ userRoles: ['admin', 'editor'] });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useSDKServices,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const services = onResult.mock.calls[0][0];
      expect(services.userRoles).toEqual(['admin', 'editor']);
    });

    it('returns subscriptionProvider when provided', () => {
      const mockPlanProvider = { getPlan: jest.fn(), evaluateAccess: jest.fn() };
      const props = makeProviderProps({ subscriptionProvider: mockPlanProvider });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useSDKServices,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const services = onResult.mock.calls[0][0];
      expect(services.subscriptionProvider).toBe(mockPlanProvider);
    });

    it('returns undefined subscriptionProvider when not provided', () => {
      const props = makeProviderProps();
      // Ensure subscriptionProvider is not set
      delete (props as any).subscriptionProvider;
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useSDKServices,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const services = onResult.mock.calls[0][0];
      expect(services.subscriptionProvider).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // KernelProvider
  // -------------------------------------------------------------------------
  describe('KernelProvider', () => {
    it('renders children', () => {
      const props = makeProviderProps();

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
    });

    it('provides kernel context value to children', () => {
      const props = makeProviderProps();
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useKernel,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];
      expect(ctx.kernel).toBe(props.kernel);
      expect(ctx.state).toBe('ACTIVE');
      expect(ctx.config).toBe(props.config);
      expect(ctx.dataBus).toBe(props.dataBus);
      expect(ctx.intentBridge).toBe(props.intentBridge);
      expect(ctx.policyEngine).toBe(props.policyEngine);
      expect(ctx.moduleRegistry).toBe(props.moduleRegistry);
      expect(ctx.navigator).toBe(props.navigator);
      expect(ctx.designTokens).toBe(props.designTokens);
      expect(ctx.apiProxy).toBe(props.apiProxy);
      expect(ctx.userRoles).toBe(props.userRoles);
    });

    it('renders with apiProxy=null', () => {
      const props = makeProviderProps({ apiProxy: null });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useKernel,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];
      expect(ctx.apiProxy).toBeNull();
    });

    it('renders with empty userRoles array', () => {
      const props = makeProviderProps({ userRoles: [] });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useKernel,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];
      expect(ctx.userRoles).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // useKernel
  // -------------------------------------------------------------------------
  describe('useKernel', () => {
    it('throws descriptive error outside provider', () => {
      let error: Error | undefined;
      const ThrowComponent = () => {
        try {
          useKernel();
        } catch (e) {
          error = e as Error;
        }
        return React.createElement('View', null);
      };

      act(() => {
        create(React.createElement(ThrowComponent));
      });

      expect(error).toBeDefined();
      expect(error!.message).toContain('useKernel()');
      expect(error!.message).toContain('SDKProvider');
    });

    it('returns full context value inside provider', () => {
      const props = makeProviderProps();
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useKernel,
              onResult,
            }),
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
      expect(ctx).toHaveProperty('designTokens');
      expect(ctx).toHaveProperty('apiProxy');
      expect(ctx).toHaveProperty('userRoles');
    });

    it('returns state from context', () => {
      const props = makeProviderProps({ state: 'SUSPENDED' as const });
      const onResult = jest.fn();

      act(() => {
        create(
          React.createElement(
            KernelProvider,
            props as any,
            React.createElement(TestHookComponent, {
              hook: useKernel,
              onResult,
            }),
          ),
        );
      });

      expect(onResult).toHaveBeenCalled();
      const ctx = onResult.mock.calls[0][0];
      expect(ctx.state).toBe('SUSPENDED');
    });
  });
});
