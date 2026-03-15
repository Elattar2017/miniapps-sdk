/**
 * Kernel States - FSM state constants and valid transitions
 * @module constants/kernel-states
 */

import type { KernelState } from '../types';

/** Valid state transitions map */
export const KERNEL_STATE_TRANSITIONS: Record<KernelState, KernelState[]> = {
  IDLE: ['BOOT'],
  BOOT: ['AUTH', 'ERROR'],
  AUTH: ['POLICY_SYNC', 'ERROR'],
  POLICY_SYNC: ['MODULE_SYNC', 'ERROR'],
  MODULE_SYNC: ['ZONE_RENDER', 'ERROR'],
  ZONE_RENDER: ['ACTIVE', 'ERROR'],
  ACTIVE: ['SUSPEND', 'SHUTDOWN', 'ERROR'],
  SUSPEND: ['RESUME', 'SHUTDOWN', 'ERROR'],
  RESUME: ['ACTIVE', 'ERROR'],
  SHUTDOWN: ['IDLE'],
  ERROR: ['BOOT', 'SHUTDOWN'],
};

/** Check if a state transition is valid */
export function isValidTransition(from: KernelState, to: KernelState): boolean {
  const validTargets = KERNEL_STATE_TRANSITIONS[from];
  return validTargets.includes(to);
}

/** States that represent the kernel as operational */
export const OPERATIONAL_STATES: ReadonlySet<KernelState> = new Set([
  'ACTIVE',
  'SUSPEND',
  'RESUME',
]);

/** States that represent the kernel as booting */
export const BOOT_STATES: ReadonlySet<KernelState> = new Set([
  'BOOT',
  'AUTH',
  'POLICY_SYNC',
  'MODULE_SYNC',
  'ZONE_RENDER',
]);
