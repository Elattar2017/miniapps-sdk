/**
 * DataBus Wildcard, Rate Limiting & History Test Suite
 *
 * Tests wildcard subscriptions, rate limiting, and message history
 * features added to the DataBus.
 */

import { DataBus } from "../../../src/kernel/communication/DataBus";

describe("DataBus - Wildcards, Rate Limiting & History", () => {
  let bus: DataBus;

  beforeEach(() => {
    bus = new DataBus();
  });

  afterEach(() => {
    bus.clear();
  });

  describe("wildcard subscriptions", () => {
    it("sdk:* matches sdk:foo and sdk:foo:bar", () => {
      const cb = jest.fn();
      bus.subscribe("sdk:*", cb);
      bus.publish("sdk:foo", { a: 1 });
      bus.publish("sdk:foo:bar", { b: 2 });
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenCalledWith({ a: 1 });
      expect(cb).toHaveBeenCalledWith({ b: 2 });
    });

    it("sdk:sync:* matches sdk:sync:started but not sdk:other", () => {
      const cb = jest.fn();
      bus.subscribe("sdk:sync:*", cb);
      bus.publish("sdk:sync:started", { status: "go" });
      bus.publish("sdk:other", { status: "no" });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ status: "go" });
    });

    it("exact subscription still works alongside wildcards", () => {
      const wildcardCb = jest.fn();
      const exactCb = jest.fn();
      bus.subscribe("events:*", wildcardCb);
      bus.subscribe("events:click", exactCb);
      bus.publish("events:click", { x: 10 });
      expect(wildcardCb).toHaveBeenCalledTimes(1);
      expect(exactCb).toHaveBeenCalledTimes(1);
    });
    it("multiple wildcard patterns: all matching ones fire", () => {
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      const cb3 = jest.fn();
      bus.subscribe("a:*", cb1);
      bus.subscribe("a:b:*", cb2);
      bus.subscribe("x:*", cb3);
      bus.publish("a:b:c", { val: 1 });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).not.toHaveBeenCalled();
    });

    it("unsubscribe wildcard: stops receiving", () => {
      const cb = jest.fn();
      const unsub = bus.subscribe("sdk:*", cb);
      bus.publish("sdk:test", "first");
      expect(cb).toHaveBeenCalledTimes(1);
      unsub();
      bus.publish("sdk:test", "second");
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("wildcard with no trailing star: treated as exact match", () => {
      const cb = jest.fn();
      bus.subscribe("sdk:exact", cb);
      bus.publish("sdk:exact", "match");
      bus.publish("sdk:exact:sub", "no-match");
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith("match");
    });
  });
  describe("rate limiting", () => {
    it("messages within limit are delivered", () => {
      const cb = jest.fn();
      bus.subscribe("limited", cb);
      bus.setRateLimit("limited", 5);
      for (let i = 0; i < 5; i++) {
        bus.publish("limited", i);
      }
      expect(cb).toHaveBeenCalledTimes(5);
    });

    it("messages over limit are dropped with warning", () => {
      const cb = jest.fn();
      bus.subscribe("limited", cb);
      bus.setRateLimit("limited", 2);
      bus.publish("limited", 1);
      bus.publish("limited", 2);
      bus.publish("limited", 3);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("resets after 1 second window", (done) => {
      const cb = jest.fn();
      bus.subscribe("limited", cb);
      bus.setRateLimit("limited", 1);
      bus.publish("limited", "first");
      bus.publish("limited", "dropped");
      expect(cb).toHaveBeenCalledTimes(1);
      setTimeout(() => {
        bus.publish("limited", "after-reset");
        expect(cb).toHaveBeenCalledTimes(2);
        done();
      }, 1100);
    }, 3000);

    it("rate limit on a channel does not affect other channels", () => {
      const cbLimited = jest.fn();
      const cbUnlimited = jest.fn();
      bus.subscribe("limited-ch", cbLimited);
      bus.subscribe("unlimited-ch", cbUnlimited);
      bus.setRateLimit("limited-ch", 1);
      bus.publish("limited-ch", "a");
      bus.publish("limited-ch", "b");
      bus.publish("unlimited-ch", "x");
      bus.publish("unlimited-ch", "y");
      expect(cbLimited).toHaveBeenCalledTimes(1);
      expect(cbUnlimited).toHaveBeenCalledTimes(2);
    });
  });
  describe("message history", () => {
    it("enableHistory: getHistory returns last N messages", () => {
      bus.enableHistory("events", 10);
      bus.publish("events", { id: 1 });
      bus.publish("events", { id: 2 });
      bus.publish("events", { id: 3 });
      const history = bus.getHistory("events");
      expect(history).toHaveLength(3);
      expect(history[0].data).toEqual({ id: 1 });
      expect(history[1].data).toEqual({ id: 2 });
      expect(history[2].data).toEqual({ id: 3 });
      expect(history[0].timestamp).toBeDefined();
    });

    it("getHistory on channel without history: returns empty array", () => {
      const history = bus.getHistory("no-history");
      expect(history).toEqual([]);
    });

    it("history respects maxMessages (oldest dropped)", () => {
      bus.enableHistory("small", 2);
      bus.publish("small", "first");
      bus.publish("small", "second");
      bus.publish("small", "third");
      const history = bus.getHistory("small");
      expect(history).toHaveLength(2);
      expect(history[0].data).toBe("second");
      expect(history[1].data).toBe("third");
    });
  });

  describe("edge cases", () => {
    it("publish to channel with no subscribers: no error", () => {
      expect(() => {
        bus.publish("ghost-channel", { phantom: true });
      }).not.toThrow();
    });
  });
});
