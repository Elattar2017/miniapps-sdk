# Barcode Scanner — Setup Guide

Step-by-step instructions to add the `barcode_scanner` component to any React Native host app using the Miniapps SDK.

---

## What You Get

A native barcode/QR scanner component that:
- Shows a live camera viewfinder inside any module screen
- Detects barcodes using platform-native APIs (no third-party libraries)
- Fires `onScan` event with `{ value, format }` when a code is detected
- Supports overlay children (scan_frame, corner_brackets, scan_line)
- Supports 13 barcode formats: QR, EAN-13, EAN-8, UPC-A, UPC-E, Code-128, Code-39, Code-93, ITF, Codabar, PDF-417, Data Matrix, Aztec

**Native detection engines:**
- iOS: `AVCaptureMetadataOutput` (Apple Vision framework, built into iOS 11+)
- Android: Google ML Kit `BarcodeScanning` (bundled with Google Play Services)

No extra dependencies to install. No user downloads needed.

---

## Files in This Directory

```
docs/barcode-scanner/
├── BARCODE_SCANNER_SETUP.md     ← this guide
├── ios/
│   ├── CameraViewManager.swift  ← iOS native view (AVCaptureSession + barcode detection)
│   ├── CameraViewManager.mm     ← Objective-C bridge (exports props to React Native)
│   └── SDKInteropRegistration.mm ← Fabric interop registration (RN 0.84+)
├── android/
│   └── CameraViewManager.kt     ← Android native view (CameraX + ML Kit barcode)
└── ts/
    ├── BarcodeScannerComponent.tsx ← React component (renders camera + dispatches onScan)
    └── CameraViewAdapter.ts       ← Camera view adapter (resolves native view or mock)
```

---

## Step 1: SDK Files (Already in SDK repo)

These files are part of the `@miniapps/sdk` package. They're already in place if you're using the SDK:

| File | Location in SDK | Purpose |
|------|----------------|---------|
| `BarcodeScannerComponent.tsx` | `src/schema/components/` | React component for the scanner |
| `CameraViewAdapter.ts` | `src/adapters/` | Resolves native camera view or mock fallback |
| `ComponentSpecs.ts` | `src/schema/` | Component spec with props/events/styles |
| `SDKProvider.tsx` | `src/components/` | Registers `barcode_scanner` in the component map |
| `schema.types.ts` | `src/types/` | TypeScript types for barcode scanner props |

### Component Spec (from `ComponentSpecs.ts`)

```typescript
barcode_scanner: {
  type: 'barcode_scanner',
  category: 'input',
  description: 'Live camera barcode/QR scanner — children render as overlays on top of feed.',
  props: {
    formats: {
      type: 'array',
      defaultValue: ['qr', 'ean-13', 'code-128'],
      description: 'Barcode formats to detect',
    },
    cameraFacing: {
      type: 'string',
      defaultValue: 'back',
      enum: ['front', 'back'],
    },
    torch: {
      type: 'boolean',
      defaultValue: false,
      description: 'Enable flashlight / torch',
    },
    scanInterval: {
      type: 'number',
      defaultValue: 1500,
      description: 'Minimum ms between scan events (prevents duplicate reads)',
    },
    active: {
      type: 'expression',
      defaultValue: true,
      description: 'Enable/disable scanning. Camera feed stays visible when false.',
    },
  },
  children: true,   // Accepts overlay children (scan_frame, corner_brackets, etc.)
  events: ['onScan'],
  styles: ['width', 'height', 'borderRadius', 'borderWidth', 'borderColor',
           'margin', 'marginTop', 'marginBottom', 'padding', 'alignSelf',
           'aspectRatio', 'overflow', 'opacity'],
}
```

---

## Step 2: iOS Native Files

### 2a. Copy Native Files to Your Host App

Copy these files into your iOS project:

| Source | Destination in Host App |
|--------|------------------------|
| `ios/CameraViewManager.swift` | `ios/YourApp/CameraViewManager.swift` |
| `ios/CameraViewManager.mm` | `ios/YourApp/CameraViewManager.mm` |
| `ios/SDKInteropRegistration.mm` | `ios/YourApp/SDKInteropRegistration.mm` |

### 2b. Add Files to Xcode Project

