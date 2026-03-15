/**
 * Error Boundary - React error boundary for catching render errors
 * @module kernel/errors/ErrorBoundary
 *
 * Catches unhandled errors in the React component tree and displays
 * a fallback UI. Logs errors to the SDK telemetry system.
 *
 * Usage:
 *   <ErrorBoundary fallback={<Text>Something went wrong</Text>} moduleId="com.vendor.app">
 *     <MyComponent />
 *   </ErrorBoundary>
 */

import React from 'react';
import { logger } from '../../utils/logger';

/** Props for the ErrorBoundary component */
export interface ErrorBoundaryProps {
  /** Custom fallback UI to render when an error occurs */
  fallback?: React.ReactNode;
  /** Callback invoked when an error is caught */
  onError?: (error: Error) => void;
  /** Module ID for contextual logging */
  moduleId?: string;
  /** Children to render */
  children?: React.ReactNode;
}

/** Internal state of the ErrorBoundary */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private readonly log = logger.child({
    component: 'ErrorBoundary',
    moduleId: this.props.moduleId,
  });

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to telemetry
    this.log.error('Render error caught by ErrorBoundary', {
      error: error.message,
      componentStack: info.componentStack ?? 'unknown',
      moduleId: this.props.moduleId,
    });

    // Notify parent via callback
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      // Render custom fallback if provided, otherwise render null
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return null;
    }

    return this.props.children;
  }
}
