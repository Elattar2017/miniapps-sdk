/**
 * NavigationAdapter Real Integration Test Suite
 * Tests RealNavigationManager and createSDKNavigator factory behaviour.
 */

jest.mock('react-native');

import {
  RealNavigationManager,
  createSDKNavigator,
} from '../../src/adapters/NavigationAdapter';
import type { SDKNavigator } from '../../src/adapters/NavigationAdapter';
import type { SDKRoute } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RealNavigationManager', () => {
  let nav: RealNavigationManager;

  beforeEach(() => {
    nav = new RealNavigationManager();
  });

  it('navigate() pushes route to stack', () => {
    const route: SDKRoute = { moduleId: 'mod1', screenId: 'screen1' };
    nav.navigate(route);

    const state = nav.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]).toEqual(route);
    expect(state.currentIndex).toBe(0);
    expect(state.activeModuleId).toBe('mod1');
  });

  it('goBack() pops route and returns true', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });

    const result = nav.goBack();
    expect(result).toBe(true);

    const state = nav.getState();
    expect(state.routes).toHaveLength(1);
    expect(state.currentIndex).toBe(0);
    expect(state.activeModuleId).toBe('mod1');
  });

  it('goBack() at root returns false', () => {
    const result = nav.goBack();
    expect(result).toBe(false);
  });

  it('goBack() with single route returns false', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    const result = nav.goBack();
    expect(result).toBe(false);

    const state = nav.getState();
    expect(state.routes).toHaveLength(1);
  });

  it('reset() clears stack and notifies listeners', () => {
    const listener = jest.fn();
    nav.addListener(listener);

    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });
    listener.mockClear();

    nav.reset();

    const state = nav.getState();
    expect(state.routes).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeModuleId).toBeUndefined();
    // reset() should notify listeners about the state change
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      routes: [],
      currentIndex: -1,
    }));
  });

  it('getCurrentRoute() returns top of stack', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });

    const route = nav.getCurrentRoute();
    expect(route).toEqual({ moduleId: 'mod1', screenId: 'screen2' });
  });

  it('getCurrentRoute() returns undefined on empty stack', () => {
    const route = nav.getCurrentRoute();
    expect(route).toBeUndefined();
  });

  it('canGoBack() returns true when stack has more than one route', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod1', screenId: 'screen2' });

    expect(nav.canGoBack()).toBe(true);
  });

  it('canGoBack() returns false when stack has one or fewer routes', () => {
    expect(nav.canGoBack()).toBe(false);

    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    expect(nav.canGoBack()).toBe(false);
  });

  it('getState() returns correct routes and currentIndex', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 's1' });
    nav.navigate({ moduleId: 'mod2', screenId: 's2' });
    nav.navigate({ moduleId: 'mod3', screenId: 's3' });

    const state = nav.getState();
    expect(state.routes).toHaveLength(3);
    expect(state.currentIndex).toBe(2);
    expect(state.activeModuleId).toBe('mod3');
    expect(state.routes[0]).toEqual({ moduleId: 'mod1', screenId: 's1' });
    expect(state.routes[1]).toEqual({ moduleId: 'mod2', screenId: 's2' });
    expect(state.routes[2]).toEqual({ moduleId: 'mod3', screenId: 's3' });
  });

  it('navigate() with params: params accessible on route', () => {
    const route: SDKRoute = {
      moduleId: 'mod1',
      screenId: 'detail',
      params: { itemId: '42', showHeader: true },
    };
    nav.navigate(route);

    const current = nav.getCurrentRoute();
    expect(current?.params).toEqual({ itemId: '42', showHeader: true });
  });

  it('navigate() with transition: transition stored on route', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'detail', transition: 'fade' });
    expect(nav.getCurrentRoute()?.transition).toBe('fade');
  });

  it('navigate() with transition + params: both stored on route', () => {
    nav.navigate({
      moduleId: 'mod1',
      screenId: 'detail',
      params: { id: '1' },
      transition: 'modal',
    });
    const route = nav.getCurrentRoute();
    expect(route?.transition).toBe('modal');
    expect(route?.params).toEqual({ id: '1' });
  });

  it('dispose() clears stack completely', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 'screen1' });
    nav.navigate({ moduleId: 'mod2', screenId: 'screen2' });

    const listener = jest.fn();
    nav.addListener(listener);

    nav.dispose();

    const state = nav.getState();
    expect(state.routes).toEqual([]);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeModuleId).toBeUndefined();

    // Listeners should be cleared; navigating after dispose should not call old listener
    listener.mockClear();
    nav.navigate({ moduleId: 'mod3', screenId: 'screen3' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple navigate + goBack: stack integrity maintained', () => {
    nav.navigate({ moduleId: 'mod1', screenId: 's1' });
    nav.navigate({ moduleId: 'mod1', screenId: 's2' });
    nav.navigate({ moduleId: 'mod1', screenId: 's3' });

    expect(nav.getState().routes).toHaveLength(3);

    // Go back twice
    expect(nav.goBack()).toBe(true);
    expect(nav.goBack()).toBe(true);

    // Should be back at s1
    expect(nav.getCurrentRoute()).toEqual({ moduleId: 'mod1', screenId: 's1' });
    expect(nav.getState().routes).toHaveLength(1);

    // Cannot go back further
    expect(nav.goBack()).toBe(false);

    // Navigate again
    nav.navigate({ moduleId: 'mod2', screenId: 's4' });
    expect(nav.getState().routes).toHaveLength(2);
    expect(nav.getCurrentRoute()).toEqual({ moduleId: 'mod2', screenId: 's4' });
  });

  it('addListener() is called on navigate and goBack', () => {
    const listener = jest.fn();
    nav.addListener(listener);

    nav.navigate({ moduleId: 'mod1', screenId: 's1' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      routes: [{ moduleId: 'mod1', screenId: 's1' }],
      currentIndex: 0,
      activeModuleId: 'mod1',
    }));

    nav.navigate({ moduleId: 'mod1', screenId: 's2' });
    expect(listener).toHaveBeenCalledTimes(2);

    nav.goBack();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('unsubscribe from addListener() stops notifications', () => {
    const listener = jest.fn();
    const unsubscribe = nav.addListener(listener);

    nav.navigate({ moduleId: 'mod1', screenId: 's1' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    nav.navigate({ moduleId: 'mod1', screenId: 's2' });
    expect(listener).toHaveBeenCalledTimes(1); // Still only 1 call
  });
});

describe('createSDKNavigator factory', () => {
  it('returns a valid SDKNavigator object', () => {
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
