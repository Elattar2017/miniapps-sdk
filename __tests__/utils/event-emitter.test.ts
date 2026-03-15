/**
 * TypedEventEmitter Test Suite
 * Tests event registration, emission, listener removal, multiple listeners,
 * listener count reporting, and error resilience.
 */

import { TypedEventEmitter } from '../../src/utils/event-emitter';

/** Test event map for type safety */
interface TestEvents {
  message: { text: string };
  count: number;
  empty: undefined;
}

describe('TypedEventEmitter', () => {
  let emitter: TypedEventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<TestEvents>();
  });

  afterEach(() => {
    emitter.removeAllListeners();
  });

  it('should register and emit events', () => {
    const handler = jest.fn();
    emitter.on('message', handler);

    emitter.emit('message', { text: 'hello' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('should remove specific listeners', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    emitter.on('count', handler1);
    emitter.on('count', handler2);

    emitter.off('count', handler1);
    emitter.emit('count', 42);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith(42);
  });

  it('should remove all listeners for a specific event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const messageHandler = jest.fn();

    emitter.on('count', handler1);
    emitter.on('count', handler2);
    emitter.on('message', messageHandler);

    emitter.removeAllListeners('count');

    emitter.emit('count', 10);
    emitter.emit('message', { text: 'still here' });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
    expect(messageHandler).toHaveBeenCalledTimes(1);
  });

  it('should remove all listeners across all events', () => {
    const countHandler = jest.fn();
    const messageHandler = jest.fn();

    emitter.on('count', countHandler);
    emitter.on('message', messageHandler);

    emitter.removeAllListeners();

    emitter.emit('count', 10);
    emitter.emit('message', { text: 'gone' });

    expect(countHandler).not.toHaveBeenCalled();
    expect(messageHandler).not.toHaveBeenCalled();
  });

  it('should handle multiple listeners on the same event', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    const handler3 = jest.fn();

    emitter.on('count', handler1);
    emitter.on('count', handler2);
    emitter.on('count', handler3);

    emitter.emit('count', 99);

    expect(handler1).toHaveBeenCalledWith(99);
    expect(handler2).toHaveBeenCalledWith(99);
    expect(handler3).toHaveBeenCalledWith(99);
  });

  it('should report listener count', () => {
    expect(emitter.listenerCount('count')).toBe(0);

    const handler1 = jest.fn();
    const handler2 = jest.fn();

    emitter.on('count', handler1);
    expect(emitter.listenerCount('count')).toBe(1);

    emitter.on('count', handler2);
    expect(emitter.listenerCount('count')).toBe(2);

    emitter.off('count', handler1);
    expect(emitter.listenerCount('count')).toBe(1);
  });

  it('should report hasListeners correctly', () => {
    expect(emitter.hasListeners('count')).toBe(false);

    const handler = jest.fn();
    emitter.on('count', handler);
    expect(emitter.hasListeners('count')).toBe(true);

    emitter.off('count', handler);
    expect(emitter.hasListeners('count')).toBe(false);
  });

  it('should not crash if a listener throws', () => {
    const throwingHandler = jest.fn(() => {
      throw new Error('listener error');
    });
    const safeHandler = jest.fn();

    emitter.on('count', throwingHandler);
    emitter.on('count', safeHandler);

    // Should not throw even though the first listener does
    expect(() => {
      emitter.emit('count', 5);
    }).not.toThrow();

    expect(throwingHandler).toHaveBeenCalledWith(5);
    expect(safeHandler).toHaveBeenCalledWith(5);
  });

  it('should handle emitting an event with no listeners gracefully', () => {
    // Should not throw
    expect(() => {
      emitter.emit('count', 42);
    }).not.toThrow();
  });

  it('should handle removing a listener that was never added', () => {
    const handler = jest.fn();

    // Should not throw
    expect(() => {
      emitter.off('count', handler);
    }).not.toThrow();
  });
});
