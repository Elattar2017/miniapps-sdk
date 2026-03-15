/**
 * CryptoModule - Android TurboModule for platform-native cryptographic operations
 *
 * Provides hardware-backed secure storage (Android Keystore / StrongBox TEE),
 * hashing (SHA-256/384/512), AES-256-GCM encryption/decryption, key generation,
 * and RSA signature verification.
 *
 * Encryption format: base64( IV[12] || ciphertext || authTag[16] )
 * Key derivation: PBKDF2WithHmacSHA256 (100,000 iterations, fixed salt)
 *
 * Matches the WebCrypto CryptoAdapter output format exactly so that data
 * encrypted on one platform can be decrypted on the other.
 */

package com.anthropic.sdk.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyFactory
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

@RequiresApi(Build.VERSION_CODES.M)
class CryptoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CryptoModule"

        // AES-256-GCM configuration
        private const val AES_ALGORITHM = "AES/GCM/NoPadding"
        private const val IV_LENGTH_BYTES = 12        // 96 bits — recommended for GCM
        private const val GCM_TAG_LENGTH_BITS = 128   // 16 bytes auth tag

        // PBKDF2 configuration — must match CryptoAdapter.ts exactly
        private const val PBKDF2_ALGORITHM = "PBKDF2WithHmacSHA256"
        private const val PBKDF2_SALT = "enterprise-module-sdk-v1"
        private const val PBKDF2_ITERATIONS = 100_000
        private const val AES_KEY_LENGTH_BITS = 256

        // Android Keystore constants
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val SECURE_STORAGE_KEY_ALIAS = "sdk_secure_storage_master_key"

        // Secure storage prefix for Keystore-backed encrypted values
        private const val STORAGE_PREFS_NAME = "sdk_encrypted_storage"
    }

    override fun getName(): String = NAME

    private val secureRandom = SecureRandom()

    /**
     * Lazily initialized Android Keystore instance.
     */
    private val keyStore: KeyStore by lazy {
        KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    }

    /**
     * SharedPreferences used to persist encrypted data for secureStore/secureRetrieve.
     * The values are encrypted with a master key held in the Android Keystore.
     */
    private val encryptedPrefs by lazy {
        reactApplicationContext.getSharedPreferences(STORAGE_PREFS_NAME, 0)
    }

    // -----------------------------------------------------------------------
    // PBKDF2 Key Derivation
    // -----------------------------------------------------------------------

    /**
     * Derive an AES-256 key from a string passphrase using PBKDF2WithHmacSHA256.
     * Uses the same parameters as the TypeScript CryptoAdapter for cross-platform
     * interoperability.
     */
    private fun deriveKey(passphrase: String): SecretKeySpec {
        val factory = SecretKeyFactory.getInstance(PBKDF2_ALGORITHM)
        val spec = PBEKeySpec(
            passphrase.toCharArray(),
            PBKDF2_SALT.toByteArray(Charsets.UTF_8),
            PBKDF2_ITERATIONS,
            AES_KEY_LENGTH_BITS
        )
        val secret = factory.generateSecret(spec)
        return SecretKeySpec(secret.encoded, "AES")
    }

    // -----------------------------------------------------------------------
    // Hashing
    // -----------------------------------------------------------------------

    /**
     * Compute a cryptographic hash of the input data.
     *
     * @param data The UTF-8 string to hash
     * @param algorithm One of "SHA-256", "SHA-384", "SHA-512"
     * @param promise Promise resolved with hex-encoded hash string
     */
    @ReactMethod
    fun hash(data: String, algorithm: String, promise: Promise) {
        try {
            val validAlgorithms = setOf("SHA-256", "SHA-384", "SHA-512")
            if (algorithm !in validAlgorithms) {
                promise.reject(
                    "HASH_ERROR",
                    "Unsupported hash algorithm: $algorithm. Supported: $validAlgorithms"
                )
                return
            }

            val digest = MessageDigest.getInstance(algorithm)
            val hashBytes = digest.digest(data.toByteArray(Charsets.UTF_8))
            val hexString = hashBytes.joinToString("") { "%02x".format(it) }
            promise.resolve(hexString)
        } catch (e: Exception) {
            promise.reject("HASH_ERROR", "Failed to compute hash: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // Encryption
    // -----------------------------------------------------------------------

    /**
     * Encrypt plaintext using AES-256-GCM.
     *
     * Output format: base64( IV[12 bytes] || ciphertext || authTag[16 bytes] )
     * The javax.crypto GCM cipher appends the auth tag to the ciphertext output,
     * which matches the WebCrypto API format.
     *
     * @param data The UTF-8 string to encrypt
     * @param key The passphrase from which the AES key is derived via PBKDF2
     * @param promise Promise resolved with base64-encoded ciphertext
     */
    @ReactMethod
    fun encrypt(data: String, key: String, promise: Promise) {
        try {
            if (data.isEmpty()) {
                promise.reject("ENCRYPT_ERROR", "encrypt() requires non-empty data")
                return
            }
            if (key.isEmpty()) {
                promise.reject("ENCRYPT_ERROR", "encrypt() requires non-empty key")
                return
            }

            val derivedKey = deriveKey(key)

            // Generate random IV
            val iv = ByteArray(IV_LENGTH_BYTES)
            secureRandom.nextBytes(iv)

            val cipher = Cipher.getInstance(AES_ALGORITHM)
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
            cipher.init(Cipher.ENCRYPT_MODE, derivedKey, gcmSpec)

            // GCM cipher output = ciphertext || authTag (appended automatically)
            val ciphertextWithTag = cipher.doFinal(data.toByteArray(Charsets.UTF_8))

            // Combine: IV || ciphertext+authTag
            val combined = ByteArray(IV_LENGTH_BYTES + ciphertextWithTag.size)
            System.arraycopy(iv, 0, combined, 0, IV_LENGTH_BYTES)
            System.arraycopy(ciphertextWithTag, 0, combined, IV_LENGTH_BYTES, ciphertextWithTag.size)

            val encoded = Base64.encodeToString(combined, Base64.NO_WRAP)
            promise.resolve(encoded)
        } catch (e: Exception) {
            promise.reject("ENCRYPT_ERROR", "Failed to encrypt: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // Decryption
    // -----------------------------------------------------------------------

    /**
     * Decrypt ciphertext using AES-256-GCM.
     *
     * Input format: base64( IV[12 bytes] || ciphertext || authTag[16 bytes] )
     * The javax.crypto GCM cipher expects ciphertext+authTag as a single input,
     * which matches the WebCrypto API format.
     *
     * @param ciphertext The base64-encoded ciphertext (IV + encrypted data + auth tag)
     * @param key The passphrase from which the AES key is derived via PBKDF2
     * @param promise Promise resolved with UTF-8 plaintext
     */
    @ReactMethod
    fun decrypt(ciphertext: String, key: String, promise: Promise) {
        try {
            if (ciphertext.isEmpty()) {
                promise.reject("DECRYPT_ERROR", "decrypt() requires non-empty ciphertext")
                return
            }
            if (key.isEmpty()) {
                promise.reject("DECRYPT_ERROR", "decrypt() requires non-empty key")
                return
            }

            val combined = Base64.decode(ciphertext, Base64.NO_WRAP)

            if (combined.size < IV_LENGTH_BYTES + 1) {
                promise.reject("DECRYPT_ERROR", "Decryption failed: ciphertext too short")
                return
            }

            val derivedKey = deriveKey(key)

            // Extract IV and ciphertext+authTag
            val iv = combined.copyOfRange(0, IV_LENGTH_BYTES)
            val encryptedData = combined.copyOfRange(IV_LENGTH_BYTES, combined.size)

            val cipher = Cipher.getInstance(AES_ALGORITHM)
            val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
            cipher.init(Cipher.DECRYPT_MODE, derivedKey, gcmSpec)

            val plainBytes = cipher.doFinal(encryptedData)
            promise.resolve(String(plainBytes, Charsets.UTF_8))
        } catch (e: javax.crypto.AEADBadTagException) {
            promise.reject("DECRYPT_ERROR", "Decryption failed: key mismatch or data tampered", e)
        } catch (e: Exception) {
            promise.reject("DECRYPT_ERROR", "Failed to decrypt: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // Key Generation
    // -----------------------------------------------------------------------

    /**
     * Generate a 256-bit cryptographically secure random key.
     *
     * @param promise Promise resolved with a 64-character hex string (256 bits)
     */
    @ReactMethod
    fun generateKey(promise: Promise) {
        try {
            val keyBytes = ByteArray(32) // 256 bits
            secureRandom.nextBytes(keyBytes)
            val hexKey = keyBytes.joinToString("") { "%02x".format(it) }
            promise.resolve(hexKey)
        } catch (e: Exception) {
            promise.reject("KEYGEN_ERROR", "Failed to generate key: ${e.message}", e)
        }
    }

    // -----------------------------------------------------------------------
    // Signature Verification
    // -----------------------------------------------------------------------

    /**
     * Verify an RSA signature (SHA256withRSA / RSASSA-PKCS1-v1_5).
     *
     * @param data The original data that was signed (UTF-8 string)
     * @param signature Base64-encoded signature bytes
     * @param publicKey PEM-encoded public key (SPKI format)
     * @param promise Promise resolved with true if signature is valid, false otherwise
     */
    @ReactMethod
    fun verifySignature(data: String, signature: String, publicKey: String, promise: Promise) {
        try {
            if (data.isEmpty()) {
                promise.reject("VERIFY_ERROR", "verifySignature() requires non-empty data")
                return
            }
            if (signature.isEmpty()) {
                promise.reject("VERIFY_ERROR", "verifySignature() requires non-empty signature")
                return
            }
            if (publicKey.isEmpty()) {
                promise.reject("VERIFY_ERROR", "verifySignature() requires non-empty publicKey")
                return
            }

            // Parse PEM public key → DER bytes
            val pemBody = publicKey
                .replace("-----BEGIN PUBLIC KEY-----", "")
                .replace("-----END PUBLIC KEY-----", "")
                .replace("\\s".toRegex(), "")

            val keyBytes = Base64.decode(pemBody, Base64.NO_WRAP)
            val keySpec = X509EncodedKeySpec(keyBytes)
            val keyFactory = KeyFactory.getInstance("RSA")
            val rsaPublicKey = keyFactory.generatePublic(keySpec)

            // Decode signature from base64
            val signatureBytes = Base64.decode(signature, Base64.NO_WRAP)

            // Verify with SHA256withRSA (RSASSA-PKCS1-v1_5)
            val sig = java.security.Signature.getInstance("SHA256withRSA")
            sig.initVerify(rsaPublicKey)
            sig.update(data.toByteArray(Charsets.UTF_8))

            val isValid = sig.verify(signatureBytes)
            promise.resolve(isValid)
        } catch (e: Exception) {
            // Signature verification failures are not errors — return false
            promise.resolve(false)
        }
    }

    // -----------------------------------------------------------------------
    // Secure Storage (Android Keystore-backed)
    // -----------------------------------------------------------------------

    /**
     * Get or create the master encryption key in the Android Keystore.
     * This key never leaves the hardware security module (StrongBox TEE when available).
     */
    private fun getMasterKey(): SecretKey {
        val existingKey = keyStore.getEntry(SECURE_STORAGE_KEY_ALIAS, null)
        if (existingKey is KeyStore.SecretKeyEntry) {
            return existingKey.secretKey
        }

        val keyGenSpec = KeyGenParameterSpec.Builder(
            SECURE_STORAGE_KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .apply {
                // Use StrongBox TEE if available (API 28+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    try {
                        setIsStrongBoxBacked(true)
                    } catch (_: Exception) {
                        // StrongBox not available on this device; fall back to standard TEE
                    }
                }
            }
            .build()

        val keyGenerator = javax.crypto.KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )
        keyGenerator.init(keyGenSpec)
        return keyGenerator.generateKey()
    }

    /**
     * Encrypt a value with the Keystore-held master key for secure local storage.
     * Returns base64( IV || ciphertext+authTag ).
     */
    private fun encryptWithMasterKey(plaintext: String): String {
        val masterKey = getMasterKey()

        val cipher = Cipher.getInstance(AES_ALGORITHM)
        // Let the Keystore generate the IV (randomized encryption required)
        cipher.init(Cipher.ENCRYPT_MODE, masterKey)

        val iv = cipher.iv
        val ciphertextWithTag = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        val combined = ByteArray(iv.size + ciphertextWithTag.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ciphertextWithTag, 0, combined, iv.size, ciphertextWithTag.size)

        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    /**
     * Decrypt a value with the Keystore-held master key.
     * Input: base64( IV[12] || ciphertext+authTag )
     */
    private fun decryptWithMasterKey(encryptedValue: String): String {
        val masterKey = getMasterKey()
        val combined = Base64.decode(encryptedValue, Base64.NO_WRAP)

        val iv = combined.copyOfRange(0, IV_LENGTH_BYTES)
        val encryptedData = combined.copyOfRange(IV_LENGTH_BYTES, combined.size)

        val cipher = Cipher.getInstance(AES_ALGORITHM)
        val gcmSpec = GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv)
        cipher.init(Cipher.DECRYPT_MODE, masterKey, gcmSpec)

        val plainBytes = cipher.doFinal(encryptedData)
        return String(plainBytes, Charsets.UTF_8)
    }

    /**
     * Store a value securely using Android Keystore-backed encryption.
     * The value is encrypted with a hardware-backed master key and persisted
     * in SharedPreferences. The master key never leaves the Android Keystore.
     *
     * @param key The storage key identifier
     * @param value The UTF-8 string value to store
     * @param promise Promise resolved on success
     */
    @ReactMethod
    fun secureStore(key: String, value: String, promise: Promise) {
        try {
            val encrypted = encryptWithMasterKey(value)
            encryptedPrefs.edit().putString(key, encrypted).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject(
                "SECURE_STORE_ERROR",
                "Failed to store value securely: ${e.message}",
                e
            )
        }
    }

    /**
     * Retrieve a value from Android Keystore-backed secure storage.
     *
     * @param key The storage key identifier
     * @param promise Promise resolved with the decrypted string or null if not found
     */
    @ReactMethod
    fun secureRetrieve(key: String, promise: Promise) {
        try {
            val encrypted = encryptedPrefs.getString(key, null)
            if (encrypted == null) {
                promise.resolve(null)
                return
            }

            val decrypted = decryptWithMasterKey(encrypted)
            promise.resolve(decrypted)
        } catch (e: Exception) {
            promise.reject(
                "SECURE_RETRIEVE_ERROR",
                "Failed to retrieve value: ${e.message}",
                e
            )
        }
    }

    /**
     * Delete a value from secure storage.
     *
     * @param key The storage key identifier
     * @param promise Promise resolved on success
     */
    @ReactMethod
    fun secureDelete(key: String, promise: Promise) {
        try {
            encryptedPrefs.edit().remove(key).apply()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject(
                "SECURE_DELETE_ERROR",
                "Failed to delete value: ${e.message}",
                e
            )
        }
    }
}
