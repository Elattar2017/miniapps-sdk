/**
 * MediaModule - iOS TurboModule for camera capture and photo library access
 *
 * Provides:
 * - captureImage: Opens UIImagePickerController in camera mode
 * - pickFromLibrary: Opens PHPickerViewController for photo library selection
 * - captureFromView: Snapshots an inline SDKCameraView by its cameraId
 * - Permission checking/requesting for camera and photo library
 *
 * Options and results are JSON-stringified for Codegen compatibility.
 * Matches TurboModule spec: NativeMediaModule.ts
 * Registered name: "MediaModule"
 */

import Foundation
import UIKit
import Photos
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

@objc(MediaModule)
class MediaModule: NSObject {

  // MARK: - Module Registration

  @objc
  static func moduleName() -> String {
    return "MediaModule"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  // MARK: - Pending promise storage (for delegate callbacks)

  private var pendingResolve: RCTPromiseResolveBlock?
  private var pendingReject: RCTPromiseRejectBlock?
  private var pendingOptions: [String: Any] = [:]

  // MARK: - Capture Image (System Camera)

  @objc
  func captureImage(
    _ optionsStr: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      reject("MEDIA_ERROR", "Camera is not available on this device", nil)
      return
    }

    guard let options = parseOptions(optionsStr) else {
      reject("MEDIA_ERROR", "Invalid options JSON", nil)
      return
    }

    self.pendingResolve = resolve
    self.pendingReject = reject
    self.pendingOptions = options

    DispatchQueue.main.async {
      let picker = UIImagePickerController()
      picker.sourceType = .camera
      picker.delegate = self
      picker.allowsEditing = false

      // Apply MIME filter
      if let accept = options["accept"] as? String, accept.contains("video") {
        picker.mediaTypes = ["public.image", "public.movie"]
      } else {
        picker.mediaTypes = ["public.image"]
      }

      guard let rootVC = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
        reject("MEDIA_ERROR", "No root view controller available", nil)
        return
      }

      rootVC.present(picker, animated: true)
    }
  }

  // MARK: - Pick From Library (PHPicker)

  @objc
  func pickFromLibrary(
    _ optionsStr: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let options = parseOptions(optionsStr) else {
      reject("MEDIA_ERROR", "Invalid options JSON", nil)
      return
    }

    self.pendingResolve = resolve
    self.pendingReject = reject
    self.pendingOptions = options

    DispatchQueue.main.async {
      if #available(iOS 14.0, *) {
        var config = PHPickerConfiguration()
        let multiple = options["multiple"] as? Bool ?? false
        let maxCount = options["maxCount"] as? Int ?? 10
        config.selectionLimit = multiple ? maxCount : 1
        config.filter = .images

        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self

        guard let rootVC = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
          reject("MEDIA_ERROR", "No root view controller available", nil)
          return
        }

        rootVC.present(picker, animated: true)
      } else {
        // Fallback to UIImagePickerController for iOS < 14
        let picker = UIImagePickerController()
        picker.sourceType = .photoLibrary
        picker.delegate = self
        picker.allowsEditing = false

        guard let rootVC = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first?.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
          reject("MEDIA_ERROR", "No root view controller available", nil)
          return
        }

        rootVC.present(picker, animated: true)
      }
    }
  }

  // MARK: - Capture From View

  @objc
  func captureFromView(
    _ cameraId: String,
    options optionsStr: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !cameraId.isEmpty else {
      reject("MEDIA_ERROR", "captureFromView requires a non-empty cameraId", nil)
      return
    }

    guard let options = parseOptions(optionsStr) else {
      reject("MEDIA_ERROR", "Invalid options JSON", nil)
      return
    }

    // Look up the registered camera view by ID and capture its current frame
    DispatchQueue.main.async {
      guard let cameraView = CameraViewManager.shared.getView(byId: cameraId) else {
        reject("MEDIA_ERROR", "Camera view with id '\(cameraId)' not found", nil)
        return
      }

      cameraView.captureFrame { image, error in
        if let error = error {
          reject("MEDIA_ERROR", "Failed to capture frame: \(error.localizedDescription)", error)
          return
        }

        guard let image = image else {
          reject("MEDIA_ERROR", "Captured frame was nil", nil)
          return
        }

        let quality = options["quality"] as? Double ?? 0.8
        // NSNumber from JSONSerialization may not cast directly to Int — use intValue
        let maxDimension = (options["maxDimension"] as? NSNumber)?.intValue
        let includeBase64 = (options["includeBase64"] as? NSNumber)?.boolValue ?? options["includeBase64"] as? Bool ?? false

        let processedImage = self.resizeIfNeeded(image, maxDimension: maxDimension)
        let result = self.buildMediaResult(from: processedImage, quality: quality, includeBase64: includeBase64, source: "viewCapture")
        resolve(result)
      }
    }
  }

  // MARK: - Permissions

  @objc
  func checkCameraPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let status = AVCaptureDevice.authorizationStatus(for: .video)
    resolve(permissionString(from: status))
  }

  @objc
  func checkLibraryPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let status = PHPhotoLibrary.authorizationStatus()
    resolve(photoPermissionString(from: status))
  }

  @objc
  func requestCameraPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    AVCaptureDevice.requestAccess(for: .video) { granted in
      resolve(granted ? "granted" : "denied")
    }
  }

  @objc
  func requestLibraryPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 14.0, *) {
      PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
        resolve(self.photoPermissionString(from: status))
      }
    } else {
      PHPhotoLibrary.requestAuthorization { status in
        resolve(self.photoPermissionString(from: status))
      }
    }
  }

  // MARK: - Helpers

  private func parseOptions(_ json: String) -> [String: Any]? {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    return obj
  }

  private func permissionString(from status: AVAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  private func photoPermissionString(from status: PHAuthorizationStatus) -> String {
    switch status {
    case .authorized, .limited: return "granted"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "undetermined"
    @unknown default: return "undetermined"
    }
  }

  private func resizeIfNeeded(_ image: UIImage, maxDimension: Int?) -> UIImage {
    guard let maxDim = maxDimension else { return image }
    let maxCGFloat = CGFloat(maxDim)
    let size = image.size

    if size.width <= maxCGFloat && size.height <= maxCGFloat {
      return image
    }

    let ratio = min(maxCGFloat / size.width, maxCGFloat / size.height)
    let newSize = CGSize(width: size.width * ratio, height: size.height * ratio)

    UIGraphicsBeginImageContextWithOptions(newSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: newSize))
    let resized = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()

    return resized ?? image
  }

  fileprivate func buildMediaResult(from image: UIImage, quality: Double, includeBase64: Bool, source: String) -> String {
    let jpegData = image.jpegData(compressionQuality: CGFloat(quality))
    let fileName = "\(source)_\(Int(Date().timeIntervalSince1970 * 1000)).jpg"

    // Save to temp directory
    let tempDir = FileManager.default.temporaryDirectory
    let fileURL = tempDir.appendingPathComponent(fileName)
    try? jpegData?.write(to: fileURL)

    var result: [String: Any] = [
      "uri": fileURL.absoluteString,
      "fileName": fileName,
      "mimeType": "image/jpeg",
      "width": Int(image.size.width),
      "height": Int(image.size.height),
      "fileSize": jpegData?.count ?? 0,
      "timestamp": Int(Date().timeIntervalSince1970 * 1000),
    ]

    if includeBase64, let data = jpegData {
      result["base64"] = data.base64EncodedString()
    }

    guard let jsonData = try? JSONSerialization.data(withJSONObject: result),
          let jsonStr = String(data: jsonData, encoding: .utf8) else {
      return "{}"
    }

    return jsonStr
  }
}

