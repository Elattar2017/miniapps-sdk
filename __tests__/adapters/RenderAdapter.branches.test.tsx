/**
 * RenderAdapter Branch Coverage Test Suite
 * Tests untested branches: SDKImage, SDKScrollView, SDKFlatList,
 * initializeRenderAdapter, and component prop variants.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

import {
  SDKImage,
  SDKScrollView,
  SDKFlatList,
  initializeRenderAdapter,
} from '../../src/adapters/RenderAdapter';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RenderAdapter - SDKImage', () => {
  it('should render without crashing', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(SDKImage, {
          source: { uri: 'https://example.com/image.png' },
        } as any),
      );
    });
    expect(tree!.toJSON()).toBeTruthy();
  });

  it('should render with source prop set', () => {
    let tree: ReactTestRenderer;
    const source = { uri: 'https://example.com/photo.jpg' };
    act(() => {
      tree = create(
        React.createElement(SDKImage, { source } as any),
      );
    });
    const root = tree!.root;
    const imageEl = root.findAll(
      (el: any) => el.props.source?.uri === 'https://example.com/photo.jpg',
    );
    expect(imageEl.length).toBeGreaterThan(0);
  });
});

describe('RenderAdapter - SDKScrollView', () => {
  it('should render with children', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          SDKScrollView,
          null,
          React.createElement('View', null, 'scroll-child'),
        ),
      );
    });
    const found = tree!.root.findAll(
      (el: any) => el.children?.includes('scroll-child'),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it('should render with horizontal prop', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          SDKScrollView,
          { horizontal: true },
          React.createElement('View', null, 'horizontal-content'),
        ),
      );
    });
    const scrollEl = tree!.root.findAll(
      (el: any) => el.props.horizontal === true,
    );
    expect(scrollEl.length).toBeGreaterThan(0);
  });
});

describe('RenderAdapter - SDKFlatList', () => {
  it('should render with data and renderItem', () => {
    const data = [{ key: '1', label: 'Item A' }, { key: '2', label: 'Item B' }];
    const renderItem = ({ item }: { item: { key: string; label: string } }) =>
      React.createElement('View', { key: item.key }, item.label);

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(SDKFlatList, {
          data,
          renderItem,
        } as any),
      );
    });
    expect(tree!.toJSON()).toBeTruthy();
  });
});

describe('RenderAdapter - initializeRenderAdapter', () => {
  it('should run without error', () => {
    expect(() => initializeRenderAdapter()).not.toThrow();
  });

  it('should be idempotent (second call is safe)', () => {
    expect(() => {
      initializeRenderAdapter();
      initializeRenderAdapter();
    }).not.toThrow();
  });
});
