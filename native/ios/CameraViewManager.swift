/**
 * CameraViewManager - iOS native view manager for inline camera preview
 *
 * Provides SDKCameraView as a Fabric-compatible native view component.
 * Uses AVCaptureVideoPreviewLayer for real-time camera feed.
 *
 * Props (from schema):
 * - cameraId: string — unique ID for captureFromView lookups
 * - cameraFacing: 'front' | 'back'
 * - mirror: boolean
 *
 * The CameraViewManager.shared singleton maintains a registry of active
 * camera views by ID, enabling captureFromView to snapshot any inline camera.
 */

import Foundation
import UIKit
import AVFoundation

// MARK: - SDKCameraView (UIView subclass)

class SDKCameraView: UIView {

  // MARK: - Properties

  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var photoOutput: AVCapturePhotoOutput?
  private var currentDevice: AVCaptureDevice?

  private var _cameraId: String = ""
  private var _cameraFacing: String = "back"
  private var _mirror: Bool = false

  // MARK: - Prop Setters

  var cameraId: String {
    get { _cameraId }
    set {
      let oldId = _cameraId
      _cameraId = newValue
      if !oldId.isEmpty {
        CameraViewManager.shared.unregisterView(id: oldId)
      }
      if !newValue.isEmpty {
        CameraViewManager.shared.registerView(self, id: newValue)
      }
    }
  }

  var cameraFacing: String {
    get { _cameraFacing }
    set {
      if _cameraFacing != newValue {
        _cameraFacing = newValue
        setupCamera()
      }
    }
  }

  var mirror: Bool {
    get { _mirror }
    set {
      _mirror = newValue
      updateMirror()
    }
  }

  // MARK: - Lifecycle

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      setupCamera()
    } else {
      teardownCamera()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer?.frame = bounds
  }

  deinit {
    teardownCamera()
    if !_cameraId.isEmpty {
      CameraViewManager.shared.unregisterView(id: _cameraId)
    }
  }

  // MARK: - Camera Setup

  private func setupCamera() {
    teardownCamera()

    let session = AVCaptureSession()
    session.sessionPreset = .photo

    let position: AVCaptureDevice.Position = _cameraFacing == "front" ? .front : .back
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
      return
    }

    guard let input = try? AVCaptureDeviceInput(device: device) else {
      return
    }

    if session.canAddInput(input) {
      session.addInput(input)
    }

    let output = AVCapturePhotoOutput()
    if session.canAddOutput(output) {
      session.addOutput(output)
    }

    let preview = AVCaptureVideoPreviewLayer(session: session)
    preview.videoGravity = .resizeAspectFill
    preview.frame = bounds
    layer.insertSublayer(preview, at: 0)

    self.captureSession = session
    self.previewLayer = preview
    self.photoOutput = output
    self.currentDevice = device

    updateMirror()

    DispatchQueue.global(qos: .userInitiated).async {
      session.startRunning()
    }
  }

  private func teardownCamera() {
    captureSession?.stopRunning()
    previewLayer?.removeFromSuperlayer()
    captureSession = nil
    previewLayer = nil
    photoOutput = nil
    currentDevice = nil
  }

  private func updateMirror() {
    guard let connection = previewLayer?.connection else { return }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = _mirror
    }
  }

  // MARK: - Frame Capture (for captureFromView)

  func captureFrame(completion: @escaping (UIImage?, Error?) -> Void) {
    guard let output = photoOutput else {
      completion(nil, NSError(domain: "SDKCameraView", code: -1, userInfo: [NSLocalizedDescriptionKey: "Photo output not available"]))
      return
    }

    let settings = AVCapturePhotoSettings()
    let delegate = PhotoCaptureDelegate(completion: completion)
    // Keep strong reference until capture completes
    objc_setAssociatedObject(output, "photoCaptureDelegate", delegate, .OBJC_ASSOCIATION_RETAIN)
    output.capturePhoto(with: settings, delegate: delegate)
  }
}

// MARK: - Photo Capture Delegate

private class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
  private let completion: (UIImage?, Error?) -> Void

  init(completion: @escaping (UIImage?, Error?) -> Void) {
    self.completion = completion
    super.init()
  }

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    if let error = error {
      completion(nil, error)
      return
    }

    guard let data = photo.fileDataRepresentation(),
          let image = UIImage(data: data) else {
      completion(nil, NSError(domain: "SDKCameraView", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to create image from photo data"]))
      return
    }

    completion(image, nil)
  }
}

// MARK: - CameraViewManager (Registry + RCTViewManager)

@objc(CameraViewManager)
class CameraViewManager: NSObject {

  /// Shared singleton for camera view registration
  @objc static let shared = CameraViewManager()

  private var viewRegistry: [String: SDKCameraView] = [:]
  private let registryLock = NSLock()

  func registerView(_ view: SDKCameraView, id: String) {
    registryLock.lock()
    viewRegistry[id] = view
    registryLock.unlock()
  }

  func unregisterView(id: String) {
    registryLock.lock()
    viewRegistry.removeValue(forKey: id)
    registryLock.unlock()
  }

  func getView(byId id: String) -> SDKCameraView? {
    registryLock.lock()
    let view = viewRegistry[id]
    registryLock.unlock()
    return view
  }
}
