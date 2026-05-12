/**
 * CameraViewManager - Android native view manager for inline camera preview
 *
 * Provides SDKCameraView as a Fabric-compatible SimpleViewManager.
 * Uses CameraX Preview for real-time camera feed.
 *
 * Props (from schema):
 * - cameraId: string — unique ID for captureFromView lookups
 * - cameraFacing: 'front' | 'back'
 * - mirror: boolean
 *
 * The CameraViewManager companion object maintains a registry of active
 * camera views by ID, enabling captureFromView to snapshot any inline camera.
 */

package com.anthropic.sdk.media

import android.content.Context
import android.graphics.Bitmap
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

// ─── SDKCameraView ───────────────────────────────────────

class SDKCameraView(context: Context) : FrameLayout(context) {

    private var previewView: PreviewView? = null
    private var imageCapture: ImageCapture? = null
    private var cameraProvider: ProcessCameraProvider? = null

    private var _cameraId: String = ""
    private var _cameraFacing: String = "back"
    private var _mirror: Boolean = false
    private var _barcodeScanEnabled: Boolean = false
    private var _barcodeFormats: List<String> = emptyList()
    private var _scanInterval: Long = 1500L
    private var _lastScanTime: Long = 0L
    private var imageAnalysis: ImageAnalysis? = null
    private val analysisExecutor = Executors.newSingleThreadExecutor()

    var cameraId: String
        get() = _cameraId
        set(value) {
            val old = _cameraId
            _cameraId = value
            if (old.isNotEmpty()) CameraViewManager.unregisterView(old)
            if (value.isNotEmpty()) CameraViewManager.registerView(value, this)
        }

    var cameraFacing: String
        get() = _cameraFacing
        set(value) {
            if (_cameraFacing != value) {
                _cameraFacing = value
                startCamera()
            }
        }

    var mirror: Boolean
        get() = _mirror
        set(value) {
            _mirror = value
            previewView?.scaleX = if (value) -1f else 1f
        }

    var barcodeScanEnabled: Boolean
        get() = _barcodeScanEnabled
        set(value) {
            _barcodeScanEnabled = value
            // Restart camera to add/remove ImageAnalysis
            if (isAttachedToWindow) startCamera()
        }

    var barcodeFormats: List<String>
        get() = _barcodeFormats
        set(value) {
            _barcodeFormats = value
            if (_barcodeScanEnabled && isAttachedToWindow) startCamera()
        }

    var scanInterval: Long
        get() = _scanInterval
        set(value) { _scanInterval = value }

    init {
        val pv = PreviewView(context)
        pv.layoutParams = LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        addView(pv)
        previewView = pv
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startCamera()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopCamera()
        if (_cameraId.isNotEmpty()) {
            CameraViewManager.unregisterView(_cameraId)
        }
    }

