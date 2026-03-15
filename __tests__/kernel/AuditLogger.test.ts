/**
 * AuditLogger Test Suite
 *
 * Tests for the structured audit trail wrapper around TelemetryCollector.
 * Verifies that each audit method produces the expected SDKEvent with
 * the correct auditType, tenantId, userId, and method-specific data.
 */

import { AuditLogger } from '../../src/kernel/telemetry/AuditLogger';
import type { SDKEvent } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Create a mock TelemetryCollector with a track spy */
function createMockTelemetry() {
  return {
    track: jest.fn(),
    flush: jest.fn(),
    setEnabled: jest.fn(),
    setEndpoint: jest.fn(),
    getEvents: jest.fn(),
    getBufferSize: jest.fn(),
    isEnabled: jest.fn(),
  };
}

describe('AuditLogger', () => {
  const tenantId = 'tenant-abc';
  const userId = 'user-xyz';
  let mockTelemetry: ReturnType<typeof createMockTelemetry>;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    mockTelemetry = createMockTelemetry();
    auditLogger = new AuditLogger(mockTelemetry as any, tenantId, userId);
  });

  // ---------------------------------------------------------------------------
  // logModuleLoad()
  // ---------------------------------------------------------------------------

  describe('logModuleLoad()', () => {
    it('calls track with type security_event and auditType module_load', () => {
      auditLogger.logModuleLoad('mod-1', '1.0.0', true);

      expect(mockTelemetry.track).toHaveBeenCalledTimes(1);
      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('module_load');
    });

    it('includes moduleId, version, and success in data', () => {
      auditLogger.logModuleLoad('mod-2', '2.5.0', false);

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.data.moduleId).toBe('mod-2');
      expect(event.data.version).toBe('2.5.0');
      expect(event.data.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // logSignatureVerification()
  // ---------------------------------------------------------------------------

  describe('logSignatureVerification()', () => {
    it('produces correct event with moduleId, valid, and algorithm', () => {
      auditLogger.logSignatureVerification('mod-3', true, 'Ed25519');

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('signature_verification');
      expect(event.data.moduleId).toBe('mod-3');
      expect(event.data.valid).toBe(true);
      expect(event.data.algorithm).toBe('Ed25519');
    });

    it('works without algorithm (undefined)', () => {
      auditLogger.logSignatureVerification('mod-4', false);

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.data.algorithm).toBeUndefined();
      expect(event.data.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // logPolicyEvaluation()
  // ---------------------------------------------------------------------------

  describe('logPolicyEvaluation()', () => {
    it('produces correct event with resource, action, allowed, userId', () => {
      auditLogger.logPolicyEvaluation('module:budget', 'read', true, 'user-eval');

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('policy_evaluation');
      expect(event.data.resource).toBe('module:budget');
      expect(event.data.action).toBe('read');
      expect(event.data.allowed).toBe(true);
      // Note: userId in data is the one passed to the method, not the constructor userId
      expect(event.data.userId).toBe('user-eval');
    });
  });

  // ---------------------------------------------------------------------------
  // logTokenRefresh()
  // ---------------------------------------------------------------------------

  describe('logTokenRefresh()', () => {
    it('produces correct event with success and attempt', () => {
      auditLogger.logTokenRefresh(true, 2);

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('token_refresh');
      expect(event.data.success).toBe(true);
      expect(event.data.attempt).toBe(2);
    });

    it('works without attempt (undefined)', () => {
      auditLogger.logTokenRefresh(false);

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.data.success).toBe(false);
      expect(event.data.attempt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // logErrorRecovery()
  // ---------------------------------------------------------------------------

  describe('logErrorRecovery()', () => {
    it('produces correct event with strategy, success, moduleId', () => {
      auditLogger.logErrorRecovery('circuit-breaker', true, 'mod-5');

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('error_recovery');
      expect(event.data.strategy).toBe('circuit-breaker');
      expect(event.data.success).toBe(true);
      expect(event.data.moduleId).toBe('mod-5');
    });
  });

  // ---------------------------------------------------------------------------
  // logSecurityEvent()
  // ---------------------------------------------------------------------------

  describe('logSecurityEvent()', () => {
    it('passes through eventType and details', () => {
      const details = { ip: '10.0.0.1', reason: 'brute_force_detected' };
      auditLogger.logSecurityEvent('unauthorized_access', details);

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.type).toBe('security_event');
      expect(event.data.auditType).toBe('unauthorized_access');
      expect(event.data.ip).toBe('10.0.0.1');
      expect(event.data.reason).toBe('brute_force_detected');
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-cutting concerns
  // ---------------------------------------------------------------------------

  describe('cross-cutting', () => {
    it('all events include tenantId and userId from constructor', () => {
      auditLogger.logModuleLoad('mod-x', '1.0.0', true);
      auditLogger.logTokenRefresh(true);
      auditLogger.logSecurityEvent('test', {});

      const calls = mockTelemetry.track.mock.calls;
      for (const [event] of calls) {
        expect(event.tenantId).toBe(tenantId);
        expect(event.userId).toBe(userId);
        expect(event.data.tenantId).toBe(tenantId);
        expect(event.data.userId).toBe(userId);
      }
    });

    it('all events have timestamp set', () => {
      const before = Date.now();
      auditLogger.logModuleLoad('mod-x', '1.0.0', true);
      const after = Date.now();

      const event: SDKEvent = mockTelemetry.track.mock.calls[0][0];
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
