/**
 * DataBus Policy-Gated Test Suite
 *
 * Tests policy-gated publish and subscribe functionality.
 */

import { DataBus } from '../../../src/kernel/communication/DataBus';
import type { IPolicyEngine, PolicyDecision } from '../../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockPolicyEngine(allowed = true): IPolicyEngine {
  return {
    evaluate: jest.fn().mockResolvedValue({ allowed, reason: allowed ? 'allowed' : 'denied' } as PolicyDecision),
    loadPolicies: jest.fn(),
    clearPolicies: jest.fn(),
    getPolicies: jest.fn().mockReturnValue([]),
  };
}

describe('DataBus policy-gated', () => {
  it('setPolicyEngine stores reference', async () => {
    const bus = new DataBus();
    const policyEngine = createMockPolicyEngine(true);
    bus.setPolicyEngine(policyEngine);

    const cb = jest.fn();
    bus.subscribe('test', cb);
    await bus.publishPolicyGated('test', { msg: 'hello' }, { userId: 'u1' });
    expect(policyEngine.evaluate).toHaveBeenCalled();
  });

  it('publishPolicyGated with allowed sender delivers message', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(true));

    const cb = jest.fn();
    bus.subscribe('test', cb);
    const result = await bus.publishPolicyGated('test', { msg: 'hello' }, { userId: 'u1' });
    expect(result).toBe(true);
    expect(cb).toHaveBeenCalledWith({ msg: 'hello' });
  });

  it('publishPolicyGated with denied sender blocks message', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(false));

    const cb = jest.fn();
    bus.subscribe('test', cb);
    const result = await bus.publishPolicyGated('test', { msg: 'blocked' }, { userId: 'u1' });
    expect(result).toBe(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribePolicyGated: callback receives on allowed channel', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(true));

    const cb = jest.fn();
    bus.subscribePolicyGated('test', cb, { userId: 'u1' });
    bus.publish('test', { data: 1 });

    // Wait for async policy check
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(cb).toHaveBeenCalledWith({ data: 1 });
  });

  it('subscribePolicyGated: callback NOT called when denied', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(false));

    const cb = jest.fn();
    bus.subscribePolicyGated('test', cb, { userId: 'u1' });
    bus.publish('test', { data: 1 });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('no policy engine: publishPolicyGated works like regular publish', async () => {
    const bus = new DataBus();
    const cb = jest.fn();
    bus.subscribe('test', cb);
    const result = await bus.publishPolicyGated('test', { msg: 'ok' });
    expect(result).toBe(true);
    expect(cb).toHaveBeenCalledWith({ msg: 'ok' });
  });

  it('no policy engine: subscribePolicyGated works like regular subscribe', async () => {
    const bus = new DataBus();
    const cb = jest.fn();
    bus.subscribePolicyGated('test', cb);
    bus.publish('test', { data: 1 });
    // Without policy engine, callback is synchronous
    expect(cb).toHaveBeenCalledWith({ data: 1 });
  });

  it('policy-gated + wildcard both applied', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(true));

    const cb = jest.fn();
    bus.subscribe('sdk:*', cb);
    await bus.publishPolicyGated('sdk:test', { data: 1 }, { userId: 'u1' });
    expect(cb).toHaveBeenCalledWith({ data: 1 });
  });

  it('policy-gated + rate limiting both enforced', async () => {
    const bus = new DataBus();
    bus.setPolicyEngine(createMockPolicyEngine(true));
    bus.setRateLimit('test', 1);

    const cb = jest.fn();
    bus.subscribe('test', cb);
    await bus.publishPolicyGated('test', { msg: 1 }, { userId: 'u1' });
    await bus.publishPolicyGated('test', { msg: 2 }, { userId: 'u1' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe from policy-gated subscription works', async () => {
    const bus = new DataBus();
    const cb = jest.fn();
    const unsub = bus.subscribePolicyGated('test', cb);
    unsub();
    bus.publish('test', { data: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('publishPolicyGated with empty senderContext uses defaults', async () => {
    const bus = new DataBus();
    const policyEngine = createMockPolicyEngine(true);
    bus.setPolicyEngine(policyEngine);

    const cb = jest.fn();
    bus.subscribe('test', cb);
    await bus.publishPolicyGated('test', { msg: 'ok' });
    expect(policyEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '' }),
    );
  });

  it('multiple policy-gated subscribers each checked independently', async () => {
    const bus = new DataBus();
    let callCount = 0;
    const policyEngine: IPolicyEngine = {
      evaluate: jest.fn().mockImplementation(async () => {
        callCount++;
        return { allowed: callCount % 2 === 1, reason: 'alternating' };
      }),
      loadPolicies: jest.fn(),
      clearPolicies: jest.fn(),
      getPolicies: jest.fn().mockReturnValue([]),
    };
    bus.setPolicyEngine(policyEngine);

    const cb1 = jest.fn();
    const cb2 = jest.fn();
    bus.subscribePolicyGated('test', cb1, { userId: 'u1' });
    bus.subscribePolicyGated('test', cb2, { userId: 'u2' });
    bus.publish('test', { data: 1 });

    await new Promise(resolve => setTimeout(resolve, 10));
    // cb1 gets allowed (callCount=1), cb2 gets denied (callCount=2)
    expect(cb1).toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
  });
});
