/**
 * NativeCryptoModule - TurboModule codegen spec for native crypto operations
 * @module native/NativeCryptoModule
 *
 * React Native New Architecture TurboModule specification.
 * Codegen generates native interface from this TypeScript spec.
 * At runtime, resolves via TurboModuleRegistry or returns null if unavailable.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  hash(data: string, algorithm: string): Promise<string>;
  encrypt(data: string, key: string): Promise<string>;
  decrypt(ciphertext: string, key: string): Promise<string>;
  generateKey(): Promise<string>;
  verifySignature(data: string, signature: string, publicKey: string): Promise<boolean>;
  secureStore(key: string, value: string): Promise<void>;
  secureRetrieve(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('CryptoModule');
