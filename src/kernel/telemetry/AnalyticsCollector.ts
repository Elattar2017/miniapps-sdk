/**
 * Analytics Collector - Buffers and manages SDK analytics events
 * @module kernel/telemetry/AnalyticsCollector
 *
 * Tracks screen views, interactions, conversions, and timing events
 * across modules. Events are buffered in memory with a configurable
 * max size (oldest dropped when full). The flush() method sends
 * buffered events to the APIProxy if available.
 *
 * All tracked events are also published on the DataBus for
 * real-time listeners.
 */

import { logger } from '../../utils/logger';
import type { APIProxy } from '../network/APIProxy';
import type { DataBus } from '../communication/DataBus';

const DEFAULT_MAX_BUFFER_SIZE = 1000;

export interface AnalyticsEvent {
  type: 'screen_view' | 'interaction' | 'conversion' | 'timing';
  moduleId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  // screen_view fields
  screenId?: string;
  // interaction fields
  action?: string;
  elementId?: string;
  // conversion fields
  funnelId?: string;
  step?: number;
  // timing fields
  metric?: string;
  durationMs?: number;
}

export class AnalyticsCollector {
  private readonly log = logger.child({ component: 'AnalyticsCollector' });
  private readonly maxBufferSize: number;
  private readonly apiProxy: APIProxy | undefined;
  private readonly dataBus: DataBus | undefined;
  private readonly moduleRegistryUrl: string | undefined;
  private events: AnalyticsEvent[] = [];

  constructor(config: { maxBufferSize?: number; apiProxy?: APIProxy; dataBus?: DataBus; moduleRegistryUrl?: string }) {
    this.maxBufferSize = config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    this.apiProxy = config.apiProxy;
    this.dataBus = config.dataBus;
    this.moduleRegistryUrl = config.moduleRegistryUrl;
    this.log.info('AnalyticsCollector initialized', { maxBufferSize: this.maxBufferSize });
  }

  trackScreenView(moduleId: string, screenId: string, metadata?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      type: 'screen_view',
      moduleId,
      screenId,
      timestamp: Date.now(),
      metadata,
    };
    this.bufferEvent(event);
    this.dataBus?.publish('sdk:analytics:screen_view', event);
    this.log.debug('Screen view tracked', { moduleId, screenId });
  }

  trackInteraction(moduleId: string, screenId: string, action: string, elementId?: string, metadata?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      type: 'interaction',
      moduleId,
      screenId,
      action,
      elementId,
      timestamp: Date.now(),
      metadata,
    };
    this.bufferEvent(event);
    this.dataBus?.publish('sdk:analytics:interaction', event);
    this.log.debug('Interaction tracked', { moduleId, screenId, action });
  }

  trackConversion(moduleId: string, funnelId: string, step: number, metadata?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      type: 'conversion',
      moduleId,
      funnelId,
      step,
      timestamp: Date.now(),
      metadata,
    };
    this.bufferEvent(event);
    this.dataBus?.publish('sdk:analytics:conversion', event);
    this.log.debug('Conversion tracked', { moduleId, funnelId, step });
  }

  trackTiming(moduleId: string, metric: string, durationMs: number, metadata?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      type: 'timing',
      moduleId,
      metric,
      durationMs,
      timestamp: Date.now(),
      metadata,
    };
    this.bufferEvent(event);
    this.log.debug('Timing tracked', { moduleId, metric, durationMs });
  }

  getScreenViews(moduleId?: string): AnalyticsEvent[] {
    return this.filterEvents('screen_view', moduleId);
  }

  getInteractions(moduleId?: string): AnalyticsEvent[] {
    return this.filterEvents('interaction', moduleId);
  }

  getMetrics(): { screenViews: number; interactions: number; conversions: number; avgTiming: number } {
    const screenViews = this.events.filter(e => e.type === 'screen_view').length;
    const interactions = this.events.filter(e => e.type === 'interaction').length;
    const conversions = this.events.filter(e => e.type === 'conversion').length;
    const timings = this.events.filter(e => e.type === 'timing');
    const avgTiming = timings.length > 0
      ? timings.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / timings.length
      : 0;

    return { screenViews, interactions, conversions, avgTiming };
  }

  async flush(): Promise<void> {
    if (this.events.length === 0) {
      this.log.debug('No analytics events to flush');
      return;
    }

    if (!this.apiProxy) {
      this.log.debug('No apiProxy configured, skipping flush');
      return;
    }

    const batch = [...this.events];
    this.log.info('Flushing analytics events', { eventCount: batch.length });

    try {
      if (this.moduleRegistryUrl) {
        await this.apiProxy.requestAbsolute(`${this.moduleRegistryUrl}/api/sdk/analytics`, {
          method: 'POST',
          body: { events: batch },
        });
      } else {
        await this.apiProxy.request('/api/sdk/analytics', {
          method: 'POST',
          body: { events: batch },
        });
      }
      this.events = [];
      this.log.debug('Analytics flush successful');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Analytics flush failed, preserving events', { error: message });
    }
  }

  clear(): void {
    this.events = [];
    this.log.debug('Analytics buffer cleared');
  }

  private bufferEvent(event: AnalyticsEvent): void {
    this.events.push(event);

    if (this.events.length > this.maxBufferSize) {
      const dropped = this.events.length - this.maxBufferSize;
      this.events = this.events.slice(dropped);
      this.log.warn('Analytics buffer overflow, dropped oldest events', { dropped });
    }
  }

  private filterEvents(type: AnalyticsEvent['type'], moduleId?: string): AnalyticsEvent[] {
    return this.events.filter(e => {
      if (e.type !== type) return false;
      if (moduleId !== undefined && e.moduleId !== moduleId) return false;
      return true;
    });
  }
}
