/**
 * Conflict Resolver - Strategy-based conflict resolution for offline sync
 * @module kernel/sync/ConflictResolver
 *
 * Supports four strategies:
 *   server-wins       - Remote entry always wins
 *   client-wins       - Local entry always wins
 *   latest-timestamp  - Entry with newest timestamp wins (ties break to remote)
 *   manual-resolution - Conflict queued for user resolution; local returned temporarily
 *
 * Publishes DataBus events:
 *   sdk:sync:conflict:detected  - When a conflict is identified
 *   sdk:sync:conflict:resolved  - When a conflict is resolved (auto or manual)
 */

import { logger } from '../../utils/logger';
import type { DataBus } from '../communication/DataBus';
import type {
  SyncConflict,
  SyncEntry,
  ConflictResolutionConfig,
  ConflictStrategy,
} from '../../types';

export class ConflictResolver {
  private readonly log = logger.child({ component: 'ConflictResolver' });
  private readonly config: ConflictResolutionConfig;
  private readonly dataBus: DataBus | undefined;
  private readonly pendingConflicts = new Map<string, SyncConflict>();

  constructor(config: ConflictResolutionConfig, dataBus?: DataBus) {
    this.config = config;
    this.dataBus = dataBus;
  }

  /**
   * Resolve a sync conflict using the configured strategy.
   * Returns the winning SyncEntry.
   */
  resolve<T>(conflict: SyncConflict<T>): SyncEntry<T> {
    const strategy = conflict.field
      ? this.getFieldStrategy(conflict.field)
      : this.config.defaultStrategy;

    this.dataBus?.publish('sdk:sync:conflict:detected', {
      id: conflict.id,
      strategy,
      field: conflict.field,
    });

    let winner: SyncEntry<T>;

    switch (strategy) {
      case 'server-wins':
        winner = { ...conflict.remote, dirty: false };
        break;

      case 'client-wins':
        winner = { ...conflict.local, dirty: false };
        break;

      case 'latest-timestamp':
        // Tie-breaks to remote (server)
        winner = conflict.local.timestamp > conflict.remote.timestamp
          ? { ...conflict.local, dirty: false }
          : { ...conflict.remote, dirty: false };
        break;

      case 'manual-resolution':
        this.queueConflict(conflict);
        // Return local temporarily while awaiting manual resolution
        return { ...conflict.local };

      default:
        // Fallback to remote for unknown strategies
        winner = { ...conflict.remote, dirty: false };
        break;
    }

    this.dataBus?.publish('sdk:sync:conflict:resolved', {
      id: conflict.id,
      strategy,
      resolution: winner === conflict.local || winner.nodeId === conflict.local.nodeId
        ? 'local'
        : 'remote',
    });

    this.log.info('Conflict resolved', { id: conflict.id, strategy });
    return winner;
  }

  /**
   * Get the strategy for a specific field, falling back to the default.
   */
  getFieldStrategy(field: string): ConflictStrategy {
    return this.config.fieldOverrides?.[field] ?? this.config.defaultStrategy;
  }

  /**
   * Return all pending (unresolved manual) conflicts.
   */
  getPendingConflicts(): SyncConflict[] {
    this.pruneExpiredConflicts();
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * Manually resolve a queued conflict by choosing local or remote.
   * Returns the winning entry, or null if the conflict was not found.
   */
  resolveManually(conflictId: string, resolution: 'local' | 'remote'): SyncEntry | null {
    const conflict = this.pendingConflicts.get(conflictId);
    if (!conflict) return null;

    const winner = resolution === 'local'
      ? { ...conflict.local, dirty: false }
      : { ...conflict.remote, dirty: false };

    conflict.resolvedAt = Date.now();
    conflict.resolution = resolution;
    this.pendingConflicts.delete(conflictId);

    this.dataBus?.publish('sdk:sync:conflict:resolved', {
      id: conflictId,
      strategy: 'manual-resolution',
      resolution,
    });

    this.log.info('Conflict resolved manually', { id: conflictId, resolution });
    return winner;
  }

  /**
   * Return the number of pending (unresolved) conflicts.
   */
  getConflictCount(): number {
    return this.pendingConflicts.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Queue a conflict for manual resolution.
   * Enforces maxConflictQueueSize by dropping the oldest entries.
   */
  private queueConflict<T>(conflict: SyncConflict<T>): void {
    // Enforce max queue size - drop oldest when exceeded
    while (this.pendingConflicts.size >= this.config.maxConflictQueueSize) {
      const oldestKey = this.pendingConflicts.keys().next().value as string;
      this.pendingConflicts.delete(oldestKey);
      this.log.warn('Conflict queue full, dropping oldest conflict', { droppedId: oldestKey });
    }

    this.pendingConflicts.set(conflict.id, conflict as SyncConflict);
    this.log.debug('Conflict queued for manual resolution', { id: conflict.id });
  }

  /**
   * Remove conflicts that have exceeded the configured TTL.
   * Expired conflicts are auto-resolved using the default strategy.
   */
  private pruneExpiredConflicts(): void {
    const now = Date.now();
    const ttlMs = this.config.conflictTTL * 1000;

    for (const [id, conflict] of this.pendingConflicts) {
      const age = now - conflict.local.timestamp;
      if (age > ttlMs) {
        this.pendingConflicts.delete(id);
        this.log.debug('Expired conflict auto-pruned', { id });
      }
    }
  }
}
