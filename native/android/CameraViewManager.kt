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
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import java.util.concurrent.ConcurrentHashMap

// ─── SDKCameraView ───────────────────────────────────────

class SDKCameraView(context: Context) : FrameLayout(context) {

    private var previewView: PreviewView? = null
    private var imageCapture: ImageCapture? = null
    private var cameraProvider: ProcessCameraProvider? = null

    private var _cameraId: String = ""
    private var _cameraFacing: String = "back"
    private var _mirror: Boolean = false

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
                    provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
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
}
