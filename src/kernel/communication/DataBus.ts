/**
 * Data Bus - Scoped, audited inter-module communication
 * @module kernel/communication/DataBus
 *
 * Enhanced with wildcard subscriptions, rate limiting, and message history.
 */

import { logger } from "../../utils/logger";
import type { IPolicyEngine } from "../../types";

type DataBusCallback = (data: unknown) => void;

interface HistoryEntry { data: unknown; timestamp: number; }
interface RateLimitState { maxPerSecond: number; timestamps: number[]; }
interface HistoryConfig { maxMessages: number; entries: HistoryEntry[]; }
export class DataBus {
  private readonly log = logger.child({ component: "DataBus" });
  private readonly channels: Map<string, Set<DataBusCallback>> = new Map();
  private readonly rateLimits: Map<string, RateLimitState> = new Map();
  private readonly histories: Map<string, HistoryConfig> = new Map();
  private policyEngine?: IPolicyEngine;
  publish(channel: string, data: unknown): void {
    this.log.info("DataBus publish", {
      channel,
      subscriberCount: this.channels.get(channel)?.size ?? 0,
    });

    if (this.isRateLimited(channel)) {
      this.log.warn("DataBus rate limit exceeded, message dropped", { channel });
      return;
    }
    this.recordPublish(channel);
    this.recordHistory(channel, data);
    const callbacks: DataBusCallback[] = [];
    const exactSubscribers = this.channels.get(channel);
    if (exactSubscribers) {
      for (const cb of exactSubscribers) { callbacks.push(cb); }
    }
    for (const [pattern, subscribers] of this.channels) {
      if (pattern === channel) continue;
      if (this.isWildcardMatch(pattern, channel)) {
        for (const cb of subscribers) { callbacks.push(cb); }
      }
    }
    if (callbacks.length === 0) {
      this.log.debug("No subscribers for channel", { channel });
      return;
    }
    for (const callback of callbacks) {
      try {
        callback(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error("DataBus subscriber threw an error", { channel, error: message });
      }
    }
  }
  subscribe(channel: string, callback: DataBusCallback): () => void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(callback);
    this.log.debug("Subscriber added to channel", {
      channel, subscriberCount: this.channels.get(channel)!.size,
    });
    return () => { this.unsubscribe(channel, callback); };
  }
  unsubscribe(channel: string, callback: DataBusCallback): void {
    const subscribers = this.channels.get(channel);
    if (!subscribers) {
      this.log.warn("Cannot unsubscribe: channel does not exist", { channel });
      return;
    }
    const removed = subscribers.delete(callback);
    if (removed) {
      this.log.debug("Subscriber removed from channel", { channel, subscriberCount: subscribers.size });
      if (subscribers.size === 0) { this.channels.delete(channel); }
    } else {
      this.log.warn("Cannot unsubscribe: callback not found on channel", { channel });
    }
  }
  getSubscriberCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  getChannels(): string[] {
    return Array.from(this.channels.keys());
  }
  publishScoped(tenantId: string, moduleId: string, channel: string, data: unknown): void {
    const scopedChannel = `${tenantId}:${moduleId}:${channel}`;
    this.publish(scopedChannel, data);
    this.publish(channel, data);
  }

  subscribeScoped(tenantId: string, moduleId: string, channel: string, callback: DataBusCallback): () => void {
    const scopedChannel = `${tenantId}:${moduleId}:${channel}`;
    return this.subscribe(scopedChannel, callback);
  }
  setRateLimit(channel: string, maxPerSecond: number): void {
    this.rateLimits.set(channel, { maxPerSecond, timestamps: [] });
    this.log.debug("Rate limit set", { channel, maxPerSecond });
  }

  enableHistory(channel: string, maxMessages: number): void {
    this.histories.set(channel, { maxMessages, entries: [] });
    this.log.debug("History enabled", { channel, maxMessages });
  }
  getHistory(channel: string): HistoryEntry[] {
    const config = this.histories.get(channel);
    if (!config) return [];
    return [...config.entries];
  }

  /**
   * Set the policy engine for policy-gated operations.
   */
  setPolicyEngine(policyEngine: IPolicyEngine): void {
    this.policyEngine = policyEngine;
    this.log.debug('Policy engine set on DataBus');
  }

  /**
   * Publish with policy check on the sender.
   * If no policy engine is set, works like regular publish.
   */
  async publishPolicyGated(
    channel: string,
    data: unknown,
    senderContext: { userId?: string; roles?: string[]; tenantId?: string; moduleId?: string; attributes?: Record<string, unknown> } = {},
  ): Promise<boolean> {
    if (this.policyEngine) {
      const decision = await this.policyEngine.evaluate({
        action: 'publish',
        resource: channel,
        userId: senderContext.userId ?? '',
        roles: senderContext.roles,
        tenantId: senderContext.tenantId,
        moduleId: senderContext.moduleId,
        attributes: senderContext.attributes,
      });
      if (!decision.allowed) {
        this.log.warn('Policy-gated publish blocked', { channel, reason: decision.reason });
        return false;
      }
    }
    this.publish(channel, data);
    return true;
  }

  /**
   * Subscribe with policy check on each message delivery.
   * If no policy engine is set, works like regular subscribe.
   */
  subscribePolicyGated(
    channel: string,
    callback: DataBusCallback,
    subscriberContext: { userId?: string; roles?: string[]; tenantId?: string; moduleId?: string; attributes?: Record<string, unknown> } = {},
  ): () => void {
    const wrappedCallback: DataBusCallback = (msgData: unknown) => {
      if (this.policyEngine) {
        this.policyEngine.evaluate({
          action: 'subscribe',
          resource: channel,
          userId: subscriberContext.userId ?? '',
          roles: subscriberContext.roles,
          tenantId: subscriberContext.tenantId,
          moduleId: subscriberContext.moduleId,
          attributes: subscriberContext.attributes,
        }).then(decision => {
          if (decision.allowed) {
            callback(msgData);
          } else {
            this.log.debug('Policy-gated subscriber blocked', { channel });
          }
        }).catch(err => {
          this.log.error('Policy check failed in subscriber', { error: err instanceof Error ? err.message : String(err) });
        });
      } else {
        callback(msgData);
      }
    };
    return this.subscribe(channel, wrappedCallback);
  }

  clear(): void {
    this.channels.clear();
    this.rateLimits.clear();
    this.histories.clear();
    this.log.debug("All DataBus channels cleared");
  }
  private isWildcardMatch(pattern: string, channel: string): boolean {
    if (!pattern.endsWith("*")) return false;
    const prefix = pattern.slice(0, -1);
    return channel.startsWith(prefix);
  }
  private isRateLimited(channel: string): boolean {
    const limit = this.rateLimits.get(channel);
    if (!limit) return false;
    const now = Date.now();
    const windowStart = now - 1000;
    limit.timestamps = limit.timestamps.filter(t => t > windowStart);
    return limit.timestamps.length >= limit.maxPerSecond;
  }
  private recordPublish(channel: string): void {
    const limit = this.rateLimits.get(channel);
    if (!limit) return;
    limit.timestamps.push(Date.now());
  }

  private recordHistory(channel: string, data: unknown): void {
    const config = this.histories.get(channel);
    if (!config) return;
    config.entries.push({ data, timestamp: Date.now() });
    while (config.entries.length > config.maxMessages) {
      config.entries.shift();
    }
  }
}
