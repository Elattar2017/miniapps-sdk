#import <React/RCTLegacyViewManagerInteropComponentView.h>

/**
 * Registers SDK native views for Fabric's legacy interop layer.
 *
 * In RN 0.84 bridgeless mode, RCTViewManager subclasses registered via
 * RCT_EXPORT_MODULE are NOT automatically discovered by Fabric's component
 * registry. This +load hook explicitly tells Fabric to use the interop
 * wrapper for SDKCameraView, allowing the existing RCTViewManager to work.
 */
@interface SDKInteropRegistration : NSObject
@end

@implementation SDKInteropRegistration

+ (void)load {
  [RCTLegacyViewManagerInteropComponentView supportLegacyViewManagerWithName:@"SDKCameraView"];
}

@end
