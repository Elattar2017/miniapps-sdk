/**
 * NavigationAdapter - Native Bridge Stability Layer for React Navigation
 *
 * Wraps React Navigation v7+ behind a stable interface.
 * Uses NavigationIndependentTree to prevent conflicts with host app navigation.
 *
 * Phase 1: Exports stubs that work without React Navigation installed,
 * since we operate in a library context where the host app owns the dependency.
 *
 * @module adapters/NavigationAdapter
 */

import React from 'react';
import { logger } from '../utils/logger';
import type { SDKRoute, SDKNavigationState } from '../types';

const navLogger = logger.child({ component: 'NavigationAdapter' });

// ---------------------------------------------------------------------------
// Navigation availability detection
// ---------------------------------------------------------------------------

interface ReactNavigationNative {
  NavigationContainer: React.ComponentType<Record<string, unknown>>;
  useNavigation: () => unknown;
  useRoute: () => unknown;
}

interface ReactNavigationNativeStack {
  createNativeStackNavigator: () => {
    Navigator: React.ComponentType<Record<string, unknown>>;
    Screen: React.ComponentType<Record<string, unknown>>;
  };
}

interface NavigationIndependentTreeModule {
  NavigationIndependentTree: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Attempt to resolve React Navigation at runtime.
 * Returns null if the package is not available.
 */
function tryRequireNavigation(): ReactNavigationNative | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-navigation/native') as ReactNavigationNative;
  } catch {
    return null;
  }
}

function tryRequireNativeStack(): ReactNavigationNativeStack | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-navigation/native-stack') as ReactNavigationNativeStack;
  } catch {
    return null;
  }
}

