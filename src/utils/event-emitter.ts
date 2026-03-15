/**
 * Typed Event Emitter - Generic typed event system
 * @module utils/event-emitter
 */

import type { ITypedEventEmitter } from '../types';

type Listener<T> = (data: T) => void;

export class TypedEventEmitter<Events extends object>
  implements ITypedEventEmitter<Events>
{
  private listeners: Map<keyof Events, Set<Listener<unknown>>> = new Map();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Listener<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch {
          // Swallow listener errors to prevent cascade failures
        }
      }
    }
  }

  removeAllListeners(event?: keyof Events): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Get the number of listeners for an event */
  listenerCount(event: keyof Events): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /** Check if any listeners are registered for an event */
  hasListeners(event: keyof Events): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }
}
