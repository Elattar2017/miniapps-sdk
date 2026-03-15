/**
 * ZoneRenderer Test Suite
 * Tests the zone renderer component that delegates to ActionZone or ScreenRenderer
 * based on zone configuration.
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

const mockConfig = {
  tenantId: 'test-tenant',
  userId: 'u1',
  apiBaseUrl: 'https://api.test.com',
  authToken: 'token',
  zones: {
    actions: { type: 'actions' as const, position: 'top' as const, height: 120 },
    main: { type: 'fill' as const, position: 'bottom' as const, flex: 1 },
    dashboard: { type: 'dashboard' as const, position: 'fill' as const, emptyMessage: 'Select a module' },
    styled: {
      type: 'fill' as const,
      position: 'fill' as const,
      backgroundColor: '#F0F0F0',
      padding: 8,
      height: 200,
      width: 300,
    },
    flexed: { type: 'fill' as const, position: 'fill' as const, flex: 2 },
    noflex: { type: 'fill' as const, position: 'fill' as const },
    unknown: { type: 'unknown_type' as any, position: 'top' as const },
    custom: { type: 'custom' as const, position: 'fill' as const },
    forms: { type: 'forms' as const, position: 'fill' as const, emptyMessage: 'No forms' },
  },
  designTokens: {
    colors: { primary: '#0066CC', background: '#FFFFFF' },
    typography: { fontFamily: 'System', baseFontSize: 14 },
    spacing: { unit: 4 },
    borderRadius: { default: 8 },
  },
};

jest.mock('../../src/kernel/KernelContext', () => {
  const actual = jest.requireActual('../../src/kernel/KernelContext');
  return {
    ...actual,
    useKernel: jest.fn(() => ({
      config: mockConfig,
      state: 'ACTIVE',
      status: { state: 'ACTIVE', moduleCount: 0 },
      kernel: {},
      dataBus: mockDataBus,
      intentBridge: mockIntentBridge,
      policyEngine: mockPolicyEngine,
      moduleRegistry: mockModuleRegistry,
      navigator: mockNavigator,
    })),
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
  ActionZone: (props: any) =>
    React.createElement('View', {
      testID: 'ActionZone',
      zoneId: props.zoneId,
      zoneConfig: props.zoneConfig,
    }),
}));

jest.mock('../../src/components/ScreenRenderer', () => ({
  ScreenRenderer: (props: any) =>
    React.createElement('View', {
      testID: 'ScreenRenderer',
      moduleId: props.moduleId,
      screenId: props.screenId,
    }),
}));

import { ZoneRenderer } from '../../src/components/ZoneRenderer';
import { useKernel } from '../../src/kernel/KernelContext';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();

  // Reset useKernel mock to default (ACTIVE state)
  (useKernel as jest.Mock).mockReturnValue({
    config: mockConfig,
    state: 'ACTIVE',
    status: { state: 'ACTIVE', moduleCount: 0 },
    kernel: {},
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

describe('ZoneRenderer', () => {
  it('returns null for unknown zone ID', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'nonexistent' }),
      );
    });

    expect(tree!.toJSON()).toBeNull();
  });

  it('returns null when kernel state is not ACTIVE', () => {
    (useKernel as jest.Mock).mockReturnValue({
      config: mockConfig,
      state: 'BOOT',
      status: { state: 'BOOT', moduleCount: 0 },
      kernel: {},
      dataBus: mockDataBus,
      intentBridge: mockIntentBridge,
      policyEngine: mockPolicyEngine,
      moduleRegistry: mockModuleRegistry,
      navigator: mockNavigator,
    });

    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'main' }),
      );
    });

    expect(tree!.toJSON()).toBeNull();
  });

  it('renders ActionZone for zone type actions', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'actions' }),
      );
    });

    const actionZones = tree!.root.findAll(
      (el: any) => el.props.testID === 'ActionZone',
    );
    expect(actionZones.length).toBe(1);
    expect(actionZones[0].props.zoneId).toBe('actions');
  });

  it('renders empty message when no active module for fill type', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'dashboard' }),
      );
    });

    // dashboard zone has emptyMessage: 'Select a module'
    const emptyTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('Select a module'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('renders empty View when no active module and no emptyMessage', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'main' }),
      );
    });

    // Should not have ScreenRenderer or ActionZone
    const screenRenderers = tree!.root.findAll(
      (el: any) => el.props.testID === 'ScreenRenderer',
    );
    const actionZones = tree!.root.findAll(
      (el: any) => el.props.testID === 'ActionZone',
    );
    expect(screenRenderers.length).toBe(0);
    expect(actionZones.length).toBe(0);

    // Should render something (an empty View)
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('container style includes height from zone config', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'styled' }),
      );
    });

    // Find the outermost container with height: 200
    const containers = tree!.root.findAll(
      (el: any) => el.props.style?.height === 200,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('container style includes width from zone config', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'styled' }),
      );
    });

    const containers = tree!.root.findAll(
      (el: any) => el.props.style?.width === 300,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('container style includes flex from zone config', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'flexed' }),
      );
    });

    const containers = tree!.root.findAll(
      (el: any) => el.props.style?.flex === 2,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('container style includes backgroundColor and padding', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'styled' }),
      );
    });

    const containers = tree!.root.findAll(
      (el: any) =>
        el.props.style?.backgroundColor === '#F0F0F0' &&
        el.props.style?.padding === 8,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('default flex=1 for fill type without explicit flex or height', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'noflex' }),
      );
    });

    // The container should have flex: 1 as default
    const containers = tree!.root.findAll(
      (el: any) => el.props.style?.flex === 1,
    );
    expect(containers.length).toBeGreaterThan(0);
  });

  it('handles unknown zone type gracefully', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'unknown' }),
      );
    });

    // Should render without throwing
    expect(tree!.toJSON()).toBeTruthy();

    // Should NOT render ActionZone or ScreenRenderer
    const actionZones = tree!.root.findAll(
      (el: any) => el.props.testID === 'ActionZone',
    );
    const screenRenderers = tree!.root.findAll(
      (el: any) => el.props.testID === 'ScreenRenderer',
    );
    expect(actionZones.length).toBe(0);
    expect(screenRenderers.length).toBe(0);
  });

  it('renders for custom zone type with empty message', () => {
    // Update config to have emptyMessage on the custom zone
    const customConfig = { ...mockConfig };
    customConfig.zones = {
      ...mockConfig.zones,
      custom: { type: 'custom' as const, position: 'fill' as const, emptyMessage: 'Custom empty' },
    };
    (useKernel as jest.Mock).mockReturnValue({
      config: customConfig,
      state: 'ACTIVE',
      status: { state: 'ACTIVE', moduleCount: 0 },
      kernel: {},
      dataBus: mockDataBus,
      intentBridge: mockIntentBridge,
      policyEngine: mockPolicyEngine,
      moduleRegistry: mockModuleRegistry,
      navigator: mockNavigator,
    });

    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'custom' }),
      );
    });

    const emptyTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('Custom empty'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('renders for forms zone type with empty message', () => {
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ZoneRenderer, { zoneId: 'forms' }),
      );
    });

    const emptyTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('No forms'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  // --- Transition animation tests ---

  describe('screen transition animations', () => {
    it('wraps ScreenRenderer in animated view when active route exists', () => {
      mockNavigator.getCurrentRoute.mockReturnValue({
        moduleId: 'mod1',
        screenId: 'screen1',
        transition: 'fade',
      });

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ZoneRenderer, { zoneId: 'main' }));
      });

      // ScreenRenderer should be rendered
      const screens = tree!.root.findAll((el: any) => el.props.testID === 'ScreenRenderer');
      expect(screens.length).toBe(1);
      expect(screens[0].props.moduleId).toBe('mod1');
      expect(screens[0].props.screenId).toBe('screen1');
    });

    it('renders ScreenRenderer for slide transition (default)', () => {
      mockNavigator.getCurrentRoute.mockReturnValue({
        moduleId: 'mod1',
        screenId: 'screen1',
      });

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ZoneRenderer, { zoneId: 'main' }));
      });

      const screens = tree!.root.findAll((el: any) => el.props.testID === 'ScreenRenderer');
      expect(screens.length).toBe(1);
    });

    it('renders ScreenRenderer for modal transition', () => {
      mockNavigator.getCurrentRoute.mockReturnValue({
        moduleId: 'mod1',
        screenId: 'screen1',
        transition: 'modal',
      });

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ZoneRenderer, { zoneId: 'main' }));
      });

      const screens = tree!.root.findAll((el: any) => el.props.testID === 'ScreenRenderer');
      expect(screens.length).toBe(1);
    });

    it('renders ScreenRenderer for none transition (no animation)', () => {
      mockNavigator.getCurrentRoute.mockReturnValue({
        moduleId: 'mod1',
        screenId: 'screen1',
        transition: 'none',
      });

      let tree: ReactTestRenderer;
      act(() => {
        tree = create(React.createElement(ZoneRenderer, { zoneId: 'main' }));
      });

      const screens = tree!.root.findAll((el: any) => el.props.testID === 'ScreenRenderer');
      expect(screens.length).toBe(1);
    });
  });
});
