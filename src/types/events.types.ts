/**
 * Event Types - SDK events, telemetry, typed event emitter
 * @module types/events
 */

/** SDK event types */
export type SDKEventType =
  | 'kernel_state_change'
  | 'module_loaded'
  | 'module_opened'
  | 'module_closed'
  | 'module_error'
  | 'screen_viewed'
  | 'api_request'
  | 'api_response'
  | 'policy_denied'
  | 'security_event'
  | 'performance_metric'
  | 'error';

/** SDK event payload */
export interface SDKEvent {
  type: SDKEventType;
  timestamp: number;
  moduleId?: string;
  tenantId: string;
  userId: string;
  data: Record<string, unknown>;
}

/** Telemetry collector interface */
export interface ITelemetryCollector {
  track(event: SDKEvent): void;
  flush(): Promise<void>;
  setEnabled(enabled: boolean): void;
}

/** Typed event emitter interface */
export interface ITypedEventEmitter<Events extends object> {
  on<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): void;
  off<K extends keyof Events>(event: K, listener: (data: Events[K]) => void): void;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
  removeAllListeners(event?: keyof Events): void;
}

/** SDK-specific event map */
export interface SDKEventMap {
  kernel_state_change: { from: string; to: string };
  module_loaded: { moduleId: string; duration: number };
  module_opened: { moduleId: string };
  module_closed: { moduleId: string };
  module_error: { moduleId: string; error: string };
  screen_viewed: { moduleId: string; screenId: string };
  performance_metric: { label: string; duration: number; budget: number };
  error: { code: string; message: string; context?: Record<string, unknown> };
}
