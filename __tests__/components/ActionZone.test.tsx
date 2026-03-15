/**
 * ActionZone Test Suite
 * Tests the action zone component that displays module tiles with policy enforcement.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// Mock adapters to avoid pulling in NavigationAdapter / React Navigation
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

// ---------------------------------------------------------------------------
// Shared mock variables
// ---------------------------------------------------------------------------

let mockModuleLoader: any;
let mockModuleRegistry: any;
let mockPolicyEngine: any;

function setupMocks() {
  mockModuleLoader = {
    loadModuleList: jest.fn().mockResolvedValue([]),
    loadManifest: jest.fn(),
    loadScreen: jest.fn(),
  };
  mockModuleRegistry = {
    get: jest.fn(),
    register: jest.fn().mockReturnValue({ id: 'mod1', state: 'loading' }),
    setModuleState: jest.fn(),
  };
  mockPolicyEngine = {
    evaluate: jest.fn().mockResolvedValue({ allowed: true }),
  };

  (useSDK as jest.Mock).mockReturnValue({
    moduleLoader: mockModuleLoader,
    moduleRegistry: mockModuleRegistry,
    schemaInterpreter: {},
    expressionEngine: {},
  });

  (useKernel as jest.Mock).mockReturnValue({
    config: {
      tenantId: 'test-tenant',
      userId: 'user-1',
      apiBaseUrl: 'https://api.test.com',
      authToken: 'token',
      zones: {},
    },
    state: 'ACTIVE',
    policyEngine: mockPolicyEngine,
    userRoles: [],
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

const defaultZoneConfig: ZoneConfig = {
  type: 'actions',
  position: 'top',
  height: 120,
};

const sampleModules: ModuleSummary[] = [
  { id: 'mod1', name: 'Module 1', icon: 'icon1', category: 'finance', version: '1.0.0', description: 'Mod 1' },
  { id: 'mod2', name: 'Module 2', icon: 'icon2', category: 'tools', version: '1.0.0', description: 'Mod 2' },
  { id: 'mod3', name: 'Module 3', icon: 'icon3', category: 'finance', version: '1.0.0', description: 'Mod 3' },
];

describe('ActionZone', () => {
  it('renders loading indicator initially', () => {
    mockModuleLoader.loadModuleList.mockReturnValue(new Promise(() => {}));
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const indicators = tree!.root.findAll(
      (el: any) => el.props.size === 'small',
    );
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('renders error message when loadModuleList fails', async () => {
    mockModuleLoader.loadModuleList.mockRejectedValue(new Error('Network error'));
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

    const errorTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('Failed to load modules'),
    );
    expect(errorTexts.length).toBeGreaterThan(0);
  });

  it('renders empty state when no modules', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([]);
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

    const emptyTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('No modules available'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('renders custom empty message from zone config', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([]);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: { ...defaultZoneConfig, emptyMessage: 'Nothing here' },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const emptyTexts = tree!.root.findAll(
      (el: any) => el.children?.includes('Nothing here'),
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('renders module tiles for loaded modules', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
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

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    const tile3 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3');
    expect(tile1.length).toBe(1);
    expect(tile2.length).toBe(1);
    expect(tile3.length).toBe(1);
  });

  it('filters by categories', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: {
            ...defaultZoneConfig,
            moduleFilter: { categories: ['finance'] },
          },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    const tile3 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3');
    expect(tile1.length).toBe(1);
    expect(tile2.length).toBe(0);
    expect(tile3.length).toBe(1);
  });

  it('filters by moduleIds', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: {
            ...defaultZoneConfig,
            moduleFilter: { moduleIds: ['mod2'] },
          },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    expect(tile1.length).toBe(0);
    expect(tile2.length).toBe(1);
  });

  it('filters by excludeModuleIds', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: {
            ...defaultZoneConfig,
            moduleFilter: { excludeModuleIds: ['mod1'] },
          },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    expect(tile1.length).toBe(0);
    expect(tile2.length).toBe(1);
  });

  it('filters by maxModules', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: {
            ...defaultZoneConfig,
            moduleFilter: { maxModules: 1 },
          },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    expect(tile1.length).toBe(1);
    expect(tile2.length).toBe(0);
  });

  it('tile press loads manifest and opens module', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
    mockModuleLoader.loadManifest.mockResolvedValue({
      id: 'mod1',
      name: 'Module 1',
      version: '1.0.0',
      entryScreen: 'main',
      description: 'Mod 1',
      icon: 'icon1',
      category: 'finance',
      screens: ['main'],
      permissions: { apis: [], storage: false },
      minSDKVersion: '1.0.0',
      signature: 'sig',
    });
    mockModuleRegistry.get.mockReturnValue(undefined);

    const onModuleOpen = jest.fn();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen,
        }),
      );
    });

    const tile = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    expect(tile.length).toBe(1);

    await act(async () => {
      tile[0].props.onPress();
    });

    expect(mockModuleLoader.loadManifest).toHaveBeenCalledWith('mod1');
    expect(mockModuleRegistry.register).toHaveBeenCalled();
    expect(mockModuleRegistry.setModuleState).toHaveBeenCalledWith('mod1', 'active');
    expect(onModuleOpen).toHaveBeenCalledWith('mod1', 'main');
  });

  it('tile press skips register if module already registered', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
    mockModuleLoader.loadManifest.mockResolvedValue({
      id: 'mod1',
      name: 'Module 1',
      version: '1.0.0',
      entryScreen: 'main',
      description: 'Mod 1',
      icon: 'icon1',
      category: 'finance',
      screens: ['main'],
      permissions: { apis: [], storage: false },
      minSDKVersion: '1.0.0',
      signature: 'sig',
    });
    mockModuleRegistry.get.mockReturnValue({ id: 'mod1', state: 'ready' });

    const onModuleOpen = jest.fn();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen,
        }),
      );
    });

    const tile = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');

    await act(async () => {
      tile[0].props.onPress();
    });

    expect(mockModuleRegistry.register).not.toHaveBeenCalled();
    expect(mockModuleRegistry.setModuleState).toHaveBeenCalledWith('mod1', 'active');
    expect(onModuleOpen).toHaveBeenCalledWith('mod1', 'main');
  });

  it('policy filtering removes denied modules from list', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    mockPolicyEngine.evaluate.mockImplementation(async (ctx: any) => {
      if (ctx.moduleId === 'mod2') {
        return { allowed: false, reason: 'Denied by policy' };
      }
      return { allowed: true };
    });

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

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    const tile2 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod2');
    const tile3 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod3');
    expect(tile1.length).toBe(1);
    expect(tile2.length).toBe(0);
    expect(tile3.length).toBe(1);
  });

  it('policy error during filtering includes module (fail-open)', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
    mockPolicyEngine.evaluate.mockRejectedValue(new Error('Policy service down'));

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

    const tile1 = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    expect(tile1.length).toBe(1);
  });

  it('tile press blocked when policy denies open action', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
    mockPolicyEngine.evaluate.mockImplementation(async (ctx: any) => {
      if (ctx.action === 'open') {
        return { allowed: false, reason: 'Open denied' };
      }
      return { allowed: true };
    });

    const onModuleOpen = jest.fn();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen,
        }),
      );
    });

    const tile = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');
    expect(tile.length).toBe(1);

    await act(async () => {
      tile[0].props.onPress();
    });

    expect(mockModuleLoader.loadManifest).not.toHaveBeenCalled();
    expect(onModuleOpen).not.toHaveBeenCalled();
  });

  it('tile press allowed when policy open check throws (fail-open)', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
    mockModuleLoader.loadManifest.mockResolvedValue({
      id: 'mod1',
      name: 'Module 1',
      version: '1.0.0',
      entryScreen: 'main',
      description: 'Mod 1',
      icon: 'icon1',
      category: 'finance',
      screens: ['main'],
      permissions: { apis: [], storage: false },
      minSDKVersion: '1.0.0',
      signature: 'sig',
    });
    mockModuleRegistry.get.mockReturnValue(undefined);

    mockPolicyEngine.evaluate.mockImplementation(async (ctx: any) => {
      if (ctx.action === 'open') {
        throw new Error('Policy engine crashed');
      }
      return { allowed: true };
    });

    const onModuleOpen = jest.fn();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: defaultZoneConfig,
          onModuleOpen,
        }),
      );
    });

    const tile = tree!.root.findAll((el: any) => el.props.testID === 'tile-mod1');

    await act(async () => {
      tile[0].props.onPress();
    });

    expect(onModuleOpen).toHaveBeenCalledWith('mod1', 'main');
  });

  it('horizontal scroll layout is default', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue([sampleModules[0]]);
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

    const scrollViews = tree!.root.findAll(
      (el: any) => el.props.horizontal === true,
    );
    expect(scrollViews.length).toBeGreaterThan(0);
  });

  it('grid layout renders wrapper Views', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: { ...defaultZoneConfig, layout: 'grid' },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const gridContainers = tree!.root.findAll(
      (el: any) => el.props.style?.flexWrap === 'wrap',
    );
    expect(gridContainers.length).toBeGreaterThan(0);
  });

  it('list layout renders vertical ScrollView', async () => {
    mockModuleLoader.loadModuleList.mockResolvedValue(sampleModules);
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = create(
        React.createElement(ActionZone, {
          zoneId: 'actions',
          zoneConfig: { ...defaultZoneConfig, layout: 'list' },
          onModuleOpen: jest.fn(),
        }),
      );
    });

    const horizontalScrolls = tree!.root.findAll(
      (el: any) => el.props.horizontal === true,
    );
    expect(horizontalScrolls.length).toBe(0);

    const scrollViews = tree!.root.findAll(
      (el: any) => el.props.contentContainerStyle?.padding === 12,
    );
    expect(scrollViews.length).toBeGreaterThan(0);
  });
});
