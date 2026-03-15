/**
 * CameraViewManager - Objective-C++ bridge for the native camera view
 *
 * Registers SDKCameraView as a native Fabric component via RCT_EXPORT_VIEW_PROPERTY.
 *
 * Props:
 *   cameraId: NSString — unique ID for captureFromView lookups
 *   cameraFacing: NSString — 'front' or 'back'
 *   mirror: BOOL — mirror the camera feed
 */

#import <React/RCTViewManager.h>

@interface SDKCameraViewManager : RCTViewManager
@end

@implementation SDKCameraViewManager

RCT_EXPORT_MODULE(SDKCameraView)

- (UIView *)view {
  // SDKCameraView is defined in CameraViewManager.swift
  Class cls = NSClassFromString(@"SDKCameraView");
  if (cls) {
    return [[cls alloc] init];
  }
  return [[UIView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(cameraId, NSString)
RCT_EXPORT_VIEW_PROPERTY(cameraFacing, NSString)
RCT_EXPORT_VIEW_PROPERTY(mirror, BOOL)

@end
