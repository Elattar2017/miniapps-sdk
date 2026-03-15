/**
 * NavigationAdapter Test Suite
 * Tests StubNavigationManager, SDKNavigationContainer, and factory functions.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// We test the real implementation rather than the mock
import {
  createSDKNavigator,
  SDKNavigationContainer,
  isNavigationAvailable,
  StubNavigationManager,
} from '../../src/adapters/NavigationAdapter';
import type { SDKNavigator } from '../../src/adapters/NavigationAdapter';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('StubNavigationManager', () => {
  let nav: StubNavigationManager;

  beforeEach(() => {
    nav = new StubNavigationManager();
  });

  it('starts with empty state', () => {
    const state = nav.getState();
    expect(state.routes).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeModuleId).toBeUndefined();
  });

  it('navigate() pushes route, updates currentIndex and activeModuleId', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    const state = nav.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]).toEqual({ moduleId: 'mod1', screenId: 'screen1' });
    expect(state.currentIndex).toBe(0);
    expect(state.activeModuleId).toBe('mod1');
  });

  it('navigate() to same module/screen jumps to existing route (no duplicate)', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });

    const state = nav.getState();
    // Should jump back to index 0 without adding a duplicate
    expect(state.routes).toHaveLength(2);
    expect(state.currentIndex).toBe(0);
    expect(state.activeModuleId).toBe('mod1');
  });

  it('goBack() decrements index and returns true', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });

    const result = nav.goBack();
    expect(result).toBe(true);

    const state = nav.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.activeModuleId).toBe('mod1');
  });

  it('goBack() at root returns false', () => {
    const result = nav.goBack();
    expect(result).toBe(false);
  });

  it('goBack() at index 0 returns false', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    const result = nav.goBack();
    expect(result).toBe(false);
  });

  it('reset() clears all routes', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });
    nav.reset();

    const state = nav.getState();
    expect(state.routes).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeModuleId).toBeUndefined();
  });

  it('getCurrentRoute() returns current route', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });

    const route = nav.getCurrentRoute();
    expect(route).toEqual({ moduleId: 'mod1', screenId: 'screen2' });
  });

  it('getCurrentRoute() returns undefined when no routes', () => {
    const route = nav.getCurrentRoute();
    expect(route).toBeUndefined();
  });

  it('addListener() listener is called on state changes', () => {
    const listener = jest.fn();
    nav.addListener(listener);

    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      routes: [{ moduleId: 'mod1', screenId: 'screen1' }],
      currentIndex: 0,
      activeModuleId: 'mod1',
    }));
  });

  it('unsubscribe from addListener() stops notifications', () => {
    const listener = jest.fn();
    const unsubscribe = nav.addListener(listener);

    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });
    expect(listener).toHaveBeenCalledTimes(1); // Still only 1 call
  });

  it('dispose() clears state and removes listeners', () => {
    const listener = jest.fn();
    nav.addListener(listener);
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });

    listener.mockClear();
    nav.dispose();

    const state = nav.getState();
    expect(state.routes).toEqual([]);
    expect(state.currentIndex).toBe(-1);

    // After dispose, listeners should be cleared
    nav.navigate({ moduleId: 'mod2', screenId: 'screen1' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('getState() returns a snapshot (not a reference)', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    const state1 = nav.getState();
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });
    const state2 = nav.getState();

    // state1 should not be mutated
    expect(state1.routes).toHaveLength(1);
    expect(state2.routes).toHaveLength(2);
  });

  it('multiple navigations build correct history', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 's1' });
    nav.navigate({ moduleId: 'mod1', screenId: 's2' });
    nav.navigate({ moduleId: 'mod2', screenId: 's1' });

    const state = nav.getState();
    expect(state.routes).toHaveLength(3);
    expect(state.currentIndex).toBe(2);
    expect(state.activeModuleId).toBe('mod2');
  });

  it('listener receives state on reset', () => {
    const listener = jest.fn();
    nav.addListener(listener);
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });

    listener.mockClear();
    nav.reset();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      routes: [],
      currentIndex: -1,
      activeModuleId: undefined,
    }));
  });

  // ---- Transition support ----

  it('navigate() stores transition in the route', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1', transition: 'fade' });
    const route = nav.getCurrentRoute();
    expect(route?.transition).toBe('fade');
  });

  it('navigate() defaults transition to undefined when not specified', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    const route = nav.getCurrentRoute();
    expect(route?.transition).toBeUndefined();
  });

  it('navigate() preserves different transitions across stack entries', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 's1', transition: 'slide' });
    nav.navigate({ moduleId: 'mod1', screenId: 's2', transition: 'modal' });
    nav.navigate({ moduleId: 'mod1', screenId: 's3', transition: 'none' });

    const state = nav.getState();
    expect(state.routes[0].transition).toBe('slide');
    expect(state.routes[1].transition).toBe('modal');
    expect(state.routes[2].transition).toBe('none');
  });
});

describe('createSDKNavigator', () => {
  it('returns a valid navigator object', () => {
    const navigator: SDKNavigator = createSDKNavigator();
    expect(navigator).toBeDefined();
    expect(typeof navigator.navigate).toBe('function');
    expect(typeof navigator.goBack).toBe('function');
    expect(typeof navigator.reset).toBe('function');
    expect(typeof navigator.getState).toBe('function');
    expect(typeof navigator.getCurrentRoute).toBe('function');
    expect(typeof navigator.addListener).toBe('function');
    expect(typeof navigator.dispose).toBe('function');
  });
});

describe('isNavigationAvailable', () => {
  it('returns a boolean', () => {
    const result = isNavigationAvailable();
    expect(typeof result).toBe('boolean');
  });
});

describe('SDKNavigationContainer', () => {
  it('renders children', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          SDKNavigationContainer,
          null,
          React.createElement('View', null, 'child-content'),
        ),
      );
    });

    const json = tree!.toJSON();
    expect(json).toBeTruthy();
    const found = tree!.root.findAll((el: any) => el.children?.includes('child-content'));
    expect(found.length).toBeGreaterThan(0);
  });

  it('has correct displayName', () => {
    expect(SDKNavigationContainer.displayName).toBe('SDKNavigationContainer');
  });
});
