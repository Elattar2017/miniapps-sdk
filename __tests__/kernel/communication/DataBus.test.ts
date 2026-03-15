/**
 * DataBus Test Suite
 *
 * Tests for the in-memory pub/sub channel system that enables
 * scoped, audited inter-module communication.
 */

import { DataBus } from '../../../src/kernel/communication/DataBus';

describe('DataBus', () => {
  let bus: DataBus;

  beforeEach(() => {
    bus = new DataBus();
  });

  // ---------------------------------------------------------------------------
  // publish()
  // ---------------------------------------------------------------------------

  it('publish() delivers data to all subscribers on a channel', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    bus.subscribe('events', cb1);
    bus.subscribe('events', cb2);

    bus.publish('events', { type: 'click' });

    expect(cb1).toHaveBeenCalledWith({ type: 'click' });
    expect(cb2).toHaveBeenCalledWith({ type: 'click' });
  });

  it('publish() does nothing with no subscribers (no error)', () => {
    expect(() => bus.publish('empty-channel', { foo: 'bar' })).not.toThrow();
  });

  it('publish() catches and logs subscriber errors without affecting other subscribers', () => {
    const cb1 = jest.fn(() => {
      throw new Error('subscriber failure');
    });
    const cb2 = jest.fn();

    bus.subscribe('ch', cb1);
    bus.subscribe('ch', cb2);

    // Should not throw even though cb1 throws
    expect(() => bus.publish('ch', 'data')).not.toThrow();
    expect(cb1).toHaveBeenCalledWith('data');
    expect(cb2).toHaveBeenCalledWith('data');
  });

  // ---------------------------------------------------------------------------
  // subscribe()
  // ---------------------------------------------------------------------------

  it('subscribe() returns an unsubscribe function that works', () => {
    const cb = jest.fn();
    const unsub = bus.subscribe('ch', cb);

    bus.publish('ch', 1);
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    bus.publish('ch', 2);
    // Should still be 1 because we unsubscribed
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscribe() creates channel on first subscribe', () => {
    expect(bus.getChannels()).toEqual([]);

    bus.subscribe('new-channel', jest.fn());

    expect(bus.getChannels()).toContain('new-channel');
  });

  it('multiple subscribers on same channel all receive messages', () => {
    const callbacks = [jest.fn(), jest.fn(), jest.fn()];
    callbacks.forEach((cb) => bus.subscribe('multi', cb));

    bus.publish('multi', 'hello');

    callbacks.forEach((cb) => {
      expect(cb).toHaveBeenCalledWith('hello');
    });
  });

  // ---------------------------------------------------------------------------
  // unsubscribe()
  // ---------------------------------------------------------------------------

  it('unsubscribe() removes specific callback', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    bus.subscribe('ch', cb1);
    bus.subscribe('ch', cb2);

    bus.unsubscribe('ch', cb1);
    bus.publish('ch', 'payload');

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledWith('payload');
  });

  it('unsubscribe() on empty/unknown channel does not crash', () => {
    const cb = jest.fn();
    expect(() => bus.unsubscribe('nonexistent', cb)).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // getSubscriberCount()
  // ---------------------------------------------------------------------------

  it('getSubscriberCount() returns correct count', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    bus.subscribe('ch', cb1);
    bus.subscribe('ch', cb2);

    expect(bus.getSubscriberCount('ch')).toBe(2);
  });

  it('getSubscriberCount() returns 0 for unknown channel', () => {
    expect(bus.getSubscriberCount('nonexistent')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // getChannels()
  // ---------------------------------------------------------------------------

  it('getChannels() lists active channels', () => {
    bus.subscribe('alpha', jest.fn());
    bus.subscribe('beta', jest.fn());
    bus.subscribe('gamma', jest.fn());

    const channels = bus.getChannels();
    expect(channels).toContain('alpha');
    expect(channels).toContain('beta');
    expect(channels).toContain('gamma');
    expect(channels).toHaveLength(3);
  });

  it('getChannels() returns empty array initially', () => {
    expect(bus.getChannels()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------

  it('clear() removes all channels and subscribers', () => {
    const cb = jest.fn();
    bus.subscribe('ch1', cb);
    bus.subscribe('ch2', jest.fn());

    bus.clear();

    expect(bus.getChannels()).toEqual([]);
    expect(bus.getSubscriberCount('ch1')).toBe(0);

    // Publishing after clear should not reach old subscribers
    bus.publish('ch1', 'data');
    expect(cb).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Channel cleanup on last unsubscribe
  // ---------------------------------------------------------------------------

  it('removes channel from getChannels() when last subscriber is removed', () => {
    const cb = jest.fn();
    bus.subscribe('temp', cb);
    expect(bus.getChannels()).toContain('temp');

    bus.unsubscribe('temp', cb);
    expect(bus.getChannels()).not.toContain('temp');
  });
});
