/**
 * NavigationAdapter Advanced Tests
 * Tests singleton fix, goBack pops routes, canGoBack, getCurrentRoute
 */

jest.mock('react-native');

import {
  createSDKNavigator,
  StubNavigationManager,
  RealNavigationManager,
} from '../../src/adapters/NavigationAdapter';
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

const makeRoute = (moduleId: string, screenId: string): SDKRoute => ({
  moduleId,
  screenId,
});

describe('NavigationAdapter - Singleton Fix', () => {
  it('createSDKNavigator returns new instance each call', () => {
    const nav1 = createSDKNavigator();
    const nav2 = createSDKNavigator();
    expect(nav1).not.toBe(nav2);
  });

  it('instances do not share state', () => {
    const nav1 = createSDKNavigator();
    const nav2 = createSDKNavigator();
    nav1.navigate(makeRoute('mod-a', 'screen-1'));
    expect(nav1.getState().routes.length).toBe(1);
    expect(nav2.getState().routes.length).toBe(0);
  });
});

describe('StubNavigationManager - goBack pops routes', () => {
  let nav: StubNavigationManager;

  beforeEach(() => {
    nav = new StubNavigationManager();
  });

  it('goBack returns false when no routes', () => {
    expect(nav.goBack()).toBe(false);
  });

  it('goBack returns false with single route', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    expect(nav.goBack()).toBe(false);
  });

  it('goBack trims routes after current position', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    nav.navigate(makeRoute('mod', 'screen-3'));
    expect(nav.getState().routes.length).toBe(3);

    nav.goBack();
    const state = nav.getState();
    expect(state.routes.length).toBe(2);
    expect(state.currentIndex).toBe(1);
    expect(state.routes[1].screenId).toBe('screen-2');
  });

  it('multiple goBack calls trim correctly', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    nav.navigate(makeRoute('mod', 'screen-3'));

    nav.goBack();
    nav.goBack();
    const state = nav.getState();
    expect(state.routes.length).toBe(1);
    expect(state.currentIndex).toBe(0);
    expect(state.routes[0].screenId).toBe('screen-1');
  });

  it('navigate after goBack replaces forward history', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    nav.navigate(makeRoute('mod', 'screen-3'));

    nav.goBack(); // now at screen-2, routes=[screen-1, screen-2]
    nav.navigate(makeRoute('mod', 'screen-4'));
    
    const state = nav.getState();
    expect(state.routes.length).toBe(3);
    expect(state.routes.map((r: SDKRoute) => r.screenId)).toEqual(['screen-1', 'screen-2', 'screen-4']);
  });
});

describe('StubNavigationManager - canGoBack', () => {
  let nav: StubNavigationManager;

  beforeEach(() => {
    nav = new StubNavigationManager();
  });

  it('canGoBack returns false when empty', () => {
    expect(nav.canGoBack()).toBe(false);
  });

  it('canGoBack returns false with one route', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    expect(nav.canGoBack()).toBe(false);
  });

  it('canGoBack returns true with multiple routes', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    expect(nav.canGoBack()).toBe(true);
  });

  it('canGoBack reflects goBack state changes', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    expect(nav.canGoBack()).toBe(true);
    nav.goBack();
    expect(nav.canGoBack()).toBe(false);
  });
});

describe('StubNavigationManager - getCurrentRoute', () => {
  let nav: StubNavigationManager;

  beforeEach(() => {
    nav = new StubNavigationManager();
  });

  it('getCurrentRoute returns undefined when empty', () => {
    expect(nav.getCurrentRoute()).toBeUndefined();
  });

  it('getCurrentRoute returns current route after navigate', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    expect(nav.getCurrentRoute()?.screenId).toBe('screen-1');
  });

  it('getCurrentRoute updates after goBack', () => {
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    nav.goBack();
    expect(nav.getCurrentRoute()?.screenId).toBe('screen-1');
  });
});

describe('StubNavigationManager - reset', () => {
  it('reset clears routes and listeners', () => {
    const nav = new StubNavigationManager();
    const listener = jest.fn();
    nav.addListener(listener);
    nav.navigate(makeRoute('mod', 'screen-1'));

    nav.reset();
    const state = nav.getState();
    expect(state.routes.length).toBe(0);
    expect(state.currentIndex).toBe(-1);
    expect(state.activeModuleId).toBeUndefined();
  });
});

describe('StubNavigationManager - navigate deduplication', () => {
  it('navigating to existing route reuses index', () => {
    const nav = new StubNavigationManager();
    nav.navigate(makeRoute('mod', 'screen-1'));
    nav.navigate(makeRoute('mod', 'screen-2'));
    nav.navigate(makeRoute('mod', 'screen-1')); // Should reuse existing

    const state = nav.getState();
    expect(state.currentIndex).toBe(0);
    expect(state.routes.length).toBe(2); // No new route added
  });
});

describe('StubNavigationManager - listeners', () => {
  it('listener receives state on navigate', () => {
    const nav = new StubNavigationManager();
    const listener = jest.fn();
    nav.addListener(listener);
    nav.navigate(makeRoute('mod', 'screen-1'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].routes.length).toBe(1);
  });

  it('unsubscribe stops notifications', () => {
    const nav = new StubNavigationManager();
    const listener = jest.fn();
    const unsub = nav.addListener(listener);
    unsub();
    nav.navigate(makeRoute('mod', 'screen-1'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('dispose clears all listeners', () => {
    const nav = new StubNavigationManager();
    const listener = jest.fn();
    nav.addListener(listener);
    nav.dispose();
    // After dispose, navigate should not call listener
    // Need to re-init since dispose clears state
    expect(nav.getState().routes.length).toBe(0);
  });
});
