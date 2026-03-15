/**
 * Telemetry Collector - Buffers and manages SDK telemetry events
 * @module kernel/telemetry/TelemetryCollector
 *
 * Events are stored in a circular buffer (oldest dropped when full).
 * When a StorageAdapter is configured, events are persisted offline
 * so they survive app restarts and can be delivered when connectivity
 * or an endpoint becomes available.
 *
 * All tracked events are also logged via the structured logger for
 * immediate debugging visibility.
 */

import { logger } from '../../utils/logger';
import type { SDKEvent, ITelemetryCollector } from '../../types';
import type { IStorageAdapter } from '../../types/storage.types';

/** Maximum number of events held in the buffer before oldest are dropped */
const MAX_BUFFER_SIZE = 1000;

/** Key used to persist events in the storage adapter */
const PERSISTED_EVENTS_KEY = '__telemetry_persisted_events';

/** Maximum number of events to persist offline */
const MAX_PERSISTED_SIZE = 5000;

export class TelemetryCollector implements ITelemetryCollector {
  private readonly log = logger.child({ component: 'TelemetryCollector' });
  private events: SDKEvent[] = [];
  private enabled = true;
  private endpoint: { url: string; authToken: string } | null = null;
  private storage: IStorageAdapter | null = null;

  /**
   * Configure a storage adapter for offline event persistence.
   * When set, events that cannot be flushed remotely are persisted
   * to storage and restored on next flush attempt.
   */
  setStorage(storage: IStorageAdapter): void {
    this.storage = storage;
    this.log.info('Telemetry storage adapter configured');
  }

  /**
   * Configure a remote telemetry endpoint for flushing events.
   * When set, `flush()` will POST events to this URL with the given auth token.
   */
  setEndpoint(url: string, authToken: string): void {
    this.endpoint = { url, authToken };
    this.log.info('Telemetry endpoint configured', { url });
  }

  /**
   * Track an SDK event by adding it to the in-memory buffer.
   * If the buffer exceeds MAX_BUFFER_SIZE, the oldest event is dropped.
   * Tracking is a no-op when the collector is disabled.
   */
  track(event: SDKEvent): void {
    if (!this.enabled) {
      return;
    }

    this.log.debug('Telemetry event tracked', {
      eventType: event.type,
      moduleId: event.moduleId,
      tenantId: event.tenantId,
    });

    this.events.push(event);

    // Drop oldest events when buffer is full
    if (this.events.length > MAX_BUFFER_SIZE) {
      const dropped = this.events.length - MAX_BUFFER_SIZE;
      this.events = this.events.slice(dropped);
      this.log.warn('Telemetry buffer overflow, dropped oldest events', { dropped });
    }
  }

  /**
   * Flush all buffered events.
   *
   * Behavior by configuration:
   * - Endpoint + storage: restore persisted events, send all to endpoint, persist failures
   * - Endpoint only: send buffered events to endpoint, preserve on failure
   * - Storage only: persist buffered events to storage for later delivery
   * - Neither: clear buffer (legacy Phase 1 behavior)
   */
  async flush(): Promise<void> {
    // Restore any previously persisted events
    const persisted = this.restorePersistedEvents();
    if (persisted.length > 0) {
      this.log.info('Restored persisted telemetry events', { count: persisted.length });
      // Merge: persisted (older) first, then in-memory buffer
      this.events = [...persisted, ...this.events];
      // Clear persisted store since we loaded them into memory
      this.clearPersistedEvents();
    }

    const count = this.events.length;
    if (count === 0) {
      this.log.debug('No events to flush');
      return;
    }

    if (!this.endpoint) {
      // No endpoint — persist to storage if available, otherwise drop
      if (this.storage) {
        this.persistEvents(this.events);
        this.log.info('Persisted telemetry events to offline storage', { eventCount: count });
      } else {
        this.log.info('Flushing telemetry buffer (local only, no storage)', { eventCount: count });
      }
      this.events = [];
      return;
    }

    const batch = [...this.events];
    this.log.info('Flushing telemetry to remote endpoint', { eventCount: count });

    try {
      const response = await fetch(this.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.endpoint.authToken}`,
        },
        body: JSON.stringify({ events: batch }),
      });

      if (response.ok) {
        this.events = [];
        this.log.debug('Telemetry flush successful');
        return;
      }

      // Retry once on non-200
      this.log.warn('Telemetry flush failed, retrying', { status: response.status });
      const retryResponse = await fetch(this.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.endpoint.authToken}`,
        },
        body: JSON.stringify({ events: batch }),
      });

      if (retryResponse.ok) {
        this.events = [];
        this.log.debug('Telemetry flush retry successful');
      } else {
        this.log.warn('Telemetry flush retry failed, preserving events', { status: retryResponse.status });
        this.persistEventsOnFailure();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Telemetry flush failed (network error), preserving events', { error: message });
      this.persistEventsOnFailure();
    }
  }

  /**
   * Enable or disable telemetry collection.
   * When disabled, `track()` becomes a no-op but existing buffered
   * events are preserved (call `flush()` to clear them).
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.log.info('Telemetry collection ' + (enabled ? 'enabled' : 'disabled'));
  }

  /**
   * Get a snapshot of all currently buffered events.
   * Returns a shallow copy of the internal array.
   */
  getEvents(): SDKEvent[] {
    return [...this.events];
  }

  /**
   * Get the current number of buffered events.
   */
  getBufferSize(): number {
    return this.events.length;
  }

  /**
   * Check whether telemetry collection is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the count of persisted (offline) events waiting for delivery.
   */
  getPersistedCount(): number {
    return this.restorePersistedEvents().length;
  }

  // ---------------------------------------------------------------------------
  // Private: offline persistence helpers
  // ---------------------------------------------------------------------------

  /** Persist events to offline storage */
  private persistEvents(events: SDKEvent[]): void {
    if (!this.storage) return;

    try {
      // Trim to max persisted size
      const toStore = events.length > MAX_PERSISTED_SIZE
        ? events.slice(events.length - MAX_PERSISTED_SIZE)
        : events;
      this.storage.setString(PERSISTED_EVENTS_KEY, JSON.stringify(toStore));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Failed to persist telemetry events', { error: message });
    }
  }

  /** Restore persisted events from offline storage */
  private restorePersistedEvents(): SDKEvent[] {
    if (!this.storage) return [];

    try {
      const raw = this.storage.getString(PERSISTED_EVENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Clear persisted events from storage */
  private clearPersistedEvents(): void {
    if (!this.storage) return;

    try {
      this.storage.delete(PERSISTED_EVENTS_KEY);
    } catch {
      // Ignore cleanup failures
    }
  }

  /** On flush failure, persist events to storage if available */
  private persistEventsOnFailure(): void {
    if (this.storage && this.events.length > 0) {
      this.persistEvents(this.events);
      this.log.info('Persisted failed flush events to offline storage', { count: this.events.length });
    }
  }
}
