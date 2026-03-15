/**
 * CryptoModule - Objective-C++ bridge for the Swift TurboModule
 *
 * Exposes CryptoModule methods to the React Native bridge using
 * RCT_EXTERN_MODULE and RCT_EXTERN_METHOD macros.
 *
 * Methods match the TS spec: NativeCryptoModule.ts
 *   hash, encrypt, decrypt, generateKey, verifySignature,
 *   secureStore, secureRetrieve, secureDelete
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(CryptoModule, NSObject)

// hash(data, algorithm) -> Promise<string>
RCT_EXTERN_METHOD(hash:(NSString *)data
                  algorithm:(NSString *)algorithm
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// encrypt(data, key) -> Promise<string>
RCT_EXTERN_METHOD(encrypt:(NSString *)data
                  key:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// decrypt(ciphertext, key) -> Promise<string>
RCT_EXTERN_METHOD(decrypt:(NSString *)ciphertext
                  key:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// generateKey() -> Promise<string>
RCT_EXTERN_METHOD(generateKey:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// verifySignature(data, signature, publicKey) -> Promise<boolean>
RCT_EXTERN_METHOD(verifySignature:(NSString *)data
                  signature:(NSString *)signature
                  publicKey:(NSString *)publicKey
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// secureStore(key, value) -> Promise<void>
RCT_EXTERN_METHOD(secureStore:(NSString *)key
                  value:(NSString *)value
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// secureRetrieve(key) -> Promise<string | null>
RCT_EXTERN_METHOD(secureRetrieve:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// secureDelete(key) -> Promise<void>
RCT_EXTERN_METHOD(secureDelete:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
