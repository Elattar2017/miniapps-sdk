/**
 * Navigation Types - SDK Router, intents, routes
 * @module types/navigation
 */

/** SDK Router navigation route */
export interface SDKRoute {
  moduleId: string;
  screenId: string;
  params?: Record<string, unknown>;
  /** Screen transition animation requested by the navigate action */
  transition?: 'slide' | 'fade' | 'none' | 'modal';
}

/** SDK navigation state */
export interface SDKNavigationState {
  routes: SDKRoute[];
  currentIndex: number;
  activeModuleId?: string;
}

/** Intent types for SDK <-> Host communication */
export type IntentType =
  | 'NAVIGATE_TO_HOST_SCREEN'
  | 'OPEN_MODULE'
  | 'SHARE_DATA'
  | 'REQUEST_AUTH_REFRESH'
  | 'NOTIFY_EVENT'
  | 'HOST_LIFECYCLE'
  | 'LOCALE_CHANGE';

/** Intent payload */
export interface Intent<T = unknown> {
  type: IntentType;
  payload: T;
  timestamp: number;
  source: 'sdk' | 'host';
}

/** Intent bridge interface */
export interface IIntentBridge {
  emit<T>(intent: Intent<T>): Promise<void>;
  registerHandler<T>(type: IntentType, handler: (payload: T) => void | Promise<void>): void;
  removeHandler(type: IntentType): void;
}
