/**
 * ZoneRenderer Branch Coverage Tests
 *
 * Exercises uncovered branches in ZoneRenderer.tsx:
 * - Zone type 'fill' style logic (auto-flex, explicit height, explicit flex)
 * - Zone types 'dashboard', 'forms', 'custom' with active module -> ScreenRenderer
 * - Unknown zone type -> Fragment fallback
 * - Empty message vs no empty message
 * - Zone not found in config -> null
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockNavigator = {
  navigate: jest.fn(),
  goBack: jest.fn().mockReturnValue(true),
  getCurrentRoute: jest.fn().mockReturnValue(undefined),
  reset: jest.fn(),
  getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
  addListener: jest.fn().mockReturnValue(jest.fn()),
};
const mockDataBus = { publish: jest.fn(), subscribe: jest.fn().mockReturnValue(jest.fn()) };
const mockIntentBridge = { emit: jest.fn().mockResolvedValue(undefined) };
const mockPolicyEngine = { evaluate: jest.fn().mockResolvedValue({ allowed: true }) };
const mockModuleRegistry = { get: jest.fn() };

const baseConfig = {
  tenantId: 'test-tenant',
  userId: 'u1',
  apiBaseUrl: 'https://api.test.com',
  authToken: 'token',
  zones: {
    actions: { type: 'actions' as const, position: 'top' as const, height: 120 },
    fillNoHeightNoFlex: { type: 'fill' as const, position: 'fill' as const },
    fillWithHeight: { type: 'fill' as const, position: 'fill' as const, height: 250 },
    fillWithFlex: { type: 'fill' as const, position: 'fill' as const, flex: 3 },
    dashboard: { type: 'dashboard' as const, position: 'fill' as const, emptyMessage: 'No dashboard' },
    dashboardNoMsg: { type: 'dashboard' as const, position: 'fill' as const },
    forms: { type: 'forms' as const, position: 'fill' as const, emptyMessage: 'No forms' },
    formsNoMsg: { type: 'forms' as const, position: 'fill' as const },
    custom: { type: 'custom' as const, position: 'fill' as const, emptyMessage: 'Custom empty' },
    customNoMsg: { type: 'custom' as const, position: 'fill' as const },
    unknown: { type: 'unknown_type' as never, position: 'top' as const },
  },
  designTokens: {
    colors: { primary: '#0066CC', background: '#FFFFFF' },
    typography: { fontFamily: 'System', baseFontSize: 14 },
    spacing: { unit: 4 },
    borderRadius: { default: 8 },
  },
};

function makeKernelValue(overrides?: Record<string, unknown>) {
  return {
    config: baseConfig,
    state: 'ACTIVE',
    status: { state: 'ACTIVE', moduleCount: 0 },
    kernel: {},
    dataBus: mockDataBus,
    intentBridge: mockIntentBridge,
    policyEngine: mockPolicyEngine,
    moduleRegistry: mockModuleRegistry,
    navigator: mockNavigator,
    ...overrides,
  };
}

jest.mock('../../src/kernel/KernelContext', () => {
  const actual = jest.requireActual('../../src/kernel/KernelContext');
  return {
    ...actual,
    useKernel: jest.fn(() => makeKernelValue()),
    useSDKServices: jest.fn(() => ({
      dataBus: mockDataBus,
      intentBridge: mockIntentBridge,
      policyEngine: mockPolicyEngine,
      moduleRegistry: mockModuleRegistry,
      navigator: mockNavigator,
    })),
  };
});

jest.mock('../../src/components/ActionZone', () => ({
  ActionZone: (props: Record<string, unknown>) =>
    React.createElement('View', {
      testID: 'ActionZone',
      zoneId: props.zoneId,
      zoneConfig: props.zoneConfig,
    }),
}));

jest.mock('../../src/components/ScreenRenderer', () => ({
  ScreenRenderer: (props: Record<string, unknown>) =>
    React.createElement('View', {
      testID: 'ScreenRenderer',
      moduleId: props.moduleId,
      screenId: props.screenId,
    }),
}));

import { ZoneRenderer } from '../../src/components/ZoneRenderer';
import { useKernel, useSDKServices } from '../../src/kernel/KernelContext';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();

  mockNavigator.getCurrentRoute.mockReturnValue(undefined);
  mockNavigator.getState.mockReturnValue({ routes: [], currentIndex: -1 });
  mockNavigator.addListener.mockReturnValue(jest.fn());

  (useKernel as jest.Mock).mockReturnValue(makeKernelValue());
  (useSDKServices as jest.Mock).mockReturnValue({
    dataBus: mockDataBus,
    intentBridge: mockIntentBridge,
    policyEngine: mockPolicyEngine,
    moduleRegistry: mockModuleRegistry,
    navigator: mockNavigator,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ZoneRenderer – fill type style branches', () => {
  it('gets flex=1 automatically when fill type has no height and no flex', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'fillNoHeightNoFlex' }));
    });

    // Container should get flex: 1 by default
    const containers = tree!.root.findAll(
      (el) => el.props.style?.flex === 1,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('uses explicit height when fill type has height set', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'fillWithHeight' }));
    });

    const containers = tree!.root.findAll(
      (el) => el.props.style?.height === 250,
    );
    expect(containers.length).toBeGreaterThan(0);

    // Should NOT have auto flex=1 since height is present
    const outerContainer = tree!.root.findAll(
      (el) => el.props.style?.height === 250 && el.props.style?.flex === 1,
    );
    expect(outerContainer.length).toBe(0);
  });

  it('uses provided flex value when fill type has explicit flex', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'fillWithFlex' }));
    });

    const containers = tree!.root.findAll(
      (el) => el.props.style?.flex === 3,
    );
    expect(containers.length).toBeGreaterThan(0);
  });
});

describe('ZoneRenderer – zone types with active module', () => {
  beforeEach(() => {
    // Simulate an active module being navigated to
    mockNavigator.getCurrentRoute.mockReturnValue({
      moduleId: 'com.vendor.test',
      screenId: 'home',
    });
  });

  it('renders ScreenRenderer for dashboard type when module is active', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'dashboard' }));
    });

    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(screenRenderers.length).toBe(1);
    expect(screenRenderers[0].props.moduleId).toBe('com.vendor.test');
    expect(screenRenderers[0].props.screenId).toBe('home');
  });

  it('renders ScreenRenderer for forms type when module is active', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'forms' }));
    });

    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(screenRenderers.length).toBe(1);
    expect(screenRenderers[0].props.moduleId).toBe('com.vendor.test');
  });

  it('renders ScreenRenderer for custom type when module is active', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'custom' }));
    });

    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(screenRenderers.length).toBe(1);
    expect(screenRenderers[0].props.moduleId).toBe('com.vendor.test');
  });

  it('renders ScreenRenderer for fill type when module is active', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'fillNoHeightNoFlex' }));
    });

    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(screenRenderers.length).toBe(1);
  });
});

describe('ZoneRenderer – empty message branches', () => {
  it('shows emptyMessage text for dashboard zone with no active module', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'dashboard' }));
    });

    const emptyTexts = tree!.root.findAll(
      (el) => el.children?.includes('No dashboard'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('renders empty SDKView for dashboard zone without emptyMessage', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'dashboardNoMsg' }));
    });

    // Should not contain any text
    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(screenRenderers.length).toBe(0);

    // But should render something
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('shows emptyMessage for custom zone without active module', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'custom' }));
    });

    const emptyTexts = tree!.root.findAll(
      (el) => el.children?.includes('Custom empty'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });
});

describe('ZoneRenderer – edge cases', () => {
  it('handles unknown zone type gracefully (renders Fragment)', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'unknown' }));
    });

    // Should render without throwing
    expect(tree!.toJSON()).toBeTruthy();

    // Should NOT have ActionZone or ScreenRenderer
    const actionZones = tree!.root.findAll(
      (el) => el.props.testID === 'ActionZone',
    );
    const screenRenderers = tree!.root.findAll(
      (el) => el.props.testID === 'ScreenRenderer',
    );
    expect(actionZones.length).toBe(0);
    expect(screenRenderers.length).toBe(0);
  });

  it('returns null for zone not found in kernel config', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ZoneRenderer, { zoneId: 'nonexistent-zone' }));
    });

    expect(tree!.toJSON()).toBeNull();
  });
});
