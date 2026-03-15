/**
 * NetworkModule - Objective-C++ bridge for the Swift TurboModule
 *
 * Exposes NetworkModule methods to the React Native bridge using
 * RCT_EXTERN_MODULE and RCT_EXTERN_METHOD macros.
 *
 * Methods match the TS spec: NativeNetworkModule.ts
 *   fetch, configurePins
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NetworkModule, NSObject)

// fetch(url, options) -> Promise<string>
RCT_EXTERN_METHOD(fetch:(NSString *)url
                  options:(NSString *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// configurePins(pins) -> Promise<void>
RCT_EXTERN_METHOD(configurePins:(NSString *)pins
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
