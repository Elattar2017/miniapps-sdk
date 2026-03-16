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

@objc(SDKCameraView)
class SDKCameraView: UIView {

  // MARK: - Properties

  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var photoOutput: AVCapturePhotoOutput?
  private var currentDevice: AVCaptureDevice?

  /// Shared serial queue for ALL camera session operations across all instances.
  /// Serializes stopRunning/startRunning so they never overlap on the same hardware.
  private static let sessionQueue = DispatchQueue(label: "com.sdk.camera.session", qos: .userInitiated)

  /// Generation counter — incremented on every teardown. The async session setup
  /// checks this before assigning results back to self, preventing stale sessions
  /// from being attached after a teardown has already occurred.
  private var sessionGeneration: Int = 0

  private var _cameraId: String = ""
  private var _cameraFacing: String = "back"
  private var _mirror: Bool = false

  // MARK: - Prop Setters (ObjC-safe: accept NSString? which may be nil from RN bridge)

  @objc var cameraId: NSString? {
    get { _cameraId as NSString }
    set {
      let newVal = (newValue as String?) ?? ""
      let oldId = _cameraId
      _cameraId = newVal
      if !oldId.isEmpty {
        CameraViewManager.shared.unregisterView(id: oldId)
      }
      if !newVal.isEmpty {
        CameraViewManager.shared.registerView(self, id: newVal)
      }
    }
  }

  @objc var cameraFacing: NSString? {
    get { _cameraFacing as NSString }
    set {
      let newVal = (newValue as String?) ?? "back"
      if _cameraFacing != newVal {
        _cameraFacing = newVal
        setupCamera()
      }
    }
  }

  @objc var mirror: Bool {
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
    // Capture values before deallocation
    let session = captureSession
    let preview = previewLayer
    let camId = _cameraId

    // Nil out to prevent any further use
    captureSession = nil
    previewLayer = nil
    photoOutput = nil
    currentDevice = nil

    // Stop session async on the shared queue — never block deinit
    if let session = session {
      SDKCameraView.sessionQueue.async {
        if session.isRunning { session.stopRunning() }
      }
    }

    // Remove preview layer on main thread
    if let preview = preview {
      DispatchQueue.main.async { preview.removeFromSuperlayer() }
    }

    // Unregister from the view registry
    if !camId.isEmpty {
      CameraViewManager.shared.unregisterView(id: camId)
    }
  }

  // MARK: - Camera Setup

