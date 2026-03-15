/**
 * Telecom Types - Telecom-specific event types and error codes
 * @module types/telecom
 *
 * Generic capabilities (subscription tiers, account identifiers, attestation)
 * have been extracted to kernel.types.ts. This file retains only
 * telecom-specific telemetry event types and error codes.
 */

/** Telecom-specific telemetry event types */
export type TelecomEventType =
  | 'SERVICE_NUMBER_CHANGED'
  | 'PLAN_UPDATED'
  | 'ATTESTATION_SUCCESS'
  | 'ATTESTATION_FAILED'
  | 'EXTERNAL_TOKEN_ACQUIRED'
  | 'EXTERNAL_TOKEN_EXPIRED'
  | 'ROOTED_DEVICE_DETECTED'
  | 'PLAN_UPGRADE'
  | 'PLAN_DOWNGRADE'
  | 'MULTI_LINE_SWITCH';

/** Telecom-specific error codes */
export enum TelecomErrorCode {
  SERVICE_NUMBER_INVALID = 'SDK-3001',
  SERVICE_NUMBER_INACTIVE = 'SDK-3002',
  SERVICE_NUMBER_NOT_FOUND = 'SDK-3003',
  SERVICE_NUMBER_VALIDATION_FAILED = 'SDK-3004',
  ATTESTATION_FAILED = 'SDK-4001',
  ROOTED_DEVICE_DETECTED = 'SDK-4002',
  ATTESTATION_UNSUPPORTED = 'SDK-4003',
  NONCE_REPLAY_DETECTED = 'SDK-4004',
  ATTESTATION_TIMEOUT = 'SDK-4005',
  PLAN_NOT_FOUND = 'SDK-5001',
  PLAN_QUOTA_EXCEEDED = 'SDK-5002',
  PLAN_DOWNGRADE_BLOCKED = 'SDK-5003',
  PLAN_FEATURE_DISABLED = 'SDK-5004',
  EXTERNAL_TOKEN_EXPIRED = 'SDK-6001',
  EXTERNAL_TOKEN_INVALID = 'SDK-6002',
  EXTERNAL_API_UNAUTHORIZED = 'SDK-6003',
}
