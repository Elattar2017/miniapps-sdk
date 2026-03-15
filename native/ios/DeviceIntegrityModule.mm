/**
 * DeviceIntegrityModule - Objective-C++ bridge for the Swift TurboModule
 *
 * Exposes DeviceIntegrityModule methods to the React Native bridge using
 * RCT_EXTERN_MODULE and RCT_EXTERN_METHOD macros.
 *
 * Methods match the TS spec: NativeDeviceIntegrityModule.ts
 *   attestDevice, verifyAttestation
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DeviceIntegrityModule, NSObject)

// attestDevice(challenge) -> Promise<string>
RCT_EXTERN_METHOD(attestDevice:(NSString *)challenge
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// verifyAttestation(token) -> Promise<boolean>
RCT_EXTERN_METHOD(verifyAttestation:(NSString *)token
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
