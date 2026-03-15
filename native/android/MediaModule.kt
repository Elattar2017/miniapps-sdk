/**
 * MediaModule - Android TurboModule for camera capture and photo library access
 *
 * Provides:
 * - captureImage: Launches system camera via TakePicture contract
 * - pickFromLibrary: Launches Android Photo Picker (API 33+) or system file picker fallback
 * - captureFromView: Snapshots an inline SDKCameraView by its cameraId
 * - Permission checking/requesting for camera and photo library
 *
 * Options and results are JSON-stringified for Codegen compatibility.
 * Matches TurboModule spec: NativeMediaModule.ts
 * Registered name: "MediaModule"
 */

package com.anthropic.sdk.media

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

class MediaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "MediaModule"
        private const val REQUEST_CAMERA = 1001
        private const val REQUEST_LIBRARY = 1002
        private const val REQUEST_CAMERA_PERMISSION = 2001
        private const val REQUEST_LIBRARY_PERMISSION = 2002
    }

    override fun getName(): String = NAME

    private var pendingPromise: Promise? = null
    private var pendingOptions: JSONObject? = null
    private var captureUri: Uri? = null

    init {
        val listener: ActivityEventListener = object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
                when (requestCode) {
                    REQUEST_CAMERA -> handleCameraResult(resultCode, data)
                    REQUEST_LIBRARY -> handleLibraryResult(resultCode, data)
                }
            }
        }
        reactContext.addActivityEventListener(listener)
    }

    // -----------------------------------------------------------------------
    // captureImage
    // -----------------------------------------------------------------------

    @ReactMethod
    fun captureImage(optionsStr: String, promise: Promise) {
        try {
            val options = JSONObject(optionsStr)
            pendingPromise = promise
            pendingOptions = options

            val activity = currentActivity
            if (activity == null) {
                promise.reject("MEDIA_ERROR", "No current activity")
                return
            }

            // Create temp file for camera output
            val tempDir = reactApplicationContext.cacheDir
            val tempFile = File.createTempFile("capture_", ".jpg", tempDir)
            captureUri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                tempFile
            )

            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            intent.putExtra(MediaStore.EXTRA_OUTPUT, captureUri)
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            activity.startActivityForResult(intent, REQUEST_CAMERA)
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", "Failed to launch camera: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // pickFromLibrary
    // -----------------------------------------------------------------------

    @ReactMethod
    fun pickFromLibrary(optionsStr: String, promise: Promise) {
        try {
            val options = JSONObject(optionsStr)
            pendingPromise = promise
            pendingOptions = options

            val activity = currentActivity
            if (activity == null) {
                promise.reject("MEDIA_ERROR", "No current activity")
                return
            }

            val multiple = options.optBoolean("multiple", false)

            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ Photo Picker
                Intent(MediaStore.ACTION_PICK_IMAGES).apply {
                    type = options.optString("accept", "image/*")
                    if (multiple) {
                        val maxCount = options.optInt("maxCount", 10)
                        putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, maxCount)
                    }
                }
            } else {
                Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = options.optString("accept", "image/*")
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
                }
            }

            activity.startActivityForResult(intent, REQUEST_LIBRARY)
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", "Failed to launch photo picker: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // captureFromView
    // -----------------------------------------------------------------------

    @ReactMethod
    fun captureFromView(cameraId: String, optionsStr: String, promise: Promise) {
        try {
            if (cameraId.isEmpty()) {
                promise.reject("MEDIA_ERROR", "captureFromView requires a non-empty cameraId")
                return
            }

            val options = JSONObject(optionsStr)
            val view = CameraViewManager.getView(cameraId)

            if (view == null) {
                promise.reject("MEDIA_ERROR", "Camera view with id '$cameraId' not found")
                return
            }

            view.captureFrame { bitmap, error ->
                if (error != null || bitmap == null) {
                    promise.reject("MEDIA_ERROR", "Failed to capture frame: ${error?.message ?: "unknown"}")
                    return@captureFrame
                }

                val quality = (options.optDouble("quality", 0.8) * 100).toInt()
                val maxDimension = if (options.has("maxDimension")) options.optInt("maxDimension") else null
                val includeBase64 = options.optBoolean("includeBase64", false)

                val resized = resizeIfNeeded(bitmap, maxDimension)
                val result = buildMediaResult(resized, quality, includeBase64, "viewCapture")
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", "captureFromView failed: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------------

    @ReactMethod
    fun checkCameraPermission(promise: Promise) {
        val status = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.CAMERA
        )
        promise.resolve(if (status == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
    }

    @ReactMethod
    fun checkLibraryPermission(promise: Promise) {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
        val status = ContextCompat.checkSelfPermission(reactApplicationContext, permission)
        promise.resolve(if (status == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
    }

    @ReactMethod
    fun requestCameraPermission(promise: Promise) {
        val status = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.CAMERA
        )
        if (status == PackageManager.PERMISSION_GRANTED) {
            promise.resolve("granted")
        } else {
            // In production this would use ActivityCompat.requestPermissions
            // with a callback. Simplified for the module spec.
            promise.resolve("denied")
        }
    }

    @ReactMethod
    fun requestLibraryPermission(promise: Promise) {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
        val status = ContextCompat.checkSelfPermission(reactApplicationContext, permission)
        if (status == PackageManager.PERMISSION_GRANTED) {
            promise.resolve("granted")
        } else {
            promise.resolve("denied")
        }
    }

    // -----------------------------------------------------------------------
    // Activity Result Handlers
    // -----------------------------------------------------------------------

    private fun handleCameraResult(resultCode: Int, data: Intent?) {
        val promise = pendingPromise ?: return
        val options = pendingOptions ?: JSONObject()

        if (resultCode != Activity.RESULT_OK) {
            promise.reject("MEDIA_CANCELLED", "User cancelled camera capture")
            clearPending()
            return
        }

        try {
            val uri = captureUri ?: return
            val stream = reactApplicationContext.contentResolver.openInputStream(uri)
            val bitmap = BitmapFactory.decodeStream(stream)
            stream?.close()

            if (bitmap == null) {
                promise.reject("MEDIA_ERROR", "Failed to decode captured image")
                clearPending()
                return
            }

            val quality = (options.optDouble("quality", 0.8) * 100).toInt()
            val maxDimension = if (options.has("maxDimension")) options.optInt("maxDimension") else null
            val includeBase64 = options.optBoolean("includeBase64", false)

            val resized = resizeIfNeeded(bitmap, maxDimension)
            val result = buildMediaResult(resized, quality, includeBase64, "capture")
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", "Failed to process camera result: ${e.message}", e)
        }

        clearPending()
    }

    private fun handleLibraryResult(resultCode: Int, data: Intent?) {
        val promise = pendingPromise ?: return
        val options = pendingOptions ?: JSONObject()

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("MEDIA_CANCELLED", "User cancelled photo selection")
            clearPending()
            return
        }

        try {
            val quality = (options.optDouble("quality", 0.8) * 100).toInt()
            val maxDimension = if (options.has("maxDimension")) options.optInt("maxDimension") else null
            val includeBase64 = options.optBoolean("includeBase64", false)
            val multiple = options.optBoolean("multiple", false)

            val uris = mutableListOf<Uri>()

            // Check for multiple selections
            if (multiple && data.clipData != null) {
                val clipData = data.clipData!!
                val maxCount = options.optInt("maxCount", 10)
                for (i in 0 until minOf(clipData.itemCount, maxCount)) {
                    uris.add(clipData.getItemAt(i).uri)
                }
            } else if (data.data != null) {
                uris.add(data.data!!)
            }

            if (uris.isEmpty()) {
                promise.reject("MEDIA_ERROR", "No images selected")
                clearPending()
                return
            }

            if (multiple && uris.size > 1) {
                val results = JSONArray()
                for (uri in uris) {
                    val bitmap = decodeBitmapFromUri(uri) ?: continue
                    val resized = resizeIfNeeded(bitmap, maxDimension)
                    val resultStr = buildMediaResult(resized, quality, includeBase64, "pick")
                    results.put(JSONObject(resultStr))
                }
                promise.resolve(results.toString())
            } else {
                val bitmap = decodeBitmapFromUri(uris[0])
                if (bitmap == null) {
                    promise.reject("MEDIA_ERROR", "Failed to decode selected image")
                    clearPending()
                    return
                }
                val resized = resizeIfNeeded(bitmap, maxDimension)
                val result = buildMediaResult(resized, quality, includeBase64, "pick")
                promise.resolve(result)
            }
        } catch (e: Exception) {
            promise.reject("MEDIA_ERROR", "Failed to process library result: ${e.message}", e)
        }

        clearPending()
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private fun decodeBitmapFromUri(uri: Uri): Bitmap? {
        return try {
            val stream = reactApplicationContext.contentResolver.openInputStream(uri)
            val bitmap = BitmapFactory.decodeStream(stream)
            stream?.close()
            bitmap
        } catch (e: Exception) {
            null
        }
    }

    private fun resizeIfNeeded(bitmap: Bitmap, maxDimension: Int?): Bitmap {
        if (maxDimension == null) return bitmap
        val maxDim = maxDimension.toFloat()
        if (bitmap.width <= maxDim && bitmap.height <= maxDim) return bitmap

        val ratio = minOf(maxDim / bitmap.width, maxDim / bitmap.height)
        val newWidth = (bitmap.width * ratio).toInt()
        val newHeight = (bitmap.height * ratio).toInt()

        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun buildMediaResult(bitmap: Bitmap, quality: Int, includeBase64: Boolean, source: String): String {
        val fileName = "${source}_${System.currentTimeMillis()}.jpg"
        val tempFile = File(reactApplicationContext.cacheDir, fileName)

        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        val jpegBytes = stream.toByteArray()

        FileOutputStream(tempFile).use { it.write(jpegBytes) }

        val result = JSONObject()
        result.put("uri", "file://${tempFile.absolutePath}")
        result.put("fileName", fileName)
        result.put("mimeType", "image/jpeg")
        result.put("width", bitmap.width)
        result.put("height", bitmap.height)
        result.put("fileSize", jpegBytes.size)
        result.put("timestamp", System.currentTimeMillis())

        if (includeBase64) {
            result.put("base64", Base64.encodeToString(jpegBytes, Base64.NO_WRAP))
        }

        return result.toString()
    }

    private fun clearPending() {
        pendingPromise = null
        pendingOptions = null
        captureUri = null
    }
}
