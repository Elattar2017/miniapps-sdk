/**
 * Sync Engine
 * @module kernel/sync/SyncEngine
 */

import { logger } from "../../utils/logger";
import type { IStorageBackend } from "../../types";
import type { APIProxy } from "../network/APIProxy";
import type { DataBus } from "../communication/DataBus";
import type { ConflictResolver } from "./ConflictResolver";
import type { SyncStatus, SyncResult, SyncEntry, SyncEngineConfig } from "../../types";
import * as VectorClock from "./VectorClock";
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
  }
  trackChange<T>(collection: string, id: string, data: T): void {
    if (!this.entries.has(collection)) {
      this.entries.set(collection, new Map());
    }
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
    this.status = "syncing";
    this.dataBus?.publish("sdk:sync:started", { collection });
    const result: SyncResult = { synced: 0, conflicts: 0, errors: 0 };

    try {
      const collectionMap = this.entries.get(collection) ?? new Map<string, SyncEntry>();
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
            if (!this.entries.has(collection)) {
              this.entries.set(collection, new Map());
            }
            this.entries.get(collection)!.set(remoteEntry.id, { ...remoteEntry, dirty: false });
            result.synced++;
            continue;
          }
          const ordering = VectorClock.compare(remoteEntry.vectorClock, localEntry.vectorClock);
          switch (ordering) {
            case "after":
              collectionMap.set(remoteEntry.id, { ...remoteEntry, dirty: false });
              result.synced++;
              break;            case "before":
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
      this.status = "idle";
      this.dataBus?.publish("sdk:sync:completed", { collection, result });
      this.log.info("Sync completed", { collection, ...result });
      return result;
    } catch (err) {
      this.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      this.dataBus?.publish("sdk:sync:error", { collection, error: message });
      this.log.error("Sync failed", { collection, error: message });
      return { synced: 0, conflicts: 0, errors: result.errors + 1 };
    }
  }
  getStatus(): SyncStatus { return this.status; }

  getLastSyncTime(collection: string): number | null {
    return this.lastSyncTimes.get(collection) ?? null;
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

  private persistEntry(collection: string, id: string, entry: SyncEntry): void {
    const storageKey = `__sync__:${collection}:${id}`;
    this.storage.setString(storageKey, JSON.stringify(entry));
    this.persistEntriesIndex();
  }

  private persistEntriesIndex(): void {
    const index: Record<string, string[]> = {};
    for (const [collection, map] of this.entries) {
      index[collection] = Array.from(map.keys());
    }
    this.storage.setString('__sync_entries_index__', JSON.stringify(index));
  }

  private loadPersistedEntries(): void {
    try {
      const indexStr = this.storage.getString('__sync_entries_index__');
      if (!indexStr) return;
      const index = JSON.parse(indexStr) as Record<string, string[]>;
      for (const [collection, ids] of Object.entries(index)) {
        if (!this.entries.has(collection)) {
          this.entries.set(collection, new Map());
        }
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
}
