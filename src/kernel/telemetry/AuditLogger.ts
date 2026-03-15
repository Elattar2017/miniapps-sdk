/**
 * Audit Logger - Structured audit trail for security-relevant SDK events
 * @module kernel/telemetry/AuditLogger
 *
 * Wraps the TelemetryCollector to emit standardised audit events for
 * module loads, signature verifications, policy evaluations, token
 * refreshes, error recovery, and generic security events.
 *
 * All events are emitted as SDKEventType 'security_event' with an
 * `auditType` discriminator in the data payload.
 */

import type { TelemetryCollector } from './TelemetryCollector';

export class AuditLogger {
  private readonly telemetry: TelemetryCollector;
  private readonly tenantId: string;
  private readonly userId: string;

  constructor(telemetry: TelemetryCollector, tenantId: string, userId: string) {
    this.telemetry = telemetry;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  logModuleLoad(moduleId: string, version: string, success: boolean): void {
    this.trackAuditEvent('module_load', { moduleId, version, success });
  }

  logSignatureVerification(moduleId: string, valid: boolean, algorithm?: string): void {
    this.trackAuditEvent('signature_verification', { moduleId, valid, algorithm });
  }

  logPolicyEvaluation(resource: string, action: string, allowed: boolean, userId: string): void {
    this.trackAuditEvent('policy_evaluation', { resource, action, allowed, userId });
  }

  logTokenRefresh(success: boolean, attempt?: number): void {
    this.trackAuditEvent('token_refresh', { success, attempt });
  }

  logErrorRecovery(strategy: string, success: boolean, moduleId?: string): void {
    this.trackAuditEvent('error_recovery', { strategy, success, moduleId });
  }

  logSecurityEvent(eventType: string, details: Record<string, unknown>): void {
    this.trackAuditEvent(eventType, details);
  }

  private trackAuditEvent(eventType: string, data: Record<string, unknown>): void {
    this.telemetry.track({
      type: 'security_event',
      timestamp: Date.now(),
      tenantId: this.tenantId,
      userId: this.userId,
      data: {
        auditType: eventType,
        tenantId: this.tenantId,
        userId: this.userId,
        ...data,
      },
    });
  }
}