  private func setupCamera() {
    teardownCamera()

    let status = AVCaptureDevice.authorizationStatus(for: .video)
    switch status {
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        if granted {
          DispatchQueue.main.async { self?.startCameraSession() }
        } else {
          DispatchQueue.main.async { self?.showPlaceholder("Camera access denied") }
        }
      }
      return
    case .authorized:
      startCameraSession()
    default:
      showPlaceholder("Camera access denied")
      return
    }
  }

  private func startCameraSession() {
    // Guard against view being removed from hierarchy during async setup
    guard window != nil else { return }

    // Capture the current generation so the async callback can detect staleness
    let expectedGeneration = sessionGeneration
    let facing = _cameraFacing
    let viewBounds = bounds

    // ALL AVFoundation work runs on the shared serial queue.
    // This guarantees the previous session's stopRunning() has fully completed
    // before this session's startRunning() begins — no hardware contention.
    SDKCameraView.sessionQueue.async { [weak self] in
      let session = AVCaptureSession()

      let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
        DispatchQueue.main.async { self?.showPlaceholder("Camera not available") }
        return
      }

      session.beginConfiguration()
      session.sessionPreset = .photo

      do {
        let input = try AVCaptureDeviceInput(device: device)
        if session.canAddInput(input) {
          session.addInput(input)
        } else {
          session.commitConfiguration()
          DispatchQueue.main.async { self?.showPlaceholder("Cannot add camera input") }
          return
        }
      } catch {
        session.commitConfiguration()
        NSLog("[SDKCameraView] Failed to create camera input: %@", error.localizedDescription)
        DispatchQueue.main.async { self?.showPlaceholder("Camera error") }
        return
      }

      let output = AVCapturePhotoOutput()
      if session.canAddOutput(output) {
        session.addOutput(output)
      }

      session.commitConfiguration()
      session.startRunning()

      // Attach preview layer on the main thread ONLY if this setup hasn't been
      // superseded by a teardown (generation check prevents stale assignment)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }

        // If teardownCamera() was called while we were on the session queue,
        // the generation will have incremented — discard this stale session.
        guard self.sessionGeneration == expectedGeneration, self.window != nil else {
          // Session is stale — stop it on the queue to release hardware
          SDKCameraView.sessionQueue.async {
            if session.isRunning { session.stopRunning() }
          }
          return
        }

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = viewBounds
        self.layer.insertSublayer(preview, at: 0)

        self.captureSession = session
        self.previewLayer = preview
        self.photoOutput = output
        self.currentDevice = device

        self.updateMirror()
      }
    }
  }

  private func teardownCamera() {
    // Increment generation so any in-flight async setup knows it's stale
    sessionGeneration += 1

    let session = captureSession
    let preview = previewLayer

    // Clear references immediately to prevent re-use
    captureSession = nil
    previewLayer = nil
    photoOutput = nil
    currentDevice = nil

    // Remove preview layer immediately (we're on main thread)
    preview?.removeFromSuperlayer()

    // Do NOT unregister from registry here — teardownCamera() is called during
    // transient React re-renders (setupCamera calls teardown first, and
    // didMoveToWindow fires during reconciler unmount/remount cycles).
    // The view is still logically present. Registration is managed solely by
    // the cameraId prop setter and deinit. The weak-ref registry ensures no
    // retain cycle even if cleanup is missed.

    // Stop session on the shared serial queue — serialized with startCameraSession
    if let session = session {
      SDKCameraView.sessionQueue.async {
        if session.isRunning { session.stopRunning() }
      }
    }
  }

  private func showPlaceholder(_ message: String) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in self?.showPlaceholder(message) }
      return
    }
    backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1.0)
    // Remove existing placeholder
    viewWithTag(999)?.removeFromSuperview()
    let label = UILabel()
    label.text = message
    label.textColor = UIColor(white: 1.0, alpha: 0.5)
    label.font = UIFont.systemFont(ofSize: 12)
    label.textAlignment = .center
    label.tag = 999
    label.translatesAutoresizingMaskIntoConstraints = false
    addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: centerXAnchor),
      label.centerYAnchor.constraint(equalTo: centerYAnchor),
    ])
  }

  private func updateMirror() {
    guard let connection = previewLayer?.connection else { return }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = _mirror
    }
  }

  // MARK: - Frame Capture (for captureFromView)

  /// Stable key for objc_setAssociatedObject — must be a pointer, not a string literal
  fileprivate static var photoCaptureDelegateKey: UInt8 = 0

  func captureFrame(completion: @escaping (UIImage?, Error?) -> Void) {
    guard let output = photoOutput, let session = captureSession, session.isRunning else {
      completion(nil, NSError(domain: "SDKCameraView", code: -1, userInfo: [NSLocalizedDescriptionKey: "Photo output not available"]))
      return
    }

    let settings = AVCapturePhotoSettings()
    let delegate = PhotoCaptureDelegate(completion: completion)
    // Keep strong reference via associated object until capture completes
    objc_setAssociatedObject(output, &SDKCameraView.photoCaptureDelegateKey, delegate, .OBJC_ASSOCIATION_RETAIN)
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
    // Clear the association to release this delegate after callback
    objc_setAssociatedObject(output, &SDKCameraView.photoCaptureDelegateKey, nil, .OBJC_ASSOCIATION_RETAIN)

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

  /// Weak wrapper to prevent retain cycles — views are owned by React Native,
  /// not by this registry. If RN deallocates a view, the weak ref nils out.
  private class WeakRef {
    weak var view: SDKCameraView?
    init(_ view: SDKCameraView) { self.view = view }
  }

  private var viewRegistry: [String: WeakRef] = [:]
  private let registryLock = NSLock()

  func registerView(_ view: SDKCameraView, id: String) {
    registryLock.lock()
    viewRegistry[id] = WeakRef(view)
    registryLock.unlock()
  }

  func unregisterView(id: String) {
    registryLock.lock()
    viewRegistry.removeValue(forKey: id)
    registryLock.unlock()
  }

  func getView(byId id: String) -> SDKCameraView? {
    registryLock.lock()
    let view = viewRegistry[id]?.view
    registryLock.unlock()
    return view
  }
}
