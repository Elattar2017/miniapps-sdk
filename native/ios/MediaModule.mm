/**
 * MediaModule - Objective-C++ bridge for the Swift TurboModule
 *
 * Exposes MediaModule methods to the React Native bridge using
 * RCT_EXTERN_MODULE and RCT_EXTERN_METHOD macros.
 *
 * Methods match the TS spec: NativeMediaModule.ts
 *   captureImage, pickFromLibrary, captureFromView,
 *   checkCameraPermission, checkLibraryPermission,
 *   requestCameraPermission, requestLibraryPermission
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MediaModule, NSObject)

// captureImage(options: string) -> Promise<string>
RCT_EXTERN_METHOD(captureImage:(NSString *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// pickFromLibrary(options: string) -> Promise<string>
RCT_EXTERN_METHOD(pickFromLibrary:(NSString *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// captureFromView(cameraId: string, options: string) -> Promise<string>
RCT_EXTERN_METHOD(captureFromView:(NSString *)cameraId
                  options:(NSString *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// checkCameraPermission() -> Promise<string>
RCT_EXTERN_METHOD(checkCameraPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// checkLibraryPermission() -> Promise<string>
RCT_EXTERN_METHOD(checkLibraryPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// requestCameraPermission() -> Promise<string>
RCT_EXTERN_METHOD(requestCameraPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// requestLibraryPermission() -> Promise<string>
RCT_EXTERN_METHOD(requestLibraryPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