1. Open your `.xcworkspace` in Xcode
2. Right-click your app target folder → **Add Files to "YourApp"**
3. Select `CameraViewManager.swift`, `CameraViewManager.mm`, and `SDKInteropRegistration.mm`
4. Make sure **"Copy items if needed"** is unchecked (they're already in the right place)
5. Ensure they're added to your app target

### 2c. Bridging Header

If your project doesn't have a bridging header yet, Xcode will ask to create one when you add the Swift file. Accept it.

Make sure the bridging header (`YourApp-Bridging-Header.h`) imports React:

```objective-c
#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTComponent.h>
```

### 2d. Camera Permission

Add camera permission to `ios/YourApp/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>This app uses the camera to scan barcodes and QR codes.</string>
```

### What the iOS Files Do

**`CameraViewManager.swift`** — The core native view:
- `SDKCameraView` (UIView subclass): manages `AVCaptureSession` with `AVCaptureVideoPreviewLayer` for live camera feed
- `AVCaptureMetadataOutput`: processes camera frames for barcode detection when `barcodeScanEnabled = true`
- Maps 13 SDK format strings to `AVMetadataObject.ObjectType` (qr → `.qr`, ean-13 → `.ean13`, etc.)
- Fires `onBarcodeDetected` RCTDirectEventBlock with `{ value, format }` when a barcode is found
- Throttles events via `scanInterval` to prevent duplicate reads
- `CameraViewManager` singleton: registry of active camera views by ID

**`CameraViewManager.mm`** — The Objective-C bridge:
- Registers `SDKCameraView` as a native view via `RCT_EXPORT_MODULE`
- Exports props: `cameraId`, `cameraFacing`, `mirror`, `barcodeScanEnabled`, `barcodeFormats`, `scanInterval`, `onBarcodeDetected`
- Required because Swift classes can't directly use React Native macros

**`SDKInteropRegistration.mm`** — Fabric interop (RN 0.84+):
- Registers `SDKCameraView` with Fabric's legacy interop layer
- Required on RN 0.84+ New Architecture (bridgeless mode) because `RCTViewManager` subclasses aren't auto-discovered by Fabric

---

## Step 3: Android Native Files

### 3a. Copy Native File

Copy into your Android project:

| Source | Destination |
|--------|------------|
| `android/CameraViewManager.kt` | `android/app/src/main/java/com/anthropic/sdk/media/CameraViewManager.kt` |

Adjust the package name at the top of the file if your app uses a different package structure.

### 3b. Add ML Kit Dependency

Add Google ML Kit barcode scanning to `android/app/build.gradle`:

```gradle
dependencies {
    // ... existing dependencies
    implementation 'com.google.mlkit:barcode-scanning:17.2.0'
}
```

### 3c. Camera Permission

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

### 3d. Register the ViewManager

Add `CameraViewManager` to your app's package list. In `MainApplication.kt`:

```kotlin
override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    packages.add(object : ReactPackage {
        override fun createNativeModules(reactContext: ReactApplicationContext) = emptyList<NativeModule>()
        override fun createViewManagers(reactContext: ReactApplicationContext) = listOf(
            CameraViewManager(reactContext)
        )
    })
    return packages
}
```

### What the Android File Does

**`CameraViewManager.kt`**:
- `SDKCameraView` (FrameLayout subclass): manages CameraX `Preview` + `ImageCapture` for live camera feed
- `ImageAnalysis` use case: processes frames with ML Kit `BarcodeScanning` when `barcodeScanEnabled = true`
- Maps 13 SDK format strings to ML Kit `Barcode.FORMAT_*` constants
- Fires `onBarcodeDetected` event via `RCTEventEmitter` with `{ value, format }`
- Throttles via `scanInterval`
- `CameraViewManager` companion: registry of views + `SimpleViewManager` with `@ReactProp` annotations

---

## Step 4: Verify Setup

### Run on iOS

```bash
cd ios && pod install && cd ..
npx react-native run-ios --device "YourDevice"
```

### Run on Android

```bash
npx react-native run-android
```

### Test Barcode Detection

1. Create a module screen with a `barcode_scanner` component (via the Developer Portal or API)
2. Point the camera at any barcode or QR code
3. The `onScan` event should fire with the barcode value and format

### Test Schema Example

```json
{
  "type": "barcode_scanner",
  "id": "scanner",
  "formats": ["qr", "ean-13", "code-128"],
  "cameraFacing": "back",
  "scanInterval": 2000,
  "style": { "width": 300, "height": 280, "borderRadius": 16 },
  "onScan": [
    { "action": "update_state", "key": "scannedValue", "value": "$event.value" },
    { "action": "update_state", "key": "scannedFormat", "value": "$event.format" },
    { "action": "show_toast", "message": "Scanned!", "toastVariant": "success" }
  ],
  "children": [
    {
      "type": "corner_brackets",
      "bracketSize": 28,
      "bracketColor": "#00FF88",
      "inset": 30,
      "animated": true
    },
    {
      "type": "scan_line",
      "lineColor": "#00FF88",
      "speed": "medium",
      "direction": "bounce",
      "glowEffect": true
    }
  ]
}
```

---

## Supported Barcode Formats

| SDK Format | iOS Type | Android ML Kit | Description |
|-----------|----------|----------------|-------------|
| `qr` | `.qr` | `FORMAT_QR_CODE` | QR Code |
| `ean-13` | `.ean13` | `FORMAT_EAN_13` | EAN-13 (retail) |
| `ean-8` | `.ean8` | `FORMAT_EAN_8` | EAN-8 (small items) |
| `upc-a` | `.upce`* | `FORMAT_UPC_A` | UPC-A (US retail) |
| `upc-e` | `.upce` | `FORMAT_UPC_E` | UPC-E (compressed) |
| `code-128` | `.code128` | `FORMAT_CODE_128` | Code 128 (logistics) |
| `code-39` | `.code39` | `FORMAT_CODE_39` | Code 39 (industrial) |
| `code-93` | `.code93` | `FORMAT_CODE_93` | Code 93 |
| `itf` | `.interleaved2of5` | `FORMAT_ITF` | Interleaved 2 of 5 |
| `codabar` | `.codabar` (iOS 15.4+) | `FORMAT_CODABAR` | Codabar (libraries, blood banks) |
| `pdf-417` | `.pdf417` | `FORMAT_PDF417` | PDF417 (ID cards, tickets) |
| `data-matrix` | `.dataMatrix` | `FORMAT_DATA_MATRIX` | Data Matrix (electronics) |
| `aztec` | `.aztec` | `FORMAT_AZTEC` | Aztec (boarding passes) |

*iOS handles UPC-A as an EAN-13 superset.

---

## How It Works Internally

```
Module Screen (JSON Schema)
    │
    │  { "type": "barcode_scanner", "onScan": [...] }
    │
    ▼
BarcodeScannerComponent.tsx (React)
    │
    │  Renders CameraFeed with barcode props:
    │  barcodeScanEnabled=true, barcodeFormats=[...], onBarcodeDetected=callback
    │
    ▼
SDKCameraView (Native — iOS Swift / Android Kotlin)
    │
    │  Creates AVCaptureSession (iOS) / CameraX (Android)
    │  Adds barcode detection output to the camera pipeline
    │  Processes each frame for barcodes
    │
    ▼
Barcode Detected!
    │
    │  iOS: AVCaptureMetadataOutput delegate fires
    │  Android: ML Kit BarcodeScanning success callback
    │
    ▼
onBarcodeDetected callback → JS
    │
    │  Native sends { value: "6221236100065", format: "ean-13" }
    │  via RCTDirectEventBlock (iOS) / RCTEventEmitter (Android)
    │
    ▼
BarcodeScannerComponent handles event
    │
    │  Replaces $event.value / $event.format in onScan actions
    │  Dispatches each action to ScreenRenderer
    │
    ▼
ScreenRenderer executes actions
    │
    │  update_state → stores barcode value in $state
    │  show_toast → displays notification
    │  navigate → goes to result screen
    │  api_submit → sends barcode to backend
```

---

## Troubleshooting

**Camera shows but no detection:**
- Verify `barcodeScanEnabled` is `true` (check that `active` prop is not set to `false` or a falsy expression)
- Check iOS console for `[SDKCameraView] Barcode detection enabled:` log
- Ensure `barcodeFormats` array is not empty

**Camera permission denied:**
- iOS: Add `NSCameraUsageDescription` to Info.plist
- Android: Add `CAMERA` permission to AndroidManifest.xml
- The native view shows "Camera denied — tap to open Settings" on iOS

**"Connect to Metro" banner + stale code:**
- Rebuild the app: `npx react-native run-ios --device "YourDevice"`
- For clean rebuild: delete `ios/build` then rebuild

**`${$state.scannedValue}` shows literally:**
- Text `value` must be at the schema node TOP LEVEL, not inside `props`
- Correct: `{ "type": "text", "value": "${$state.scannedValue}" }`
- Wrong: `{ "type": "text", "props": { "value": "${$state.scannedValue}" } }`
- The SchemaInterpreter only resolves expressions on top-level node properties

**Scan fires but values are `$event.value` literally:**
- Ensure you're running the latest SDK code (the component pre-resolves `$event.value` via string replacement before dispatching actions)
- The published module schema must match what the SDK loads (draft schemas are not loaded by the SDK runtime)
