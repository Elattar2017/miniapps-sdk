/**
 * NativeMediaModule - TurboModule codegen spec for camera & photo library
 * @module native/NativeMediaModule
 *
 * React Native New Architecture TurboModule specification.
 * Codegen generates native interface from this TypeScript spec.
 * At runtime, resolves via TurboModuleRegistry or returns null if unavailable.
 *
 * All complex parameters are JSON-stringified for Codegen compatibility.
 * Results are JSON-stringified MediaResult objects.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Open system camera and capture a photo. Returns JSON-stringified MediaResult. */
  captureImage(options: string): Promise<string>;

  /** Open system photo library picker. Returns JSON-stringified MediaResult or MediaResult[]. */
  pickFromLibrary(options: string): Promise<string>;

  /** Snapshot the current frame from an inline camera_view. Returns JSON-stringified MediaResult. */
  captureFromView(cameraId: string, options: string): Promise<string>;

  /** Check current camera permission status. Returns 'granted' | 'denied' | 'undetermined'. */
  checkCameraPermission(): Promise<string>;

  /** Check current photo library permission status. Returns 'granted' | 'denied' | 'undetermined'. */
  checkLibraryPermission(): Promise<string>;

  /** Request camera permission. Returns 'granted' | 'denied'. */
  requestCameraPermission(): Promise<string>;

  /** Request photo library permission. Returns 'granted' | 'denied'. */
  requestLibraryPermission(): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('MediaModule');
