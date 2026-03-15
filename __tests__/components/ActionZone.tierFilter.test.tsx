/**
 * ActionZone Tier Filter Test Suite
 * Tests subscription tier-based filtering.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKScrollView: 'SDKScrollView',
  SDKActivityIndicator: 'SDKActivityIndicator',
  SDKImage: 'SDKImage',
  SDKTouchableOpacity: 'SDKTouchableOpacity',
}));

jest.mock('../../src/adapters/NavigationAdapter', () => ({
  createSDKNavigator: jest.fn(() => ({
    navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn(),
    getState: jest.fn().mockReturnValue({ routes: [], currentIndex: -1 }),
    getCurrentRoute: jest.fn(), addListener: jest.fn(),
  })),
  SDKNavigationContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  isNavigationAvailable: jest.fn(() => false),
}));

jest.mock('../../src/kernel/KernelContext', () => ({
  useKernel: jest.fn(),
  useSDKServices: jest.fn(),
}));

jest.mock('../../src/components/SDKProvider', () => ({
  useSDK: jest.fn(),
}));

jest.mock('../../src/components/ModuleTile', () => ({
  ModuleTile: (props: any) =>
    React.createElement('View', {
      testID: `tile-${props.module?.id}`,
      onPress: props.onPress,
    }),
}));

import { ActionZone } from '../../src/components/ActionZone';
import { useKernel } from '../../src/kernel/KernelContext';
import { useSDK } from '../../src/components/SDKProvider';
import type { ZoneConfig, ModuleSummary } from '../../src/types';

let mockModuleLoader: any;
let mockModuleRegistry: any;
let mockPolicyEngine: any;
let mockSubscriptionProvider: any;

const sampleModules: ModuleSummary[] = [
  { id: 'mod1', name: 'Module 1', icon: 'icon1', category: 'finance', version: '1.0.0', description: 'Mod 1' },
  { id: 'mod2', name: 'Module 2', icon: 'icon2', category: 'tools', version: '1.0.0', description: 'Mod 2' },
  { id: 'mod3', name: 'Module 3', icon: 'icon3', category: 'finance', version: '1.0.0', description: 'Mod 3' },
];

const modulesWithTiers: ModuleSummary[] = [
  { id: 'mod1', name: 'Gold Only', icon: 'i1', category: 'finance', version: '1.0.0', description: 'G', requiredTiers: ['gold'] },
  { id: 'mod2', name: 'Gold or Biz', icon: 'i2', category: 'tools', version: '1.0.0', description: 'GB', requiredTiers: ['gold', 'business'] },
  { id: 'mod3', name: 'No Tier Req', icon: 'i3', category: 'finance', version: '1.0.0', description: 'Any' },
  { id: 'mod4', name: 'Prepaid Only', icon: 'i4', category: 'tools', version: '1.0.0', description: 'P', requiredTiers: ['prepaid'] },
];

const defaultZoneConfig: ZoneConfig = { type: 'actions', position: 'top', height: 120 };

function setupMocks(subscriptionConfig?: any, subProvider?: any) {
  mockModuleLoader = {
    loadModuleList: jest.fn().mockResolvedValue(sampleModules),
    loadManifest: jest.fn(),
    loadScreen: jest.fn(),
  };
  mockModuleRegistry = {
    get: jest.fn(), register: jest.fn(), setModuleState: jest.fn(),
  };
  mockPolicyEngine = {
    evaluate: jest.fn().mockResolvedValue({ allowed: true }),
  };
  mockSubscriptionProvider = subProvider ?? undefined;

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    moduleRegistry: mockModuleRegistry,
    schemaInterpreter: {},
    expressionEngine: {},
  });

  (useKernel as jest.Mock).mockReturnValue({
    config: {
      tenantId: 'test-tenant', userId: 'user-1',
      apiBaseUrl: 'https://api.test.com', authToken: 'token', zones: {},
      ...(subscriptionConfig ? { subscription: subscriptionConfig } : {}),
    },
    state: 'ACTIVE',
    policyEngine: mockPolicyEngine,
    userRoles: [],
    subscriptionProvider: mockSubscriptionProvider,
  });
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
});

afterEach(() => { jest.restoreAllMocks(); });

describe('ActionZone subscription tier filtering', () => {
  it('without subscription config: no tier filtering', async () => {
    setupMocks();
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen: jest.fn(),
        }),
      );
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
  });

  it('with subscription config and tier: filters modules by tier access', async () => {
    const subProvider = {
      getModuleAccess: jest.fn().mockImplementation(async (_tier: string, moduleId: string) => {
        return moduleId !== 'mod2';
      }),
    };
    setupMocks({ tier: 'gold' }, subProvider);
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions',
        zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(0);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
  });

  it('module accessible for tier: shown', async () => {
    const subProvider = {
      getModuleAccess: jest.fn().mockResolvedValue(true),
    };
    setupMocks({ tier: 'gold' }, subProvider);
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions',
        zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
  });

  it('module not accessible for tier: hidden', async () => {
    const subProvider = {
      getModuleAccess: jest.fn().mockResolvedValue(false),
    };
    setupMocks({ tier: 'prepaid' }, subProvider);
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions',
        zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    const emptyTexts = tree!.root.findAll((el: any) => el.children?.includes('No modules available'));
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('tier check passes: modules shown', async () => {
    const subProvider = {
      getModuleAccess: jest.fn().mockResolvedValue(true),
    };
    setupMocks({ tier: 'gold' }, subProvider);
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions',
        zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
  });

  it('with subscription but no subscriptionProvider: no server-side filtering', async () => {
    setupMocks({ tier: 'gold' }, undefined);
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions',
        zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
  });
});

describe('ActionZone requiredTiers client-side filtering', () => {
  it('module with requiredTiers shown when user tier matches', async () => {
    setupMocks({ tier: 'gold' }, undefined);
    const tieredLoader = {
      loadModuleList: jest.fn().mockResolvedValue(modulesWithTiers),
      loadManifest: jest.fn(), loadScreen: jest.fn(),
    };
    (useSDK as jest.Mock).mockReturnValue({
      moduleLoader: tieredLoader,
      moduleRegistry: mockModuleRegistry,
      schemaInterpreter: {}, expressionEngine: {},
    });
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions', zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    // mod1 (gold) - shown, mod2 (gold,business) - shown, mod3 (no req) - shown, mod4 (prepaid) - hidden
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod4')).toHaveLength(0);
  });

  it('module with requiredTiers hidden when user tier does not match', async () => {
    setupMocks({ tier: 'prepaid' }, undefined);
    const tieredLoader = {
      loadModuleList: jest.fn().mockResolvedValue(modulesWithTiers),
      loadManifest: jest.fn(), loadScreen: jest.fn(),
    };
    (useSDK as jest.Mock).mockReturnValue({
      moduleLoader: tieredLoader,
      moduleRegistry: mockModuleRegistry,
      schemaInterpreter: {}, expressionEngine: {},
    });
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions', zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    // mod1 (gold) - hidden, mod2 (gold,business) - hidden, mod3 (no req) - shown, mod4 (prepaid) - shown
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(0);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(0);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod4')).toHaveLength(1);
  });

  it('modules with no requiredTiers always shown regardless of user tier', async () => {
    const noTierModules: ModuleSummary[] = [
      { id: 'mod1', name: 'No Tier', icon: 'i1', category: 'c', version: '1.0.0', description: 'D' },
      { id: 'mod2', name: 'Empty Tier', icon: 'i2', category: 'c', version: '1.0.0', description: 'D', requiredTiers: [] },
    ];
    setupMocks({ tier: 'prepaid' }, undefined);
    const noTierLoader = {
      loadModuleList: jest.fn().mockResolvedValue(noTierModules),
      loadManifest: jest.fn(), loadScreen: jest.fn(),
    };
    (useSDK as jest.Mock).mockReturnValue({
      moduleLoader: noTierLoader,
      moduleRegistry: mockModuleRegistry,
      schemaInterpreter: {}, expressionEngine: {},
    });
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions', zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
  });

  it('requiredTiers filter works without subscriptionProvider (client-only)', async () => {
    // tier set, but no subscriptionProvider — client-side requiredTiers still filters
    setupMocks({ tier: 'business' }, undefined);
    const tieredLoader = {
      loadModuleList: jest.fn().mockResolvedValue(modulesWithTiers),
      loadManifest: jest.fn(), loadScreen: jest.fn(),
    };
    (useSDK as jest.Mock).mockReturnValue({
      moduleLoader: tieredLoader,
      moduleRegistry: mockModuleRegistry,
      schemaInterpreter: {}, expressionEngine: {},
    });
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ActionZone, {
        zoneId: 'actions', zoneConfig: defaultZoneConfig, onModuleOpen: jest.fn(),
      }));
    });
    // mod1 (gold) - hidden, mod2 (gold,business) - shown, mod3 (no req) - shown, mod4 (prepaid) - hidden
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1')).toHaveLength(0);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3')).toHaveLength(1);
    expect(tree!.root.findAll((el: any) => el.props.testID === 'tile-mod4')).toHaveLength(0);
  });
});
