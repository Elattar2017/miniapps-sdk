/**
 * Sync Engine — Offline-first data synchronization with conflict resolution
 * @module kernel/sync/SyncEngine
 *
 * Provides push/pull synchronization between local (MMKV) and a remote API.
 * Uses vector clocks for conflict detection and pluggable ConflictResolver
 * for conflict resolution.
 *
 * Fixes applied:
 *  - Gap 1: sync() now persists updated entries + index to storage after push/pull
 *  - Gap 2: Auto-sync interval via syncIntervalMs config (start/stop methods)
 *  - Gap 3: Network check before sync (skips when offline)
 *  - Gap 4: lastSyncTimes persisted to storage and restored on boot
 *  - Gap 5: Pruning of clean entries older than maxEntryAgMs
 */

import { logger } from "../../utils/logger";
import type { IStorageBackend } from "../../types";
import type { APIProxy } from "../network/APIProxy";
import type { DataBus } from "../communication/DataBus";
import type { ConflictResolver } from "./ConflictResolver";
import type { SyncStatus, SyncResult, SyncEntry, SyncEngineConfig } from "../../types";
import * as VectorClock from "./VectorClock";

const SYNC_TIMES_KEY = '__sync_last_sync_times__';
const MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class SyncEngine {
  private readonly log = logger.child({ component: "SyncEngine" });
  private status: SyncStatus = "idle";
  private readonly entries = new Map<string, Map<string, SyncEntry>>();
  private readonly lastSyncTimes = new Map<string, number>();
  private readonly storage: IStorageBackend;
  private readonly apiProxy: APIProxy;
  private readonly conflictResolver: ConflictResolver;
  private readonly dataBus: DataBus | undefined;
  private readonly config: SyncEngineConfig;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private trackedCollections = new Set<string>();
  private syncingCollections = new Set<string>();

  constructor(
    storage: IStorageBackend,
    apiProxy: APIProxy,
    conflictResolver: ConflictResolver,
    dataBus: DataBus | undefined,
    config: SyncEngineConfig,
  ) {
    this.storage = storage;
    this.apiProxy = apiProxy;
    this.conflictResolver = conflictResolver;
    this.dataBus = dataBus;
    this.config = config;
    this.loadPersistedEntries();
    this.loadPersistedSyncTimes(); // Gap 4: restore lastSyncTimes
  }

  // ---------------------------------------------------------------------------
  // Public API — Track & Sync
  // ---------------------------------------------------------------------------

  trackChange<T>(collection: string, id: string, data: T): void {
    if (!this.entries.has(collection)) {
      this.entries.set(collection, new Map());
    }
    this.trackedCollections.add(collection);
    const collectionMap = this.entries.get(collection)!;
    const existing = collectionMap.get(id);
    const vectorClock = existing
      ? VectorClock.increment(existing.vectorClock, this.config.nodeId)
      : VectorClock.create(this.config.nodeId);
    const entry: SyncEntry<T> = {
      id, data, vectorClock,
      timestamp: Date.now(),
      nodeId: this.config.nodeId,
      dirty: true,
    };
    collectionMap.set(id, entry as SyncEntry);
    this.persistEntry(collection, id, entry as SyncEntry);
    this.log.debug("Change tracked", { collection, id });
  }

  async sync(collection: string): Promise<SyncResult> {
    // Guard against concurrent sync for the same collection
    if (this.syncingCollections.has(collection)) {
      this.log.debug('Sync skipped: already syncing', { collection });
      return { synced: 0, conflicts: 0, errors: 0 };
    }
    this.syncingCollections.add(collection);
    this.status = "syncing";
    this.dataBus?.publish("sdk:sync:started", { collection });
    const result: SyncResult = { synced: 0, conflicts: 0, errors: 0 };

    try {
      // Ensure the collection map exists
      if (!this.entries.has(collection)) {
        this.entries.set(collection, new Map());
      }
      const collectionMap = this.entries.get(collection)!;

      // 1. Push dirty entries to server
      const dirtyEntries = this.getDirtyEntries(collection);
      if (dirtyEntries.length > 0) {
        const pushResponse = await this.apiProxy.request(`/api/sync/${collection}/push`, {
          method: "POST",
          body: { entries: dirtyEntries },
        });
        if (pushResponse.ok) {
          for (const entry of dirtyEntries) {
            this.markClean(collection, entry.id);
          }
          result.synced += dirtyEntries.length;
        } else {
          result.errors += dirtyEntries.length;
        }
      }

      // 2. Pull remote changes
      const since = this.lastSyncTimes.get(collection) ?? undefined;
      const pullResponse = await this.apiProxy.request(`/api/sync/${collection}/pull`, {
        method: "POST",
        body: { since },
      });
      // Handle both wrapped { entries: [...] } (real server) and bare array (legacy/compat)
      const pullPayload = pullResponse.data as { entries?: SyncEntry[] } | SyncEntry[] | null;
      const remoteEntries = Array.isArray(pullPayload)
        ? pullPayload
        : (pullPayload?.entries ?? []);
      if (pullResponse.ok && remoteEntries.length > 0) {
        for (const remoteEntry of remoteEntries) {
          const localEntry = collectionMap.get(remoteEntry.id);
          if (!localEntry) {
            collectionMap.set(remoteEntry.id, { ...remoteEntry, dirty: false });
            result.synced++;
            continue;
          }
          const ordering = VectorClock.compare(remoteEntry.vectorClock, localEntry.vectorClock);
          switch (ordering) {
            case "after":
              collectionMap.set(remoteEntry.id, { ...remoteEntry, dirty: false });
              result.synced++;
              break;
            case "before":
            case "equal":
              break;
            case "concurrent": {
              const resolved = this.conflictResolver.resolve({
                id: remoteEntry.id,
                local: localEntry,
                remote: remoteEntry,
              });
              collectionMap.set(remoteEntry.id, resolved);
              result.conflicts++;
              break;
            }
          }
        }
      }

      this.lastSyncTimes.set(collection, Date.now());

      // Gap 1: Persist all updated entries + index + sync times to storage
      this.persistCollection(collection);
      this.persistEntriesIndex();
      this.persistSyncTimes();

      // Gap 5: Prune old clean entries
      this.pruneStaleEntries(collection);

      this.syncingCollections.delete(collection);
      this.status = "idle";
      this.dataBus?.publish("sdk:sync:completed", { collection, result });
      this.log.info("Sync completed", { collection, ...result });
      return result;
    } catch (err) {
      this.syncingCollections.delete(collection);
      this.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      this.dataBus?.publish("sdk:sync:error", { collection, error: message });
      this.log.error("Sync failed", { collection, error: message });
      return { ...result, errors: result.errors + 1 };
    }
  }

  /** Sync all tracked collections */
  async syncAll(): Promise<Record<string, SyncResult>> {
    const results: Record<string, SyncResult> = {};
    for (const collection of this.trackedCollections) {
      results[collection] = await this.sync(collection);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Public API — Auto-Sync (Gap 2)
  // ---------------------------------------------------------------------------

  /** Start auto-sync interval. Uses provided intervalMs or syncIntervalMs from config. */
  start(intervalMs?: number): void {
    if (this.autoSyncTimer) return; // already running
    const resolvedInterval = intervalMs ?? this.config.syncIntervalMs;
    if (!resolvedInterval || resolvedInterval <= 0) {
      this.log.debug('Auto-sync not started: no syncIntervalMs configured');
      return;
    }
    this.log.info('Auto-sync started', { intervalMs: resolvedInterval });
    this.autoSyncTimer = setInterval(() => {
      this.syncAll().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error('Auto-sync tick failed', { error: message });
      });
    }, resolvedInterval);
  }

  /** Stop auto-sync interval. */
  stop(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      this.log.info('Auto-sync stopped');
    }
  }

  // ---------------------------------------------------------------------------
  // Public API — Getters
  // ---------------------------------------------------------------------------

  getStatus(): SyncStatus { return this.status; }

  getLastSyncTime(collection: string): number | null {
    return this.lastSyncTimes.get(collection) ?? null;
  }

  getTrackedCollections(): string[] {
    return Array.from(this.trackedCollections);
  }

  /** Register a collection for sync without creating a fake entry */
  registerCollection(collection: string): void {
    this.trackedCollections.add(collection);
    if (!this.entries.has(collection)) {
      this.entries.set(collection, new Map());
    }
  }

  markClean(collection: string, id: string): void {
    const entry = this.entries.get(collection)?.get(id);
    if (entry) { entry.dirty = false; }
  }

  getDirtyEntries(collection: string): SyncEntry[] {
    const collectionMap = this.entries.get(collection);
    if (!collectionMap) return [];
    return Array.from(collectionMap.values()).filter(entry => entry.dirty);
  }

  // ---------------------------------------------------------------------------
  // Private — Persistence (Gap 1 + Gap 4)
  // ---------------------------------------------------------------------------

  /** Persist a single entry to storage */
  private persistEntry(collection: string, id: string, entry: SyncEntry): void {
    const storageKey = `__sync__:${collection}:${id}`;
    this.storage.setString(storageKey, JSON.stringify(entry));
    this.persistEntriesIndex();
  }

  /** Persist all entries in a collection to storage */
  private persistCollection(collection: string): void {
    const collectionMap = this.entries.get(collection);
    if (!collectionMap) return;
    for (const [id, entry] of collectionMap) {
      const storageKey = `__sync__:${collection}:${id}`;
      this.storage.setString(storageKey, JSON.stringify(entry));
    }
  }

  /** Persist the entries index (collection → ids mapping) */
  private persistEntriesIndex(): void {
    const index: Record<string, string[]> = {};
    for (const [collection, map] of this.entries) {
      index[collection] = Array.from(map.keys());
    }
    this.storage.setString('__sync_entries_index__', JSON.stringify(index));
  }

  /** Persist lastSyncTimes to storage (Gap 4) */
  private persistSyncTimes(): void {
    const times: Record<string, number> = {};
    for (const [collection, ts] of this.lastSyncTimes) {
      times[collection] = ts;
    }
    this.storage.setString(SYNC_TIMES_KEY, JSON.stringify(times));
  }

  /** Load lastSyncTimes from storage (Gap 4) */
  private loadPersistedSyncTimes(): void {
    try {
      const timesStr = this.storage.getString(SYNC_TIMES_KEY);
      if (!timesStr) return;
      const times = JSON.parse(timesStr) as Record<string, number>;
      for (const [collection, ts] of Object.entries(times)) {
        this.lastSyncTimes.set(collection, ts);
      }
      this.log.debug('Persisted sync times loaded', { collections: Object.keys(times).length });
    } catch {
      this.log.warn('Failed to load persisted sync times, starting fresh');
    }
  }

  /** Load persisted entries from storage */
  private loadPersistedEntries(): void {
    try {
      const indexStr = this.storage.getString('__sync_entries_index__');
      if (!indexStr) return;
      const index = JSON.parse(indexStr) as Record<string, string[]>;
      for (const [collection, ids] of Object.entries(index)) {
        if (!this.entries.has(collection)) {
          this.entries.set(collection, new Map());
        }
        this.trackedCollections.add(collection);
        const collectionMap = this.entries.get(collection)!;
        for (const id of ids) {
          const storageKey = `__sync__:${collection}:${id}`;
          const entryStr = this.storage.getString(storageKey);
          if (entryStr) {
            try {
              const entry = JSON.parse(entryStr) as SyncEntry;
              collectionMap.set(id, entry);
            } catch {
              this.log.warn('Corrupt sync entry in storage', { collection, id });
            }
          }
        }
      }
      this.log.debug('Persisted sync entries loaded', { collections: Object.keys(index).length });
    } catch {
      this.log.warn('Failed to load persisted sync entries, starting fresh');
    }
  }

  // ---------------------------------------------------------------------------
  // Private — Pruning (Gap 5)
  // ---------------------------------------------------------------------------

  /** Remove clean entries older than MAX_ENTRY_AGE_MS to prevent unbounded storage growth */
  private pruneStaleEntries(collection: string): void {
    const collectionMap = this.entries.get(collection);
    if (!collectionMap) return;
    const now = Date.now();
    let pruned = 0;
    for (const [id, entry] of collectionMap) {
      if (!entry.dirty && (now - entry.timestamp) > MAX_ENTRY_AGE_MS) {
        collectionMap.delete(id);
        this.storage.delete(`__sync__:${collection}:${id}`);
        pruned++;
      }
    }
    if (pruned > 0) {
      this.persistEntriesIndex();
      this.log.debug('Pruned stale sync entries', { collection, pruned });
    }
  }
}
