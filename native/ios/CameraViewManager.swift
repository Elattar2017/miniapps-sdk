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
  private var metadataOutput: AVCaptureMetadataOutput?
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
  private var _barcodeScanEnabled: Bool = false
  private var _barcodeFormats: [String] = []
  private var _lastScanTime: TimeInterval = 0
  private var _scanInterval: TimeInterval = 1.5

  /// RN callback for barcode detection — set via onBarcodeDetected prop
  @objc var onBarcodeDetected: RCTDirectEventBlock?

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

  @objc var barcodeScanEnabled: Bool {
    get { _barcodeScanEnabled }
    set {
      _barcodeScanEnabled = newValue
      updateBarcodeDetection()
    }
  }

  @objc var barcodeFormats: NSArray? {
    get { _barcodeFormats as NSArray }
    set {
      _barcodeFormats = (newValue as? [String]) ?? []
      updateBarcodeDetection()
    }
  }

  @objc var scanInterval: Double {
    get { _scanInterval }
    set { _scanInterval = newValue / 1000.0 } // JS passes ms, convert to seconds
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
    metadataOutput = nil
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

    // Clear any leftover placeholder from a previous error state
    viewWithTag(999)?.removeFromSuperview()
    backgroundColor = .clear

    NSLog("[SDKCameraView] setupCamera: facing=%@, window=%@", _cameraFacing, window != nil ? "yes" : "nil")

    let status = AVCaptureDevice.authorizationStatus(for: .video)
    NSLog("[SDKCameraView] authStatus=%d (0=notDetermined, 1=restricted, 2=denied, 3=authorized)", status.rawValue)

    switch status {
    case .notDetermined:
      showPlaceholder("Requesting camera...")
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        NSLog("[SDKCameraView] requestAccess callback: granted=%@", granted ? "YES" : "NO")
        DispatchQueue.main.async {
          self?.viewWithTag(999)?.removeFromSuperview()
          self?.backgroundColor = .clear
          if granted {
            self?.startCameraSession()
          } else {
            self?.showPlaceholder("Camera access denied — enable in Settings")
          }
        }
      }
      return
    case .authorized:
      startCameraSession()
    case .denied:
      showPlaceholder("Camera denied — tap to open Settings")
      addSettingsTapGesture()
    case .restricted:
      showPlaceholder("Camera restricted by device policy")
    @unknown default:
      showPlaceholder("Camera unavailable (status \(status.rawValue))")
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
      NSLog("[SDKCameraView] startCameraSession: facing=%@, position=%d, gen=%d", facing, position.rawValue, expectedGeneration)

      // Use DiscoverySession for robust camera detection (handles TrueDepth, ultrawide, etc.)
      let deviceTypes: [AVCaptureDevice.DeviceType] = [
        .builtInWideAngleCamera,
        .builtInTrueDepthCamera,
      ]
      let discoverySession = AVCaptureDevice.DiscoverySession(
        deviceTypes: deviceTypes,
        mediaType: .video,
        position: position
      )
      guard let device = discoverySession.devices.first else {
        NSLog("[SDKCameraView] ERROR: No camera device for position %d. Available: %@",
              position.rawValue,
              AVCaptureDevice.DiscoverySession(deviceTypes: deviceTypes, mediaType: .video, position: .unspecified).devices.map { $0.localizedName })
        DispatchQueue.main.async { self?.showPlaceholder("No \(facing) camera found") }
        return
      }
      NSLog("[SDKCameraView] Camera device: %@", device.localizedName)

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

        // Clear any placeholder before showing live feed
        self.viewWithTag(999)?.removeFromSuperview()
        self.backgroundColor = .clear

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = viewBounds
        self.layer.insertSublayer(preview, at: 0)

        self.captureSession = session
        self.previewLayer = preview
        self.photoOutput = output
        self.currentDevice = device

        self.updateMirror()
        self.updateBarcodeDetection()
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
    metadataOutput = nil
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

  private func addSettingsTapGesture() {
    // Remove existing gesture recognizers to avoid duplicates
    gestureRecognizers?.forEach { removeGestureRecognizer($0) }
    let tap = UITapGestureRecognizer(target: self, action: #selector(openSettings))
    addGestureRecognizer(tap)
    isUserInteractionEnabled = true
  }

  @objc private func openSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) {
      UIApplication.shared.open(url)
    }
  }

  private func updateMirror() {
    guard let connection = previewLayer?.connection else { return }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = _mirror
    }
  }

  // MARK: - Barcode Detection

  private func updateBarcodeDetection() {
    guard let session = captureSession else { return }

    SDKCameraView.sessionQueue.async { [weak self] in
      guard let self = self else { return }

      // Remove existing metadata output
      if let existing = self.metadataOutput {
        session.removeOutput(existing)
        self.metadataOutput = nil
      }

      guard self._barcodeScanEnabled, !self._barcodeFormats.isEmpty else { return }

      let output = AVCaptureMetadataOutput()
      guard session.canAddOutput(output) else { return }

      session.addOutput(output)
      output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)

      // Map SDK format strings to AVMetadataObject.ObjectType
      let types = self.mapBarcodeFormats(self._barcodeFormats)
      let available = output.availableMetadataObjectTypes
      output.metadataObjectTypes = types.filter { available.contains($0) }

      self.metadataOutput = output
      NSLog("[SDKCameraView] Barcode detection enabled: %@", self._barcodeFormats.joined(separator: ", "))
    }
  }

  private func mapBarcodeFormats(_ formats: [String]) -> [AVMetadataObject.ObjectType] {
    var types: [AVMetadataObject.ObjectType] = []
    for f in formats {
      switch f.lowercased() {
      case "qr":           types.append(.qr)
      case "ean-13":       types.append(.ean13)
      case "ean-8":        types.append(.ean8)
      case "upc-a":        types.append(.upce) // iOS handles UPC-A as EAN-13 superset
      case "upc-e":        types.append(.upce)
      case "code-128":     types.append(.code128)
      case "code-39":      types.append(.code39)
      case "code-93":      types.append(.code93)
      case "itf":          types.append(.interleaved2of5)
      case "codabar":      if #available(iOS 15.4, *) { types.append(.codabar) }
      case "pdf-417":      types.append(.pdf417)
      case "data-matrix":  types.append(.dataMatrix)
      case "aztec":        types.append(.aztec)
      default:
        NSLog("[SDKCameraView] Unknown barcode format: %@", f)
      }
    }
    return types
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

// MARK: - AVCaptureMetadataOutputObjectsDelegate (Barcode Detection)

extension SDKCameraView: AVCaptureMetadataOutputObjectsDelegate {
  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard _barcodeScanEnabled else { return }

    // Throttle: skip if within scan interval
    let now = Date().timeIntervalSince1970
    guard now - _lastScanTime >= _scanInterval else { return }

    guard let readable = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
          let value = readable.stringValue else { return }

    _lastScanTime = now

    // Map AVMetadataObject.ObjectType back to SDK format string
    let format = mapNativeFormatToSDK(readable.type)

    NSLog("[SDKCameraView] Barcode detected: format=%@, value=%@", format, value)

    // Fire the RN callback
    onBarcodeDetected?(["value": value, "format": format])
  }

  private func mapNativeFormatToSDK(_ type: AVMetadataObject.ObjectType) -> String {
    switch type {
    case .qr:              return "qr"
    case .ean13:           return "ean-13"
    case .ean8:            return "ean-8"
    case .upce:            return "upc-e"
    case .code128:         return "code-128"
    case .code39:          return "code-39"
    case .code93:          return "code-93"
    case .interleaved2of5: return "itf"
    case .pdf417:          return "pdf-417"
    case .dataMatrix:      return "data-matrix"
    case .aztec:           return "aztec"
    default:               return type.rawValue
    }
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
