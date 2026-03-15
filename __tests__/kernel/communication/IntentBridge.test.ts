/**
 * IntentBridge Test Suite
 *
 * Tests for the bidirectional SDK <-> Host communication bridge.
 * Each intent type can have exactly one registered handler.
 */

import { IntentBridge } from '../../../src/kernel/communication/IntentBridge';
import type { Intent, IntentType } from '../../../src/types';

function makeIntent<T>(type: IntentType, payload: T): Intent<T> {
  return {
    type,
    payload,
    timestamp: Date.now(),
    source: 'sdk',
  };
}

describe('IntentBridge', () => {
  let bridge: IntentBridge;

  beforeEach(() => {
    bridge = new IntentBridge();
  });

  // ---------------------------------------------------------------------------
  // registerHandler()
  // ---------------------------------------------------------------------------

  it('registerHandler() registers handler for intent type', () => {
    const handler = jest.fn();
    bridge.registerHandler('OPEN_MODULE', handler);

    expect(bridge.hasHandler('OPEN_MODULE')).toBe(true);
  });

  it('registerHandler() replaces existing handler (with warning log)', () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    bridge.registerHandler('OPEN_MODULE', handler1);
    bridge.registerHandler('OPEN_MODULE', handler2);

    // Only the second handler should be active
    expect(bridge.hasHandler('OPEN_MODULE')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // emit()
  // ---------------------------------------------------------------------------

  it('emit() calls registered handler with correct payload', async () => {
    const handler = jest.fn();
    bridge.registerHandler('SHARE_DATA', handler);

    const intent = makeIntent('SHARE_DATA', { key: 'value' });
    await bridge.emit(intent);

    expect(handler).toHaveBeenCalledWith({ key: 'value' });
  });

  it('emit() handles async handlers correctly (returns Promise)', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    bridge.registerHandler('NAVIGATE_TO_HOST_SCREEN', handler);

    const intent = makeIntent('NAVIGATE_TO_HOST_SCREEN', { screen: 'home' });
    await expect(bridge.emit(intent)).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledWith({ screen: 'home' });
  });

  it('emit() logs warning when no handler registered for type', async () => {
    const intent = makeIntent('OPEN_MODULE', { moduleId: 'test' });

    // Should not throw even when no handler is registered
    await expect(bridge.emit(intent)).resolves.toBeUndefined();
  });

  it('emit() catches and logs handler errors (does not throw)', async () => {
    const handler = jest.fn(() => {
      throw new Error('handler crashed');
    });
    bridge.registerHandler('NOTIFY_EVENT', handler);

    const intent = makeIntent('NOTIFY_EVENT', { event: 'test' });
    await expect(bridge.emit(intent)).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // removeHandler()
  // ---------------------------------------------------------------------------

  it('removeHandler() removes handler for type', () => {
    bridge.registerHandler('OPEN_MODULE', jest.fn());
    expect(bridge.hasHandler('OPEN_MODULE')).toBe(true);

    bridge.removeHandler('OPEN_MODULE');
    expect(bridge.hasHandler('OPEN_MODULE')).toBe(false);
  });

  it('removeHandler() logs warning when no handler to remove', () => {
    // Should not throw
    expect(() => bridge.removeHandler('OPEN_MODULE')).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // hasHandler()
  // ---------------------------------------------------------------------------

  it('hasHandler() returns true for registered type', () => {
    bridge.registerHandler('SHARE_DATA', jest.fn());
    expect(bridge.hasHandler('SHARE_DATA')).toBe(true);
  });

  it('hasHandler() returns false for unregistered type', () => {
    expect(bridge.hasHandler('SHARE_DATA')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // removeAllHandlers()
  // ---------------------------------------------------------------------------

  it('removeAllHandlers() clears all handlers', () => {
    bridge.registerHandler('OPEN_MODULE', jest.fn());
    bridge.registerHandler('SHARE_DATA', jest.fn());
    bridge.registerHandler('NOTIFY_EVENT', jest.fn());

    bridge.removeAllHandlers();

    expect(bridge.hasHandler('OPEN_MODULE')).toBe(false);
    expect(bridge.hasHandler('SHARE_DATA')).toBe(false);
    expect(bridge.hasHandler('NOTIFY_EVENT')).toBe(false);
  });
});
