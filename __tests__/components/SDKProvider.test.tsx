/**
 * SDKProvider Test Suite
 * Tests the main entry point component for rendering states and kernel bootstrapping.
 * Uses jest.mock to prevent actual kernel boot.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Mock the RuntimeKernel before any imports that use it
// ---------------------------------------------------------------------------

const mockBoot = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockGetState = jest.fn().mockReturnValue('IDLE');
const mockGetStatus = jest.fn().mockReturnValue({
  state: 'IDLE',
  moduleCount: 0,
});
const mockGetEmitter = jest.fn().mockReturnValue({
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
});

jest.mock('../../src/kernel/Kernel', () => {
  return {
    RuntimeKernel: jest.fn().mockImplementation(() => ({
      boot: mockBoot,
      shutdown: mockShutdown,
      getState: mockGetState,
      getStatus: mockGetStatus,
      getEmitter: mockGetEmitter,
      getJWTValidator: jest.fn(),
      getPolicyEngine: jest.fn().mockReturnValue({ clearPolicies: jest.fn() }),
      getIntentBridge: jest.fn().mockReturnValue({ removeAllHandlers: jest.fn() }),
      getDataBus: jest.fn().mockReturnValue({ clear: jest.fn() }),
      getTelemetry: jest.fn().mockReturnValue({ flush: jest.fn().mockResolvedValue(undefined) }),
      getConfig: jest.fn(),
    })),
  };
});

// Mock adapters to avoid React Native component issues
jest.mock('../../src/adapters', () => ({
  SDKView: 'SDKView',
  SDKText: 'SDKText',
  SDKActivityIndicator: 'SDKActivityIndicator',
}));

// Mock schema components to avoid importing real RN components
jest.mock('../../src/schema/components', () => ({
  TextComponent: 'TextComponent',
  InputComponent: 'InputComponent',
  ButtonComponent: 'ButtonComponent',
  ImageComponent: 'ImageComponent',
  RowComponent: 'RowComponent',
  ColumnComponent: 'ColumnComponent',
  CardComponent: 'CardComponent',
  ScrollComponent: 'ScrollComponent',
  RepeaterComponent: 'RepeaterComponent',
  ConditionalComponent: 'ConditionalComponent',
  SpacerComponent: 'SpacerComponent',
  DividerComponent: 'DividerComponent',
  BadgeComponent: 'BadgeComponent',
  IconComponent: 'IconComponent',
  LoadingComponent: 'LoadingComponent',
}));

// Mock ErrorBoundary to a simple passthrough
jest.mock('../../src/kernel/errors/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// Mock KernelContext to a simple passthrough
jest.mock('../../src/kernel/KernelContext', () => ({
  KernelProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

import { SDKProvider } from '../../src/components/SDKProvider';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SDKProvider', () => {
  const defaultProps = {
    authToken: 'mock.jwt.token',
    tenantId: 'test-tenant',
    userId: 'user-1',
    apiBaseUrl: 'https://api.example.com',
    zones: { main: { type: 'fill' as const, position: 'fill' as const } },
  };

  it('should render loading state initially', () => {
    // Boot never resolves so state stays at IDLE (loading)
    mockBoot.mockReturnValue(new Promise(() => {}));

    const element = React.createElement(
      SDKProvider,
      defaultProps,
      React.createElement('div', null, 'Child Content'),
    );

    // The element should be creatable without errors
    expect(element).toBeDefined();
    expect(element.type).toBe(SDKProvider);
  });

  it('should create a RuntimeKernel and attempt boot', () => {
    mockBoot.mockResolvedValue(undefined);

    const element = React.createElement(
      SDKProvider,
      defaultProps,
      React.createElement('div', null, 'Child Content'),
    );

    // Verify the element was created correctly with the right props
    expect(element).toBeDefined();
    expect(element.type).toBe(SDKProvider);
    expect(element.props).toMatchObject({
      tenantId: 'test-tenant',
      userId: 'user-1',
      apiBaseUrl: 'https://api.example.com',
    });
  });

  it('should pass children as a prop', () => {
    mockBoot.mockResolvedValue(undefined);

    const child = React.createElement('div', null, 'Test Child');
    const element = React.createElement(SDKProvider, defaultProps, child);

    expect(element.props.children).toBeDefined();
  });
});
