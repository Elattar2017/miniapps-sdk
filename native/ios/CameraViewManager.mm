/**
 * CameraViewManager - Objective-C++ bridge for the native camera view
 *
 * Registers SDKCameraView as a native component via RCTViewManager (legacy interop).
 * On New Architecture, this is wrapped by RCTLegacyViewManagerInteropComponentView.
 */

#import <React/RCTViewManager.h>
#import <React/RCTLog.h>

// Forward declare — the actual class is in Swift with @objc(SDKCameraView)
@interface SDKCameraView : UIView
@property (nonatomic, copy, nullable) NSString *cameraId;
@property (nonatomic, copy, nullable) NSString *cameraFacing;
@property (nonatomic, assign) BOOL mirror;
@end

@interface SDKCameraViewManager : RCTViewManager
@end

@implementation SDKCameraViewManager

RCT_EXPORT_MODULE(SDKCameraView)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (UIView *)view {
  // Try @objc(SDKCameraView) name first, then module-qualified names
  Class cls = NSClassFromString(@"SDKCameraView");
  if (!cls) {
    // Try common host app module names
    NSString *moduleName = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"CFBundleExecutable"];
    if (moduleName) {
      NSString *qualifiedName = [NSString stringWithFormat:@"%@.SDKCameraView", moduleName];
      cls = NSClassFromString(qualifiedName);
    }
  }

  if (cls) {
    RCTLogInfo(@"SDKCameraView class found: %@", cls);
    return [[cls alloc] init];
  }

  RCTLogWarn(@"SDKCameraView Swift class not found, returning placeholder");
  UIView *placeholder = [[UIView alloc] init];
  placeholder.backgroundColor = [UIColor colorWithRed:0.1 green:0.1 blue:0.18 alpha:1.0];
  return placeholder;
}

RCT_EXPORT_VIEW_PROPERTY(cameraId, NSString)
RCT_EXPORT_VIEW_PROPERTY(cameraFacing, NSString)
RCT_EXPORT_VIEW_PROPERTY(mirror, BOOL)

@end