function tryRequireIndependentTree(): NavigationIndependentTreeModule | null {
  try {
    // In React Navigation v7, NavigationIndependentTree may be in @react-navigation/native
    const nav = tryRequireNavigation();
    if (nav && 'NavigationIndependentTree' in nav) {
      return nav as unknown as NavigationIndependentTreeModule;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stub navigation state manager (Phase 1 fallback)
// ---------------------------------------------------------------------------

type NavigationListener = (state: SDKNavigationState) => void;

class StubNavigationManager {
  private state: SDKNavigationState;
  private listeners: Set<NavigationListener> = new Set();

  constructor() {
    this.state = {
      routes: [],
      currentIndex: -1,
      activeModuleId: undefined,
    };
  }

  getState(): SDKNavigationState {
    return { ...this.state };
  }

  navigate(route: SDKRoute): void {
    const existingIndex = this.state.routes.findIndex(
      (r) => r.moduleId === route.moduleId && r.screenId === route.screenId,
    );

    if (existingIndex >= 0) {
      this.state = {
        ...this.state,
        currentIndex: existingIndex,
        activeModuleId: route.moduleId,
      };
    } else {
      const newRoutes = [...this.state.routes, route];
      this.state = {
        routes: newRoutes,
        currentIndex: newRoutes.length - 1,
        activeModuleId: route.moduleId,
      };
    }

    this.notifyListeners();
    navLogger.debug('Stub navigator: navigate', {
      moduleId: route.moduleId,
      screenId: route.screenId,
      transition: route.transition,
    });
  }

  goBack(): boolean {
    if (this.state.currentIndex <= 0) {
      navLogger.debug('Stub navigator: cannot go back, at root');
      return false;
    }

    const newIndex = this.state.currentIndex - 1;
    // Pop routes after current position (same behavior as RealNavigationManager)
    const trimmedRoutes = this.state.routes.slice(0, newIndex + 1);
    const previousRoute = trimmedRoutes[newIndex];
    this.state = {
      routes: trimmedRoutes,
      currentIndex: newIndex,
      activeModuleId: previousRoute?.moduleId,
    };

    this.notifyListeners();
    navLogger.debug('Stub navigator: go back', {
      currentIndex: newIndex,
    });
    return true;
  }

  canGoBack(): boolean {
    return this.state.currentIndex > 0;
  }

  reset(): void {
    this.state = {
      routes: [],
      currentIndex: -1,
      activeModuleId: undefined,
    };
    this.notifyListeners();
    navLogger.debug('Stub navigator: reset');
  }

  getCurrentRoute(): SDKRoute | undefined {
    if (this.state.currentIndex < 0 || this.state.currentIndex >= this.state.routes.length) {
      return undefined;
    }
    return this.state.routes[this.state.currentIndex];
  }

  addListener(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.state = { routes: [], currentIndex: -1 };
  }

  private notifyListeners(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * SDK navigation result. In Phase 1 this wraps the stub navigator.
 * When React Navigation is available, it wraps a real stack navigator.
 */
export interface SDKNavigator {
  navigate(route: SDKRoute): void;
  goBack(): boolean;
  canGoBack(): boolean;
  reset(): void;
  getState(): SDKNavigationState;
  getCurrentRoute(): SDKRoute | undefined;
  addListener(listener: NavigationListener): () => void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Real navigation state manager (used when React Navigation is detected)
// ---------------------------------------------------------------------------

/**
 * RealNavigationManager - Stack-based navigator implementation used when
 * React Navigation is available at runtime.
 *
 * Manages a simple stack of SDKRoute entries and notifies listeners on
 * every state change, mirroring the SDKNavigator contract.
 */
class RealNavigationManager implements SDKNavigator {
  private stack: SDKRoute[] = [];
  private listeners: Set<NavigationListener> = new Set();

  navigate(route: SDKRoute): void {
    this.stack.push(route);
    this.notifyListeners();
    navLogger.info('Navigate', {
      moduleId: route.moduleId,
      screenId: route.screenId,
      transition: route.transition ?? 'slide',
    });
  }

  goBack(): boolean {
    if (this.stack.length <= 1) {
      navLogger.debug('Cannot go back, at root');
      return false;
    }
    this.stack.pop();
    this.notifyListeners();
    navLogger.debug('Navigated back', { currentScreen: this.getCurrentRoute()?.screenId });
    return true;
  }

  reset(): void {
    this.stack = [];
    this.notifyListeners();
    navLogger.info('Navigation reset');
  }

  getState(): SDKNavigationState {
    return {
      routes: [...this.stack],
      currentIndex: this.stack.length > 0 ? this.stack.length - 1 : -1,
      activeModuleId: this.stack.length > 0 ? this.stack[this.stack.length - 1].moduleId : undefined,
    };
  }

  getCurrentRoute(): SDKRoute | undefined {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined;
  }

  canGoBack(): boolean {
    return this.stack.length > 1;
  }

  addListener(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.stack = [];
    this.listeners.clear();
    navLogger.debug('Navigator disposed');
  }

  private notifyListeners(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/**
 * Creates an SDK navigator instance.
 * Always returns a new instance to prevent shared state across callers.
 * If React Navigation is installed, returns a RealNavigationManager
 * with full stack-based navigation.
 * Otherwise returns a new StubNavigationManager for fallback.
 */
function createSDKNavigator(): SDKNavigator {
  const navigation = tryRequireNavigation();
  tryRequireNativeStack();

  if (!navigation) {
    navLogger.info(
      'React Navigation not available. Using stub navigator. ' +
      'Install @react-navigation/native and @react-navigation/native-stack for full navigation.',
    );
    return new StubNavigationManager();
  }

  navLogger.info('React Navigation detected. Using real navigator.');
  return new RealNavigationManager();
}

/**
 * Props for the SDKNavigationContainer component.
 */
interface SDKNavigationContainerProps {
  children: React.ReactNode;
  onStateChange?: (state: SDKNavigationState) => void;
}

/**
 * SDKNavigationContainer wraps children in NavigationIndependentTree
 * (if React Navigation v7+ is available) to prevent collisions with
 * the host app's NavigationContainer.
 *
 * Phase 1 fallback: renders children directly if React Navigation
 * is not installed.
 */
function SDKNavigationContainer(props: SDKNavigationContainerProps): React.ReactElement {
  const { children, onStateChange: _onStateChange } = props;

  const independentTreeModule = tryRequireIndependentTree();
  const navigation = tryRequireNavigation();

  // If NavigationIndependentTree is available, wrap children
  if (independentTreeModule && navigation) {
    navLogger.debug('Rendering with NavigationIndependentTree');

    return React.createElement(
      independentTreeModule.NavigationIndependentTree,
      null,
      React.createElement(
        navigation.NavigationContainer,
        {},
        children,
      ),
    );
  }

  // Phase 1 fallback: render children directly
  navLogger.debug('Rendering without NavigationIndependentTree (stub mode)');
  return React.createElement(React.Fragment, null, children);
}

SDKNavigationContainer.displayName = 'SDKNavigationContainer';

/**
 * Check if real React Navigation is available in the runtime.
 */
function isNavigationAvailable(): boolean {
  return tryRequireNavigation() !== null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  createSDKNavigator,
  SDKNavigationContainer,
  isNavigationAvailable,
  StubNavigationManager,
  RealNavigationManager,
};

export type {
  SDKNavigationContainerProps,
  NavigationListener,
};
