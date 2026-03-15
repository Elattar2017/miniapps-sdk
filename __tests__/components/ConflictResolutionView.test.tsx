/**
 * ConflictResolutionView Test Suite
 * Tests the manual conflict resolution UI component.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

import { ConflictResolutionView } from '../../src/components/ConflictResolutionView';
import type { SyncConflict } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeConflict(id: string, field?: string): SyncConflict {
  return {
    id,
    local: {
      id: 'entry-1',
      data: { name: 'Local Value' },
      vectorClock: { nodeA: 2 },
      timestamp: 1000,
      nodeId: 'nodeA',
      dirty: true,
    },
    remote: {
      id: 'entry-1',
      data: { name: 'Remote Value' },
      vectorClock: { nodeB: 2 },
      timestamp: 2000,
      nodeId: 'nodeB',
      dirty: false,
    },
    field,
  };
}

describe('ConflictResolutionView', () => {
  it('renders list of conflicts without crashing', () => {
    const conflicts = [makeConflict('c1'), makeConflict('c2')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    const json = tree!.toJSON();
    expect(json).toBeTruthy();
  });

  it('shows local and remote data for each conflict', () => {
    const conflicts = [makeConflict('c1')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    // Find text elements containing Local Value and Remote Value
    const localTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.some(
          (child) => typeof child === 'string' && child.includes('Local Value'),
        );
      },
    );
    const remoteTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.some(
          (child) => typeof child === 'string' && child.includes('Remote Value'),
        );
      },
    );

    expect(localTexts.length).toBeGreaterThan(0);
    expect(remoteTexts.length).toBeGreaterThan(0);
  });

  it('"Use Local" button calls onResolve with (conflictId, "local")', () => {
    const conflicts = [makeConflict('conflict-1')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    // Find the touchable with accessibilityLabel and onPress handler
    const useLocalButtons = tree!.root.findAll(
      (el) =>
        el.props.accessibilityLabel === 'Use local for conflict-1' &&
        typeof el.props.onPress === 'function',
    );
    expect(useLocalButtons.length).toBeGreaterThan(0);

    act(() => {
      useLocalButtons[0].props.onPress();
    });

    expect(onResolve).toHaveBeenCalledWith('conflict-1', 'local');
  });

  it('"Use Remote" button calls onResolve with (conflictId, "remote")', () => {
    const conflicts = [makeConflict('conflict-2')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    const useRemoteButtons = tree!.root.findAll(
      (el) =>
        el.props.accessibilityLabel === 'Use remote for conflict-2' &&
        typeof el.props.onPress === 'function',
    );
    expect(useRemoteButtons.length).toBeGreaterThan(0);

    act(() => {
      useRemoteButtons[0].props.onPress();
    });

    expect(onResolve).toHaveBeenCalledWith('conflict-2', 'remote');
  });

  it('empty conflicts array shows "No conflicts to resolve"', () => {
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts: [], onResolve }),
      );
    });

    const emptyTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.includes('No conflicts to resolve');
      },
    );
    expect(emptyTexts.length).toBeGreaterThan(0);
  });

  it('"Use All Local" button calls onResolveAll("local") when provided', () => {
    const conflicts = [makeConflict('c1'), makeConflict('c2')];
    const onResolve = jest.fn();
    const onResolveAll = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, {
          conflicts,
          onResolve,
          onResolveAll,
        }),
      );
    });

    const useAllLocalButtons = tree!.root.findAll(
      (el) =>
        el.props.accessibilityLabel === 'Use all local' &&
        typeof el.props.onPress === 'function',
    );
    expect(useAllLocalButtons.length).toBeGreaterThan(0);

    act(() => {
      useAllLocalButtons[0].props.onPress();
    });

    expect(onResolveAll).toHaveBeenCalledWith('local');
  });

  it('"Use All Remote" button calls onResolveAll("remote") when provided', () => {
    const conflicts = [makeConflict('c1'), makeConflict('c2')];
    const onResolve = jest.fn();
    const onResolveAll = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, {
          conflicts,
          onResolve,
          onResolveAll,
        }),
      );
    });

    const useAllRemoteButtons = tree!.root.findAll(
      (el) =>
        el.props.accessibilityLabel === 'Use all remote' &&
        typeof el.props.onPress === 'function',
    );
    expect(useAllRemoteButtons.length).toBeGreaterThan(0);

    act(() => {
      useAllRemoteButtons[0].props.onPress();
    });

    expect(onResolveAll).toHaveBeenCalledWith('remote');
  });

  it('conflict with field name displays the field name', () => {
    const conflicts = [makeConflict('c1', 'user.email')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    const fieldTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.includes('Field: user.email');
      },
    );
    expect(fieldTexts.length).toBeGreaterThan(0);
  });

  it('timestamps displayed for local and remote entries', () => {
    const conflicts = [makeConflict('c1')];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    const localTime = new Date(1000).toLocaleString();
    const remoteTime = new Date(2000).toLocaleString();

    const localTimeTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.includes(localTime);
      },
    );
    const remoteTimeTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.includes(remoteTime);
      },
    );

    expect(localTimeTexts.length).toBeGreaterThan(0);
    expect(remoteTimeTexts.length).toBeGreaterThan(0);
  });

  it('multiple conflicts: renders all conflict cards', () => {
    const conflicts = [
      makeConflict('c1', 'field1'),
      makeConflict('c2', 'field2'),
      makeConflict('c3'),
    ];
    const onResolve = jest.fn();
    let tree: ReactTestRenderer;

    act(() => {
      tree = create(
        React.createElement(ConflictResolutionView, { conflicts, onResolve }),
      );
    });

    // Each conflict card has an accessibilityLabel "Conflict {id}"
    const card1 = tree!.root.findAll(
      (el) => el.props.accessibilityLabel === 'Conflict c1',
    );
    const card2 = tree!.root.findAll(
      (el) => el.props.accessibilityLabel === 'Conflict c2',
    );
    const card3 = tree!.root.findAll(
      (el) => el.props.accessibilityLabel === 'Conflict c3',
    );

    expect(card1.length).toBeGreaterThan(0);
    expect(card2.length).toBeGreaterThan(0);
    expect(card3.length).toBeGreaterThan(0);

    // Header should show "3 Conflicts"
    const headerTexts = tree!.root.findAll(
      (el) => {
        if (!el.children || el.children.length === 0) return false;
        return el.children.includes('3 Conflicts');
      },
    );
    expect(headerTexts.length).toBeGreaterThan(0);
  });
});
