/**
 * Intent Bridge - Bidirectional SDK <-> Host communication
 * @module kernel/communication/IntentBridge
 *
 * Phase 1 implementation: In-memory handler registry for intents.
 * Intents are the mechanism through which the SDK and the host application
 * exchange navigation requests, data-sharing events, lifecycle signals, etc.
 *
 * Each intent type can have exactly one registered handler.
 * All emitted intents are logged for audit purposes.
 */

import { logger } from '../../utils/logger';
import type { Intent, IntentType, IIntentBridge } from '../../types';

/** Handler function for a specific intent type */
type IntentHandlerFn<T = unknown> = (payload: T) => void | Promise<void>;

export class IntentBridge implements IIntentBridge {
  private readonly log = logger.child({ component: 'IntentBridge' });
  private readonly handlers: Map<IntentType, IntentHandlerFn> = new Map();

  /**
   * Register a handler for a specific intent type.
   * Only one handler can exist per intent type; registering a second
   * handler replaces the first.
   */
  registerHandler<T>(type: IntentType, handler: (payload: T) => void | Promise<void>): void {
    if (this.handlers.has(type)) {
      this.log.warn('Replacing existing intent handler', { intentType: type });
    }

    this.handlers.set(type, handler as IntentHandlerFn);
    this.log.debug('Intent handler registered', { intentType: type });
  }

  /**
   * Emit an intent to be handled by the registered handler.
   * If no handler is registered for the intent type, a warning is logged
   * and the intent is silently dropped.
   */
  async emit<T>(intent: Intent<T>): Promise<void> {
    this.log.info('Intent emitted', {
      intentType: intent.type,
      source: intent.source,
      timestamp: intent.timestamp,
    });

    const handler = this.handlers.get(intent.type);
    if (!handler) {
      this.log.warn('No handler registered for intent type', { intentType: intent.type });
      return;
    }

    try {
      await handler(intent.payload);
      this.log.debug('Intent handled successfully', { intentType: intent.type });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error('Intent handler threw an error', {
        intentType: intent.type,
        error: message,
      });
    }
  }

  /**
   * Remove the handler registered for a specific intent type.
   */
  removeHandler(type: IntentType): void {
    const removed = this.handlers.delete(type);
    if (removed) {
      this.log.debug('Intent handler removed', { intentType: type });
    } else {
      this.log.warn('No intent handler found to remove', { intentType: type });
    }
  }

  /**
   * Check whether a handler is registered for a given intent type.
   */
  hasHandler(type: IntentType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Remove all registered intent handlers.
   */
  removeAllHandlers(): void {
    this.handlers.clear();
    this.log.debug('All intent handlers removed');
  }
}
