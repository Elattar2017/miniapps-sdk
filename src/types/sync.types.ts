/**
 * Sync Types - Offline sync, vector clocks, conflict resolution
 * @module types/sync
 */

/** Vector clock map: nodeId -> logical counter */
export type VectorClockMap = Record<string, number>;

/** A sync entry wrapping data with causality metadata */
export interface SyncEntry<T = unknown> {
  id: string;
  data: T;
  vectorClock: VectorClockMap;
  timestamp: number;
  nodeId: string;
  dirty: boolean;
}

/** Available conflict resolution strategies */
export type ConflictStrategy =
  | 'server-wins'
  | 'client-wins'
  | 'latest-timestamp'
  | 'manual-resolution';

/** Configuration for the conflict resolution subsystem */
export interface ConflictResolutionConfig {
  defaultStrategy: ConflictStrategy;
  fieldOverrides?: Record<string, ConflictStrategy>;
  maxConflictQueueSize: number;
  conflictTTL: number; // seconds before auto-resolve via default strategy
}

/** A detected sync conflict between local and remote entries */
export interface SyncConflict<T = unknown> {
  id: string;
  local: SyncEntry<T>;
  remote: SyncEntry<T>;
  field?: string;
  resolvedAt?: number;
  resolution?: 'local' | 'remote' | 'manual';
}

/** Current status of the sync engine */
export type SyncStatus = 'idle' | 'syncing' | 'conflict' | 'error';

/** Result summary from a sync operation */
export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
}

/** Configuration for the sync engine */
export interface SyncEngineConfig {
  nodeId: string;
  syncIntervalMs?: number;
  maxRetries?: number;
}
