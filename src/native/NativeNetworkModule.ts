/**
 * NativeNetworkModule - TurboModule codegen spec for cert-pinned network requests
 * @module native/NativeNetworkModule
 *
 * Provides native-level network requests with certificate pinning enforcement.
 * Uses TrustKit (iOS) / OkHttp CertificatePinner (Android).
 * Parameters and responses are JSON-serialized strings for TurboModule compatibility.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  fetch(url: string, options: string): Promise<string>;
  configurePins(pins: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('NetworkModule');