    private fun startCamera() {
        val ctx = context ?: return
        val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

        cameraProviderFuture.addListener({
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider

                val preview = Preview.Builder().build()
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()

                val selector = if (_cameraFacing == "front") {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                } else {
                    CameraSelector.DEFAULT_BACK_CAMERA
                }

                provider.unbindAll()

                val lifecycleOwner = ctx as? LifecycleOwner
                if (lifecycleOwner != null) {
                    // Build use cases list
                    val useCases = mutableListOf(preview, capture)

                    // Add barcode scanning if enabled
                    if (_barcodeScanEnabled && _barcodeFormats.isNotEmpty()) {
                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                            processBarcodeFrame(imageProxy)
                        }
                        useCases.add(analysis)
                        imageAnalysis = analysis
                    }

                    provider.bindToLifecycle(lifecycleOwner, selector, *useCases.toTypedArray())
                    preview.setSurfaceProvider(previewView?.surfaceProvider)
                    imageCapture = capture

                    // Apply mirror
                    previewView?.scaleX = if (_mirror) -1f else 1f
                }
            } catch (e: Exception) {
                // Camera setup failed — view will show black
            }
        }, ContextCompat.getMainExecutor(ctx))
    }

    private fun stopCamera() {
        cameraProvider?.unbindAll()
        cameraProvider = null
        imageCapture = null
    }

    // ── Barcode Detection ─────────────────────────────────

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
    private fun processBarcodeFrame(imageProxy: ImageProxy) {
        if (!_barcodeScanEnabled) {
            imageProxy.close()
            return
        }

        // Throttle
        val now = System.currentTimeMillis()
        if (now - _lastScanTime < _scanInterval) {
            imageProxy.close()
            return
        }

        val mediaImage = imageProxy.image
        if (mediaImage == null) {
            imageProxy.close()
            return
        }

        val inputImage = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        val options = buildScannerOptions()
        val scanner = BarcodeScanning.getClient(options)

        scanner.process(inputImage)
            .addOnSuccessListener { barcodes ->
                if (barcodes.isNotEmpty() && _barcodeScanEnabled) {
                    val barcode = barcodes[0]
                    val value = barcode.rawValue ?: return@addOnSuccessListener
                    val format = mapBarcodeFormat(barcode.format)

                    _lastScanTime = System.currentTimeMillis()

                    // Send event to React Native
                    val event = Arguments.createMap()
                    event.putString("value", value)
                    event.putString("format", format)
                    sendEvent("onBarcodeDetected", event)
                }
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    }

    private fun buildScannerOptions(): BarcodeScannerOptions {
        val builder = BarcodeScannerOptions.Builder()
        val formats = _barcodeFormats.mapNotNull { mapSDKFormatToMLKit(it) }
        if (formats.isNotEmpty()) {
            builder.setBarcodeFormats(formats[0], *formats.drop(1).toIntArray())
        }
        return builder.build()
    }

    private fun mapSDKFormatToMLKit(format: String): Int? {
        return when (format.lowercase()) {
            "qr"          -> Barcode.FORMAT_QR_CODE
            "ean-13"      -> Barcode.FORMAT_EAN_13
            "ean-8"       -> Barcode.FORMAT_EAN_8
            "upc-a"       -> Barcode.FORMAT_UPC_A
            "upc-e"       -> Barcode.FORMAT_UPC_E
            "code-128"    -> Barcode.FORMAT_CODE_128
            "code-39"     -> Barcode.FORMAT_CODE_39
            "code-93"     -> Barcode.FORMAT_CODE_93
            "itf"         -> Barcode.FORMAT_ITF
            "codabar"     -> Barcode.FORMAT_CODABAR
            "pdf-417"     -> Barcode.FORMAT_PDF417
            "data-matrix" -> Barcode.FORMAT_DATA_MATRIX
            "aztec"       -> Barcode.FORMAT_AZTEC
            else          -> null
        }
    }

    private fun mapBarcodeFormat(format: Int): String {
        return when (format) {
            Barcode.FORMAT_QR_CODE    -> "qr"
            Barcode.FORMAT_EAN_13     -> "ean-13"
            Barcode.FORMAT_EAN_8      -> "ean-8"
            Barcode.FORMAT_UPC_A      -> "upc-a"
            Barcode.FORMAT_UPC_E      -> "upc-e"
            Barcode.FORMAT_CODE_128   -> "code-128"
            Barcode.FORMAT_CODE_39    -> "code-39"
            Barcode.FORMAT_CODE_93    -> "code-93"
            Barcode.FORMAT_ITF        -> "itf"
            Barcode.FORMAT_CODABAR    -> "codabar"
            Barcode.FORMAT_PDF417     -> "pdf-417"
            Barcode.FORMAT_DATA_MATRIX -> "data-matrix"
            Barcode.FORMAT_AZTEC      -> "aztec"
            else                      -> "unknown"
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            val reactContext = context as? ThemedReactContext ?: return
            reactContext.getJSModule(RCTEventEmitter::class.java)
                .receiveEvent(id, eventName, params)
        } catch (e: Exception) {
            // Ignore if RN context not available
        }
    }

    /**
     * Capture the current frame from the camera.
     */
    fun captureFrame(callback: (Bitmap?, Exception?) -> Unit) {
        val capture = imageCapture
        if (capture == null) {
            callback(null, Exception("ImageCapture not initialized"))
            return
        }

        capture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bitmap = image.toBitmap()
                    image.close()
                    callback(bitmap, null)
                }

                override fun onError(exception: ImageCaptureException) {
                    callback(null, exception)
                }
            }
        )
    }
}

// ─── CameraViewManager (React Native ViewManager + Registry) ─────

class CameraViewManager(reactContext: ReactApplicationContext) :
    SimpleViewManager<SDKCameraView>() {

    companion object {
        const val REACT_CLASS = "SDKCameraView"

        private val viewRegistry = ConcurrentHashMap<String, SDKCameraView>()

        fun registerView(id: String, view: SDKCameraView) {
            viewRegistry[id] = view
        }

        fun unregisterView(id: String) {
            viewRegistry.remove(id)
        }

        fun getView(id: String): SDKCameraView? {
            return viewRegistry[id]
        }
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(reactContext: ThemedReactContext): SDKCameraView {
        return SDKCameraView(reactContext)
    }

    @ReactProp(name = "cameraId")
    fun setCameraId(view: SDKCameraView, cameraId: String?) {
        view.cameraId = cameraId ?: ""
    }

    @ReactProp(name = "cameraFacing")
    fun setCameraFacing(view: SDKCameraView, facing: String?) {
        view.cameraFacing = facing ?: "back"
    }

    @ReactProp(name = "mirror")
    fun setMirror(view: SDKCameraView, mirror: Boolean) {
        view.mirror = mirror
    }

    @ReactProp(name = "barcodeScanEnabled")
    fun setBarcodeScanEnabled(view: SDKCameraView, enabled: Boolean) {
        view.barcodeScanEnabled = enabled
    }

    @ReactProp(name = "barcodeFormats")
    fun setBarcodeFormats(view: SDKCameraView, formats: com.facebook.react.bridge.ReadableArray?) {
        val list = mutableListOf<String>()
        formats?.let {
            for (i in 0 until it.size()) {
                it.getString(i)?.let { f -> list.add(f) }
            }
        }
        view.barcodeFormats = list
    }

    @ReactProp(name = "scanInterval")
    fun setScanInterval(view: SDKCameraView, interval: Double) {
        view.scanInterval = interval.toLong()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return mapOf(
            "onBarcodeDetected" to mapOf("registrationName" to "onBarcodeDetected")
        )
    }
}
