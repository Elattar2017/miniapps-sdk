/**
 * DataBus Scoped Channel Test Suite
 *
 * Tests for publishScoped() and subscribeScoped() methods that enable
 * tenant+module-scoped inter-module communication with isolation.
 */

import { DataBus } from '../../../src/kernel/communication/DataBus';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DataBus - Scoped Channels', () => {
  let bus: DataBus;

  beforeEach(() => {
    bus = new DataBus();
  });

  // ---------------------------------------------------------------------------
  // publishScoped()
  // ---------------------------------------------------------------------------

  it('publishScoped() sends to both scoped channel and global channel', () => {
    const scopedCb = jest.fn();
    const globalCb = jest.fn();

    // Subscribe to the scoped channel directly
    bus.subscribe('tenant-a:mod-x:events', scopedCb);
    // Subscribe to the global channel
    bus.subscribe('events', globalCb);

    bus.publishScoped('tenant-a', 'mod-x', 'events', { type: 'click' });

    expect(scopedCb).toHaveBeenCalledWith({ type: 'click' });
    expect(globalCb).toHaveBeenCalledWith({ type: 'click' });
  });

  it('publishScoped(): scoped subscriber receives message', () => {
    const scopedCb = jest.fn();
    bus.subscribeScoped('tenant-a', 'mod-x', 'updates', scopedCb);

    bus.publishScoped('tenant-a', 'mod-x', 'updates', { value: 42 });

    expect(scopedCb).toHaveBeenCalledTimes(1);
    expect(scopedCb).toHaveBeenCalledWith({ value: 42 });
  });

  it('publishScoped(): global subscriber also receives message', () => {
    const globalCb = jest.fn();
    bus.subscribe('updates', globalCb);

    bus.publishScoped('tenant-a', 'mod-x', 'updates', { value: 42 });

    expect(globalCb).toHaveBeenCalledTimes(1);
    expect(globalCb).toHaveBeenCalledWith({ value: 42 });
  });

  // ---------------------------------------------------------------------------
  // subscribeScoped()
  // ---------------------------------------------------------------------------

  it('subscribeScoped() only receives scoped messages (not global publishes)', () => {
    const scopedCb = jest.fn();
    bus.subscribeScoped('tenant-a', 'mod-x', 'events', scopedCb);

    // Publish directly to the global channel (not via publishScoped)
    bus.publish('events', { type: 'global-only' });

    expect(scopedCb).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cross-tenant isolation
  // ---------------------------------------------------------------------------

  it('cross-tenant isolation: subscriber for tenant-A does not receive tenant-B messages', () => {
    const tenantACb = jest.fn();
    const tenantBCb = jest.fn();

    bus.subscribeScoped('tenant-a', 'mod-x', 'events', tenantACb);
    bus.subscribeScoped('tenant-b', 'mod-x', 'events', tenantBCb);

    bus.publishScoped('tenant-a', 'mod-x', 'events', { from: 'a' });

    expect(tenantACb).toHaveBeenCalledWith({ from: 'a' });
    expect(tenantBCb).not.toHaveBeenCalledWith({ from: 'a' });
  });

  // ---------------------------------------------------------------------------
  // Cross-module isolation
  // ---------------------------------------------------------------------------

  it('cross-module isolation: subscriber for module-X does not receive module-Y messages', () => {
    const modXCb = jest.fn();
    const modYCb = jest.fn();

    bus.subscribeScoped('tenant-a', 'mod-x', 'events', modXCb);
    bus.subscribeScoped('tenant-a', 'mod-y', 'events', modYCb);

    bus.publishScoped('tenant-a', 'mod-y', 'events', { from: 'y' });

    expect(modYCb).toHaveBeenCalledWith({ from: 'y' });
    expect(modXCb).not.toHaveBeenCalledWith({ from: 'y' });
  });

  // ---------------------------------------------------------------------------
  // Unsubscribe
  // ---------------------------------------------------------------------------

  it('subscribeScoped() returns unsubscribe function that works', () => {
    const cb = jest.fn();
    const unsub = bus.subscribeScoped('tenant-a', 'mod-x', 'events', cb);

    bus.publishScoped('tenant-a', 'mod-x', 'events', 'msg1');
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();

    bus.publishScoped('tenant-a', 'mod-x', 'events', 'msg2');
    // Should still be 1 because we unsubscribed
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('publishScoped() with no subscribers does not throw', () => {
    expect(() => {
      bus.publishScoped('tenant-a', 'mod-x', 'empty-channel', { data: 'test' });
    }).not.toThrow();
  });

  it('publishScoped() delivers to multiple scoped subscribers on same scope', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();

    bus.subscribeScoped('tenant-a', 'mod-x', 'events', cb1);
    bus.subscribeScoped('tenant-a', 'mod-x', 'events', cb2);

    bus.publishScoped('tenant-a', 'mod-x', 'events', 'payload');

    expect(cb1).toHaveBeenCalledWith('payload');
    expect(cb2).toHaveBeenCalledWith('payload');
  });

  it('scoped channel name is correctly formed as tenantId:moduleId:channel', () => {
    const cb = jest.fn();
    // Subscribe directly using the expected scoped key
    bus.subscribe('my-tenant:my-module:data', cb);

    bus.publishScoped('my-tenant', 'my-module', 'data', 'test-value');

    expect(cb).toHaveBeenCalledWith('test-value');
  });

  it('global-only publish does not leak into scoped subscribers', () => {
    const scopedCb = jest.fn();
    const globalCb = jest.fn();

    bus.subscribeScoped('tenant-a', 'mod-x', 'notifications', scopedCb);
    bus.subscribe('notifications', globalCb);

    // Publish only to the global channel
    bus.publish('notifications', { alert: 'global' });

    expect(globalCb).toHaveBeenCalledWith({ alert: 'global' });
    expect(scopedCb).not.toHaveBeenCalled();
  });
});
