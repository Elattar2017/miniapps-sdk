/**
 * NativeDeviceIntegrityModule - TurboModule codegen spec for device attestation
 * @module native/NativeDeviceIntegrityModule
 *
 * Provides device integrity verification via platform attestation:
 * iOS: App Attest, Android: Play Integrity
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  attestDevice(challenge: string): Promise<string>;
  verifyAttestation(token: string): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('DeviceIntegrityModule');
