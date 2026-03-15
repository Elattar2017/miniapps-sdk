/**
 * NetworkModule - Android TurboModule for certificate-pinned network requests
 *
 * Provides native-level HTTP requests with OkHttp certificate pinning enforcement.
 * Used by the SDK's APIProxy to ensure all network traffic is protected against
 * MITM attacks via TLS certificate pinning.
 *
 * Pin configuration format:
 * [
 *   {
 *     "domain": "api.example.com",
 *     "pins": ["sha256/AAAA=", "sha256/BBBB="],
 *     "includeSubdomains": true
 *   }
 * ]
 *
 * Fetch options format (JSON string):
 * {
 *   "method": "POST",
 *   "headers": { "Content-Type": "application/json", "Authorization": "Bearer ..." },
 *   "body": "{\"key\":\"value\"}",
 *   "timeout": 30000
 * }
 *
 * Response format (JSON string):
 * {
 *   "status": 200,
 *   "statusText": "OK",
 *   "headers": { "content-type": "application/json" },
 *   "body": "{\"result\":\"success\"}"
 * }
 *
 * Matches TurboModule spec: NativeNetworkModule.ts
 * Registered name: "NetworkModule"
 */

package com.anthropic.sdk.network

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import okhttp3.CertificatePinner
import okhttp3.Headers.Companion.toHeaders
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class NetworkModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NetworkModule"

        // Default timeouts
        private const val DEFAULT_CONNECT_TIMEOUT_MS = 15_000L
        private const val DEFAULT_READ_TIMEOUT_MS = 30_000L
        private const val DEFAULT_WRITE_TIMEOUT_MS = 30_000L
    }

    override fun getName(): String = NAME

    /**
     * The current certificate pinner configuration.
     * Updated via configurePins(). Starts with no pins (all certs accepted).
     */
    @Volatile
    private var certificatePinner: CertificatePinner = CertificatePinner.Builder().build()

    /**
     * OkHttpClient rebuilt when pins change. Access only via getClient().
     */
    @Volatile
    private var client: OkHttpClient = buildClient(certificatePinner, DEFAULT_READ_TIMEOUT_MS)

    /**
     * Build an OkHttpClient with the given certificate pinner and timeout.
     */
    private fun buildClient(pinner: CertificatePinner, timeoutMs: Long): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(pinner)
            .connectTimeout(DEFAULT_CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .writeTimeout(DEFAULT_WRITE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(false) // SDK handles retries at a higher level
            .build()
    }

    // -----------------------------------------------------------------------
    // configurePins
    // -----------------------------------------------------------------------

    /**
     * Configure certificate pins for subsequent requests.
     *
     * Accepts a JSON array of pin configurations:
     * [
     *   {
     *     "domain": "api.example.com",
     *     "pins": ["sha256/AAAA=", "sha256/BBBB="],
     *     "includeSubdomains": true
     *   }
     * ]
     *
     * Each domain requires at least one pin. Use "sha256/" prefix for the pin hash.
     * Setting includeSubdomains to true will pin all subdomains of the specified domain.
     *
     * @param pins JSON string containing an array of pin configurations
     * @param promise Promise resolved on success
     */
    @ReactMethod
    fun configurePins(pins: String, promise: Promise) {
        try {
            if (pins.isEmpty()) {
                promise.reject("PIN_CONFIG_ERROR", "configurePins() requires non-empty pin config")
                return
            }

            val pinArray = JSONArray(pins)
            val builder = CertificatePinner.Builder()

            for (i in 0 until pinArray.length()) {
                val pinConfig = pinArray.getJSONObject(i)

                val domain = pinConfig.getString("domain")
                if (domain.isNullOrEmpty()) {
                    promise.reject("PIN_CONFIG_ERROR", "Pin config at index $i has empty domain")
                    return
                }

                val pinHashes = pinConfig.getJSONArray("pins")
                if (pinHashes.length() == 0) {
                    promise.reject(
                        "PIN_CONFIG_ERROR",
                        "Pin config for '$domain' has no pin hashes"
                    )
                    return
                }

                val includeSubdomains = pinConfig.optBoolean("includeSubdomains", false)

                // OkHttp uses "*." prefix for subdomain matching
                val pattern = if (includeSubdomains) "**.$domain" else domain

                // Add all pins for this domain
                val hashStrings = mutableListOf<String>()
                for (j in 0 until pinHashes.length()) {
                    val pin = pinHashes.getString(j)
                    if (!pin.startsWith("sha256/")) {
                        promise.reject(
                            "PIN_CONFIG_ERROR",
                            "Pin '$pin' for '$domain' must start with 'sha256/'"
                        )
                        return
                    }
                    hashStrings.add(pin)
                }

                builder.add(pattern, *hashStrings.toTypedArray())
            }

            certificatePinner = builder.build()
            client = buildClient(certificatePinner, DEFAULT_READ_TIMEOUT_MS)

            promise.resolve(null)
        } catch (e: org.json.JSONException) {
            promise.reject(
                "PIN_CONFIG_ERROR",
                "Invalid pin configuration JSON: ${e.message}",
                e
            )
        } catch (e: Exception) {
            promise.reject(
                "PIN_CONFIG_ERROR",
                "Failed to configure pins: ${e.message}",
                e
            )
        }
    }

    // -----------------------------------------------------------------------
    // fetch
    // -----------------------------------------------------------------------

    /**
     * Execute an HTTP request with certificate pinning.
     *
     * @param url The fully-qualified URL to request
     * @param options JSON string with request options:
     *   - method: HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS). Default: GET
     *   - headers: Object of header key-value pairs
     *   - body: Request body string (for POST/PUT/PATCH)
     *   - timeout: Request timeout in milliseconds (overrides default)
     * @param promise Promise resolved with JSON response string:
     *   {
     *     "status": 200,
     *     "statusText": "OK",
     *     "headers": { ... },
     *     "body": "..."
     *   }
     */
    @ReactMethod
    fun fetch(url: String, options: String, promise: Promise) {
        try {
            if (url.isEmpty()) {
                promise.reject("FETCH_ERROR", "fetch() requires a non-empty URL")
                return
            }

            val opts = if (options.isNotEmpty()) JSONObject(options) else JSONObject()

            val method = opts.optString("method", "GET").uppercase()
            val timeoutMs = opts.optLong("timeout", DEFAULT_READ_TIMEOUT_MS)

            // Build request headers
            val headersObj = opts.optJSONObject("headers")
            val headerMap = mutableMapOf<String, String>()
            if (headersObj != null) {
                val keys = headersObj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    headerMap[key] = headersObj.getString(key)
                }
            }

            // Build request body (for methods that support it)
            val bodyString = opts.optString("body", "")
            val requestBody = when {
                method in setOf("POST", "PUT", "PATCH") -> {
                    val contentType = headerMap["Content-Type"]
                        ?: headerMap["content-type"]
                        ?: "application/json"
                    bodyString.toRequestBody(contentType.toMediaTypeOrNull())
                }
                method == "DELETE" && bodyString.isNotEmpty() -> {
                    val contentType = headerMap["Content-Type"]
                        ?: headerMap["content-type"]
                        ?: "application/json"
                    bodyString.toRequestBody(contentType.toMediaTypeOrNull())
                }
                else -> null
            }

            // Build the OkHttp request
            val requestBuilder = Request.Builder()
                .url(url)
                .method(method, requestBody)

            if (headerMap.isNotEmpty()) {
                requestBuilder.headers(headerMap.toHeaders())
            }

            val request = requestBuilder.build()

            // Use a per-request client if timeout differs from default
            val requestClient = if (timeoutMs != DEFAULT_READ_TIMEOUT_MS) {
                client.newBuilder()
                    .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                    .build()
            } else {
                client
            }

            // Execute on a background thread (OkHttp's enqueue handles this)
            requestClient.newCall(request).enqueue(object : okhttp3.Callback {
                override fun onFailure(call: okhttp3.Call, e: IOException) {
                    val errorCode = when {
                        e is javax.net.ssl.SSLPeerUnverifiedException -> "CERTIFICATE_PIN_MISMATCH"
                        e is javax.net.ssl.SSLHandshakeException -> "SSL_HANDSHAKE_FAILED"
                        e is java.net.SocketTimeoutException -> "TIMEOUT"
                        e is java.net.UnknownHostException -> "DNS_RESOLUTION_FAILED"
                        e is java.net.ConnectException -> "CONNECTION_REFUSED"
                        else -> "FETCH_ERROR"
                    }
                    promise.reject(errorCode, "Request failed: ${e.message}", e)
                }

                override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                    try {
                        val responseJson = JSONObject()
                        responseJson.put("status", response.code)
                        responseJson.put("statusText", response.message.ifEmpty { httpStatusText(response.code) })

                        // Collect response headers
                        val responseHeaders = JSONObject()
                        val headers = response.headers
                        for (i in 0 until headers.size) {
                            val name = headers.name(i).lowercase()
                            val value = headers.value(i)
                            // If header already exists, append with comma (per HTTP spec)
                            if (responseHeaders.has(name)) {
                                responseHeaders.put(name, "${responseHeaders.getString(name)}, $value")
                            } else {
                                responseHeaders.put(name, value)
                            }
                        }
                        responseJson.put("headers", responseHeaders)

                        // Read response body
                        val responseBody = response.body?.string() ?: ""
                        responseJson.put("body", responseBody)

                        response.close()
                        promise.resolve(responseJson.toString())
                    } catch (e: Exception) {
                        response.close()
                        promise.reject(
                            "FETCH_ERROR",
                            "Failed to read response: ${e.message}",
                            e
                        )
                    }
                }
            })
        } catch (e: org.json.JSONException) {
            promise.reject("FETCH_ERROR", "Invalid request options JSON: ${e.message}", e)
        } catch (e: IllegalArgumentException) {
            promise.reject("FETCH_ERROR", "Invalid request: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", "Failed to execute request: ${e.message}", e)
        }
    }

    /**
     * Map common HTTP status codes to their standard text.
     * Used as fallback when OkHttp response.message is empty (HTTP/2).
     */
    private fun httpStatusText(code: Int): String = when (code) {
        200 -> "OK"
        201 -> "Created"
        202 -> "Accepted"
        204 -> "No Content"
        301 -> "Moved Permanently"
        302 -> "Found"
        304 -> "Not Modified"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        403 -> "Forbidden"
        404 -> "Not Found"
        405 -> "Method Not Allowed"
        408 -> "Request Timeout"
        409 -> "Conflict"
        429 -> "Too Many Requests"
        500 -> "Internal Server Error"
        502 -> "Bad Gateway"
        503 -> "Service Unavailable"
        504 -> "Gateway Timeout"
        else -> ""
    }
}
