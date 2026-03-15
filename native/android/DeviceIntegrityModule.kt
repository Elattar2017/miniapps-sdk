/**
 * DeviceIntegrityModule - Android TurboModule for Play Integrity attestation
 *
 * Provides device integrity verification via Google Play Integrity API.
 * Used in telecom deployments to ensure API calls originate from legitimate,
 * unmodified app instances on non-rooted devices.
 *
 * Flow:
 * 1. JS calls attestDevice(challenge) with a server-provided nonce
 * 2. Native requests an integrity token from Play Integrity API
 * 3. Token is returned to JS for caching and later exchange with attestation server
 * 4. verifyAttestation(token) sends the token to backend for full verdict verification
 *
 * Matches TurboModule spec: NativeDeviceIntegrityModule.ts
 * Registered name: "DeviceIntegrityModule"
 */

package com.anthropic.sdk.integrity

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import org.json.JSONObject

class DeviceIntegrityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DeviceIntegrityModule"
    }

    override fun getName(): String = NAME

    /**
     * The Play Integrity manager instance, lazily created from the current activity context.
     */
    private val integrityManager by lazy {
        IntegrityManagerFactory.create(reactApplicationContext)
    }

    // -----------------------------------------------------------------------
    // attestDevice
    // -----------------------------------------------------------------------

    /**
     * Request a Play Integrity token for the given challenge nonce.
     *
     * The challenge should be a server-generated, single-use nonce to prevent
     * replay attacks. The returned token is an opaque string that must be sent
     * to the attestation server for verdict decryption and verification.
     *
     * @param challenge Server-provided nonce (base64 or hex string)
     * @param promise Promise resolved with the integrity token string
     */
    @ReactMethod
    fun attestDevice(challenge: String, promise: Promise) {
        try {
            if (challenge.isEmpty()) {
                promise.reject(
                    "ATTESTATION_ERROR",
                    "attestDevice() requires a non-empty challenge nonce"
                )
                return
            }

            val request = IntegrityTokenRequest.builder()
                .setNonce(challenge)
                .build()

            integrityManager.requestIntegrityToken(request)
                .addOnSuccessListener { response ->
                    val token = response.token()
                    if (token.isNullOrEmpty()) {
                        promise.reject(
                            "ATTESTATION_ERROR",
                            "Play Integrity returned an empty token"
                        )
                    } else {
                        promise.resolve(token)
                    }
                }
                .addOnFailureListener { exception ->
                    val errorCode = when {
                        exception.message?.contains("API_NOT_AVAILABLE") == true ->
                            "INTEGRITY_API_NOT_AVAILABLE"
                        exception.message?.contains("NETWORK_ERROR") == true ->
                            "INTEGRITY_NETWORK_ERROR"
                        exception.message?.contains("PLAY_STORE_NOT_FOUND") == true ->
                            "INTEGRITY_PLAY_STORE_NOT_FOUND"
                        exception.message?.contains("APP_NOT_INSTALLED") == true ->
                            "INTEGRITY_APP_NOT_INSTALLED"
                        exception.message?.contains("TOO_MANY_REQUESTS") == true ->
                            "INTEGRITY_RATE_LIMITED"
                        else -> "ATTESTATION_ERROR"
                    }
                    promise.reject(
                        errorCode,
                        "Play Integrity attestation failed: ${exception.message}",
                        exception
                    )
                }
        } catch (e: Exception) {
            promise.reject(
                "ATTESTATION_ERROR",
                "Failed to initiate attestation: ${e.message}",
                e
            )
        }
    }

    // -----------------------------------------------------------------------
    // verifyAttestation
    // -----------------------------------------------------------------------

    /**
     * Verify an integrity token locally by decoding its structure.
     *
     * IMPORTANT: Full verification (decryption + verdict interpretation) MUST be
     * performed server-side using Google's Play Integrity API server SDK. This
     * local method performs a structural validity check and returns true if the
     * token appears well-formed. The actual verdict (MEETS_DEVICE_INTEGRITY,
     * MEETS_BASIC_INTEGRITY, etc.) can only be determined server-side.
     *
     * For production use, the token should be sent to your attestation backend
     * endpoint via the AttestationTokenManager, which handles the full
     * nonce → attest → exchange → cache flow.
     *
     * @param token The integrity token string obtained from attestDevice()
     * @param promise Promise resolved with true if the token is structurally valid
     */
    @ReactMethod
    fun verifyAttestation(token: String, promise: Promise) {
        try {
            if (token.isEmpty()) {
                promise.reject(
                    "VERIFY_ERROR",
                    "verifyAttestation() requires a non-empty token"
                )
                return
            }

            // Play Integrity tokens are JWS (JSON Web Signature) tokens with 3 dot-separated parts.
            // We perform a structural check here; full verification is server-side.
            val parts = token.split(".")
            if (parts.size != 3) {
                promise.resolve(false)
                return
            }

            // Validate that each part is valid base64url
            try {
                for (part in parts) {
                    if (part.isEmpty()) {
                        promise.resolve(false)
                        return
                    }
                    // Base64url decode (replace URL-safe chars, add padding)
                    val base64 = part
                        .replace('-', '+')
                        .replace('_', '/')
                    val padded = when (base64.length % 4) {
                        2 -> "$base64=="
                        3 -> "$base64="
                        else -> base64
                    }
                    android.util.Base64.decode(padded, android.util.Base64.DEFAULT)
                }
            } catch (e: IllegalArgumentException) {
                promise.resolve(false)
                return
            }

            // Decode the payload (second part) to check for expected fields
            try {
                val payloadBase64 = parts[1]
                    .replace('-', '+')
                    .replace('_', '/')
                val paddedPayload = when (payloadBase64.length % 4) {
                    2 -> "$payloadBase64=="
                    3 -> "$payloadBase64="
                    else -> payloadBase64
                }
                val payloadBytes = android.util.Base64.decode(
                    paddedPayload,
                    android.util.Base64.DEFAULT
                )
                val payloadJson = JSONObject(String(payloadBytes, Charsets.UTF_8))

                // The token payload should contain a requestDetails or tokenPayloadExternal field
                // indicating it's a genuine Play Integrity token. If we can parse it as JSON
                // with expected structure, it passes the local check.
                val hasExpectedStructure = payloadJson.has("requestDetails") ||
                    payloadJson.has("tokenPayloadExternal") ||
                    payloadJson.has("appIntegrity") ||
                    payloadJson.has("deviceIntegrity")

                promise.resolve(hasExpectedStructure)
            } catch (e: Exception) {
                // If we can't parse the payload, the token is structurally invalid
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject(
                "VERIFY_ERROR",
                "Failed to verify attestation token: ${e.message}",
                e
            )
        }
    }
}