// MARK: - UIImagePickerControllerDelegate

extension MediaModule: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    picker.dismiss(animated: true)

    guard let image = info[.originalImage] as? UIImage else {
      pendingReject?("MEDIA_ERROR", "Failed to get image from picker", nil)
      clearPending()
      return
    }

    let quality = pendingOptions["quality"] as? Double ?? 0.8
    let maxDimension = (pendingOptions["maxDimension"] as? NSNumber)?.intValue
    let includeBase64 = (pendingOptions["includeBase64"] as? NSNumber)?.boolValue ?? false

    let processedImage = resizeIfNeeded(image, maxDimension: maxDimension)
    let result = buildMediaResult(from: processedImage, quality: quality, includeBase64: includeBase64, source: "capture")

    pendingResolve?(result)
    clearPending()
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    pendingReject?("MEDIA_CANCELLED", "User cancelled media selection", nil)
    clearPending()
  }

  private func clearPending() {
    pendingResolve = nil
    pendingReject = nil
    pendingOptions = [:]
  }
}

// MARK: - PHPickerViewControllerDelegate (iOS 14+)

@available(iOS 14.0, *)
extension MediaModule: PHPickerViewControllerDelegate {
  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)

    if results.isEmpty {
      pendingReject?("MEDIA_CANCELLED", "User cancelled media selection", nil)
      clearPending()
      return
    }

    let quality = pendingOptions["quality"] as? Double ?? 0.8
    let maxDimension = (pendingOptions["maxDimension"] as? NSNumber)?.intValue
    let includeBase64 = (pendingOptions["includeBase64"] as? NSNumber)?.boolValue ?? false
    let multiple = pendingOptions["multiple"] as? Bool ?? false

    let group = DispatchGroup()
    var mediaResults: [String] = []

    for result in results {
      group.enter()
      result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
        defer { group.leave() }
        guard let self = self, let image = object as? UIImage else { return }

        let processedImage = self.resizeIfNeeded(image, maxDimension: maxDimension)
        let resultStr = self.buildMediaResult(from: processedImage, quality: quality, includeBase64: includeBase64, source: "pick")
        mediaResults.append(resultStr)
      }
    }

    group.notify(queue: .main) { [weak self] in
      if multiple && mediaResults.count > 1 {
        // Parse individual results and build array
        var parsed: [[String: Any]] = []
        for r in mediaResults {
          if let data = r.data(using: .utf8),
             let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            parsed.append(obj)
          }
        }
        if let jsonData = try? JSONSerialization.data(withJSONObject: parsed),
           let jsonStr = String(data: jsonData, encoding: .utf8) {
          self?.pendingResolve?(jsonStr)
        } else {
          self?.pendingReject?("MEDIA_ERROR", "Failed to serialize multiple results", nil)
        }
      } else if let first = mediaResults.first {
        self?.pendingResolve?(first)
      } else {
        self?.pendingReject?("MEDIA_ERROR", "No images were loaded from selection", nil)
      }
      self?.clearPending()
    }
  }
}
