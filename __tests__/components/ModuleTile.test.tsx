/**
 * ModuleTile Test Suite
 * Tests the module tile component used in ActionZone to display module icons and names.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

import { ModuleTile } from '../../src/components/ModuleTile';
import type { ModuleSummary } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeSummary(overrides?: Partial<ModuleSummary>): ModuleSummary {
  return {
    id: 'mod1',
    name: 'Test Module',
    icon: 'https://example.com/icon.png',
    category: 'finance',
    version: '1.0.0',
    description: 'A test module',
    ...overrides,
  };
}

describe('ModuleTile', () => {
  it('renders module name', () => {
    const mod = makeSummary({ name: 'Budget Tracker' });
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    const nameElements = tree!.root.findAll(
      (el: any) => el.children?.includes('Budget Tracker'),
    );
    expect(nameElements.length).toBeGreaterThan(0);
  });

  it('renders icon image when module has icon URL', () => {
    const mod = makeSummary({ icon: 'https://example.com/my-icon.png' });
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    // Find Image element with the icon source
    const images = tree!.root.findAll(
      (el: any) => el.props.source?.uri === 'https://example.com/my-icon.png',
    );
    expect(images.length).toBeGreaterThan(0);
  });

  it('renders fallback letter when no icon', () => {
    const mod = makeSummary({ icon: '', name: 'Budget' });
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    // Should show first letter 'B' as fallback
    const letters = tree!.root.findAll(
      (el: any) => el.children?.includes('B'),
    );
    expect(letters.length).toBeGreaterThan(0);

    // Should NOT have an Image element with uri
    const images = tree!.root.findAll(
      (el: any) => el.props.source?.uri !== undefined,
    );
    expect(images.length).toBe(0);
  });

  it('fallback background color varies by name', () => {
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

    // Two names with different lengths should get different colors
    const mod1 = makeSummary({ icon: '', name: 'AB' });    // length 2 => colors[2]
    const mod2 = makeSummary({ icon: '', name: 'ABCDE' }); // length 5 => colors[5]
    const onPress = jest.fn();

    let tree1: ReactTestRenderer;
    let tree2: ReactTestRenderer;

    act(() => {
      tree1 = create(React.createElement(ModuleTile, { module: mod1, onPress }));
    });
    act(() => {
      tree2 = create(React.createElement(ModuleTile, { module: mod2, onPress }));
    });

    const fallback1 = tree1!.root.findAll(
      (el: any) => el.props.style?.backgroundColor === colors[2],
    );
    const fallback2 = tree2!.root.findAll(
      (el: any) => el.props.style?.backgroundColor === colors[5],
    );
    expect(fallback1.length).toBeGreaterThan(0);
    expect(fallback2.length).toBeGreaterThan(0);
  });

  it('onPress callback fires on tap', () => {
    const mod = makeSummary();
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    // Find the touchable element with onPress
    const touchables = tree!.root.findAll(
      (el: any) => typeof el.props.onPress === 'function',
    );
    expect(touchables.length).toBeGreaterThan(0);

    act(() => {
      touchables[0].props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders with correct container styles', () => {
    const mod = makeSummary();
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    // The outermost touchable should have alignItems, width, paddingVertical
    const touchables = tree!.root.findAll(
      (el: any) =>
        el.props.style?.alignItems === 'center' &&
        el.props.style?.width === 80 &&
        el.props.style?.paddingVertical === 8,
    );
    expect(touchables.length).toBeGreaterThan(0);
  });

  it('renders name text with correct styles', () => {
    const mod = makeSummary({ name: 'Reports' });
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    // Find the text element for the module name
    const nameTexts = tree!.root.findAll(
      (el: any) =>
        el.props.style?.fontSize === 11 &&
        el.props.style?.color === '#374151' &&
        el.props.numberOfLines === 1,
    );
    expect(nameTexts.length).toBeGreaterThan(0);
  });

  it('icon image has correct dimensions and borderRadius', () => {
    const mod = makeSummary({ icon: 'https://example.com/icon.png' });
    const onPress = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(React.createElement(ModuleTile, { module: mod, onPress }));
    });

    const images = tree!.root.findAll(
      (el: any) =>
        el.props.style?.width === 48 &&
        el.props.style?.height === 48 &&
        el.props.style?.borderRadius === 12,
    );
    expect(images.length).toBeGreaterThan(0);
  });
});
