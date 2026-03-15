/**
 * ErrorBoundary Test Suite
 * Tests the React error boundary component for catching render errors,
 * displaying fallback UI, logging errors, and invoking onError callbacks.
 */

import React from 'react';
import { create, act, ReactTestRenderer } from 'react-test-renderer';

jest.mock('react-native');

// Mock the logger to suppress output and enable spy assertions
jest.mock('../../src/utils/logger', () => {
  const mockLogInstance = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  // child() returns the same mock instance for easy spying
  mockLogInstance.child.mockReturnValue(mockLogInstance);
  return {
    logger: mockLogInstance,
  };
});

import { ErrorBoundary } from '../../src/kernel/errors/ErrorBoundary';
import { logger } from '../../src/utils/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A component that throws during render */
function ThrowingComponent({ error }: { error: Error | string }): React.ReactElement {
  if (typeof error === 'string') {
    throw new Error(error);
  }
  throw error;
}

/** A component that renders normally */
function GoodComponent({ text }: { text: string }): React.ReactElement {
  return React.createElement('Text', null, text);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(GoodComponent, { text: 'Hello World' }),
        ),
      );
    });

    const json = tree!.toJSON();
    expect(json).toBeTruthy();
    const textNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Hello World'),
    );
    expect(textNodes.length).toBeGreaterThan(0);
  });

  it('renders custom fallback element when child throws', () => {
    const fallback = React.createElement('Text', null, 'Something went wrong');

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          { fallback },
          React.createElement(ThrowingComponent, { error: 'Render failure' }),
        ),
      );
    });

    const fallbackNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Something went wrong'),
    );
    expect(fallbackNodes.length).toBeGreaterThan(0);
  });

  it('renders null when child throws and no fallback provided', () => {
    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          {},
          React.createElement(ThrowingComponent, { error: 'Render failure' }),
        ),
      );
    });

    const json = tree!.toJSON();
    expect(json).toBeNull();
  });

  it('calls onError callback with the error when child throws', () => {
    const onError = jest.fn();

    act(() => {
      create(
        React.createElement(
          ErrorBoundary,
          { onError },
          React.createElement(ThrowingComponent, { error: 'callback test' }),
        ),
      );
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('callback test');
  });

  it('does not call onError when no callback provided (no throw)', () => {
    const onError = jest.fn();

    act(() => {
      create(
        React.createElement(
          ErrorBoundary,
          {},
          React.createElement(GoodComponent, { text: 'No error here' }),
        ),
      );
    });

    // onError was not even passed as a prop, so nothing should be called
    expect(onError).not.toHaveBeenCalled();
  });

  it('logs error via componentDidCatch', () => {
    const mockLog = (logger as any).child();

    act(() => {
      create(
        React.createElement(
          ErrorBoundary,
          {},
          React.createElement(ThrowingComponent, { error: 'log test error' }),
        ),
      );
    });

    expect(mockLog.error).toHaveBeenCalledWith(
      'Render error caught by ErrorBoundary',
      expect.objectContaining({
        error: 'log test error',
      }),
    );
  });

  it('includes moduleId in log context when provided', () => {
    const mockLog = (logger as any).child();

    act(() => {
      create(
        React.createElement(
          ErrorBoundary,
          { moduleId: 'com.vendor.test' },
          React.createElement(ThrowingComponent, { error: 'module error' }),
        ),
      );
    });

    expect(mockLog.error).toHaveBeenCalledWith(
      'Render error caught by ErrorBoundary',
      expect.objectContaining({
        moduleId: 'com.vendor.test',
      }),
    );
  });

  it('works without moduleId prop', () => {
    const onError = jest.fn();

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          { onError },
          React.createElement(ThrowingComponent, { error: 'no module id' }),
        ),
      );
    });

    // Should still catch and call onError without crashing
    expect(onError).toHaveBeenCalledTimes(1);
    const json = tree!.toJSON();
    expect(json).toBeNull();
  });

  it('handles string error messages', () => {
    const onError = jest.fn();

    act(() => {
      create(
        React.createElement(
          ErrorBoundary,
          { onError },
          React.createElement(ThrowingComponent, { error: 'string error message' }),
        ),
      );
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe('string error message');
  });

  it('error state contains the thrown error', () => {
    const fallback = React.createElement('Text', null, 'Error fallback');

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          { fallback },
          React.createElement(ThrowingComponent, { error: 'state check' }),
        ),
      );
    });

    // Verify the component is in error state by confirming fallback is rendered
    const fallbackNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Error fallback'),
    );
    expect(fallbackNodes.length).toBeGreaterThan(0);

    // Verify children are NOT rendered (error state persists)
    const childNodes = tree!.root.findAll(
      (el: any) => el.type === ThrowingComponent,
    );
    expect(childNodes).toHaveLength(0);
  });

  it('error persists until remount - multiple renders keep error state', () => {
    const fallback = React.createElement('Text', null, 'Persistent error');

    let tree: ReactTestRenderer;
    act(() => {
      tree = create(
        React.createElement(
          ErrorBoundary,
          { fallback },
          React.createElement(ThrowingComponent, { error: 'persistent' }),
        ),
      );
    });

    // First check: fallback is rendered
    let fallbackNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Persistent error'),
    );
    expect(fallbackNodes.length).toBeGreaterThan(0);

    // Re-render the same tree (error state should persist)
    act(() => {
      tree!.update(
        React.createElement(
          ErrorBoundary,
          { fallback },
          React.createElement(GoodComponent, { text: 'Should not appear' }),
        ),
      );
    });

    // Fallback should still be rendered because the ErrorBoundary has not been remounted
    fallbackNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Persistent error'),
    );
    expect(fallbackNodes.length).toBeGreaterThan(0);

    // The good component text should NOT appear
    const goodNodes = tree!.root.findAll(
      (el: any) => el.children?.includes('Should not appear'),
    );
    expect(goodNodes).toHaveLength(0);
  });
});
