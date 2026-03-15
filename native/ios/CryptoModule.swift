/**
 * CryptoModule - iOS TurboModule for platform-native cryptographic operations
 *
 * Provides:
 * - Hardware-backed secure storage (iOS Keychain / kSecClassGenericPassword)
 * - AES-256-GCM encryption/decryption (CryptoKit)
 * - Cryptographic hashing: SHA-256, SHA-384, SHA-512 (CryptoKit)
 * - Symmetric key generation (CryptoKit SymmetricKey)
 * - RSA signature verification (Security framework SecKeyVerifySignature)
 *
 * Encryption format: base64(IV[12] || ciphertext || authTag[16])
 * Key derivation: PBKDF2 with salt "enterprise-module-sdk-v1", 100000 iterations, SHA-256
 *
 * Matches the JS CryptoAdapter (WebCrypto) wire format exactly so that data
 * encrypted on one platform can be decrypted on the other.
 */

import Foundation
import CryptoKit
import Security
import CommonCrypto

@objc(CryptoModule)
class CryptoModule: NSObject {

  // MARK: - Constants

  /// Keychain service identifier for all SDK secure storage entries
  private static let keychainService = "com.enterprise-module-sdk.secure-storage"

  /// PBKDF2 configuration — must match the JS CryptoAdapter exactly
  private static let pbkdf2Salt = "enterprise-module-sdk-v1"
  private static let pbkdf2Iterations: UInt32 = 100_000
  private static let aesKeyLength = 32  // 256 bits
  private static let ivLength = 12      // 96 bits — recommended for GCM

  // MARK: - Module Registration

  @objc
  static func moduleName() -> String {
    return "CryptoModule"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Hashing

  /// Compute a cryptographic hash of the input data.
  /// - Parameters:
  ///   - data: The UTF-8 string to hash
  ///   - algorithm: One of "SHA-256", "SHA-384", "SHA-512"
  ///   - resolve: Promise resolve callback with hex-encoded hash
  ///   - reject: Promise reject callback
  @objc
  func hash(
    _ data: String,
    algorithm: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !data.isEmpty else {
      reject("HASH_ERROR", "hash() requires a non-empty string for data", nil)
      return
    }

    guard let inputData = data.data(using: .utf8) else {
      reject("HASH_ERROR", "Failed to encode data as UTF-8", nil)
      return
    }

    let hexHash: String

    switch algorithm {
    case "SHA-256":
      let digest = SHA256.hash(data: inputData)
      hexHash = digest.map { String(format: "%02x", $0) }.joined()

    case "SHA-384":
      let digest = SHA384.hash(data: inputData)
      hexHash = digest.map { String(format: "%02x", $0) }.joined()

    case "SHA-512":
      let digest = SHA512.hash(data: inputData)
      hexHash = digest.map { String(format: "%02x", $0) }.joined()

    default:
      reject("HASH_ERROR", "Unsupported hash algorithm: \(algorithm). Supported: SHA-256, SHA-384, SHA-512", nil)
      return
    }

    resolve(hexHash)
  }

  // MARK: - Key Derivation (PBKDF2)

  /// Derive a 256-bit AES key from a passphrase using PBKDF2-SHA256.
  /// Must match the JS WebCrypto PBKDF2 derivation exactly.
  private func deriveKey(from passphrase: String) -> SymmetricKey? {
    guard let passphraseData = passphrase.data(using: .utf8),
          let saltData = CryptoModule.pbkdf2Salt.data(using: .utf8) else {
      return nil
    }

    var derivedKeyBytes = [UInt8](repeating: 0, count: CryptoModule.aesKeyLength)

    let status = passphraseData.withUnsafeBytes { passphrasePtr in
      saltData.withUnsafeBytes { saltPtr in
        CCKeyDerivationPBKDF(
          CCPBKDFAlgorithm(kCCPBKDF2),
          passphrasePtr.baseAddress?.assumingMemoryBound(to: Int8.self),
          passphraseData.count,
          saltPtr.baseAddress?.assumingMemoryBound(to: UInt8.self),
          saltData.count,
          CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
          CryptoModule.pbkdf2Iterations,
          &derivedKeyBytes,
          CryptoModule.aesKeyLength
        )
      }
    }

    guard status == kCCSuccess else {
      return nil
    }

    return SymmetricKey(data: Data(derivedKeyBytes))
  }

  // MARK: - Encryption

  /// Encrypt plaintext using AES-256-GCM.
  /// Output format: base64( IV[12] || ciphertext || authTag[16] )
  /// - Parameters:
  ///   - data: The UTF-8 string to encrypt
  ///   - key: The passphrase used for PBKDF2 key derivation
  ///   - resolve: Promise resolve callback with base64-encoded ciphertext
  ///   - reject: Promise reject callback
  @objc
  func encrypt(
    _ data: String,
    key: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !data.isEmpty else {
      reject("ENCRYPT_ERROR", "encrypt() requires a non-empty string for data", nil)
      return
    }
    guard !key.isEmpty else {
      reject("ENCRYPT_ERROR", "encrypt() requires a non-empty string for key", nil)
      return
    }

    guard let symmetricKey = deriveKey(from: key) else {
      reject("ENCRYPT_ERROR", "Failed to derive encryption key via PBKDF2", nil)
      return
    }

    guard let plaintextData = data.data(using: .utf8) else {
      reject("ENCRYPT_ERROR", "Failed to encode plaintext as UTF-8", nil)
      return
    }

    do {
      // AES-GCM with random 12-byte nonce
      let nonce = AES.GCM.Nonce()
      let sealedBox = try AES.GCM.seal(plaintextData, using: symmetricKey, nonce: nonce)

      // Combine: IV[12] || ciphertext || authTag[16]
      // sealedBox.nonce = 12 bytes, sealedBox.ciphertext = variable, sealedBox.tag = 16 bytes
      var combined = Data()
      combined.append(contentsOf: nonce)
      combined.append(sealedBox.ciphertext)
      combined.append(sealedBox.tag)

      let base64Result = combined.base64EncodedString()
      resolve(base64Result)
    } catch {
      reject("ENCRYPT_ERROR", "AES-GCM encryption failed: \(error.localizedDescription)", error)
    }
  }

  // MARK: - Decryption

  /// Decrypt ciphertext using AES-256-GCM.
  /// Input format: base64( IV[12] || ciphertext || authTag[16] )
  /// - Parameters:
  ///   - ciphertext: The base64-encoded ciphertext
  ///   - key: The passphrase used for PBKDF2 key derivation
  ///   - resolve: Promise resolve callback with UTF-8 plaintext
  ///   - reject: Promise reject callback
  @objc
  func decrypt(
    _ ciphertext: String,
    key: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !ciphertext.isEmpty else {
      reject("DECRYPT_ERROR", "decrypt() requires a non-empty string for ciphertext", nil)
      return
    }
    guard !key.isEmpty else {
      reject("DECRYPT_ERROR", "decrypt() requires a non-empty string for key", nil)
      return
    }

    guard let symmetricKey = deriveKey(from: key) else {
      reject("DECRYPT_ERROR", "Failed to derive decryption key via PBKDF2", nil)
      return
    }

    guard let combined = Data(base64Encoded: ciphertext) else {
      reject("DECRYPT_ERROR", "Failed to decode base64 ciphertext", nil)
      return
    }

    // Minimum size: IV(12) + at least 1 byte ciphertext + authTag(16) = 29
    let minLength = CryptoModule.ivLength + 1 + 16
    guard combined.count >= minLength else {
      reject("DECRYPT_ERROR", "Ciphertext too short: expected at least \(minLength) bytes, got \(combined.count)", nil)
      return
    }

    do {
      let ivData = combined.prefix(CryptoModule.ivLength)
      let tagData = combined.suffix(16)
      let ciphertextData = combined.dropFirst(CryptoModule.ivLength).dropLast(16)

      let nonce = try AES.GCM.Nonce(data: ivData)
      let sealedBox = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ciphertextData, tag: tagData)

      let decryptedData = try AES.GCM.open(sealedBox, using: symmetricKey)

      guard let plaintext = String(data: decryptedData, encoding: .utf8) else {
        reject("DECRYPT_ERROR", "Decrypted data is not valid UTF-8", nil)
        return
      }

      resolve(plaintext)
    } catch {
      reject("DECRYPT_ERROR", "AES-GCM decryption failed: \(error.localizedDescription)", error)
    }
  }

  // MARK: - Key Generation

  /// Generate a cryptographically secure 256-bit key.
  /// Returns hex-encoded string (64 characters).
  /// - Parameters:
  ///   - resolve: Promise resolve callback with hex-encoded key
  ///   - reject: Promise reject callback
  @objc
  func generateKey(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let key = SymmetricKey(size: .bits256)
    let hexKey = key.withUnsafeBytes { bytes in
      bytes.map { String(format: "%02x", $0) }.joined()
    }
    resolve(hexKey)
  }

  // MARK: - Signature Verification

  /// Verify an RSA signature using the Security framework.
  /// Supports RSA-PKCS1-v1_5 with SHA-256 (RSASSA-PKCS1-v1_5).
  /// - Parameters:
  ///   - data: The original data that was signed (UTF-8 string)
  ///   - signature: Base64-encoded signature
  ///   - publicKey: PEM-encoded RSA public key (SPKI format)
  ///   - resolve: Promise resolve callback with boolean
  ///   - reject: Promise reject callback
  @objc
  func verifySignature(
    _ data: String,
    signature: String,
    publicKey: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !data.isEmpty else {
      reject("VERIFY_ERROR", "verifySignature() requires a non-empty string for data", nil)
      return
    }
    guard !signature.isEmpty else {
      reject("VERIFY_ERROR", "verifySignature() requires a non-empty string for signature", nil)
      return
    }
    guard !publicKey.isEmpty else {
      reject("VERIFY_ERROR", "verifySignature() requires a non-empty string for publicKey", nil)
      return
    }

    // Decode base64 signature
    guard let signatureData = Data(base64Encoded: signature) else {
      reject("VERIFY_ERROR", "Failed to decode base64 signature", nil)
      return
    }

    // Encode data as UTF-8
    guard let dataBytes = data.data(using: .utf8) else {
      reject("VERIFY_ERROR", "Failed to encode data as UTF-8", nil)
      return
    }

    // Parse PEM public key -> DER
    guard let keyDer = parsePEMPublicKey(publicKey) else {
      reject("VERIFY_ERROR", "Failed to parse PEM public key", nil)
      return
    }

    // Import the public key via Security framework
    let keyAttributes: [CFString: Any] = [
      kSecAttrKeyType: kSecAttrKeyTypeRSA,
      kSecAttrKeyClass: kSecAttrKeyClassPublic,
    ]

    var error: Unmanaged<CFError>?
    guard let secKey = SecKeyCreateWithData(keyDer as CFData, keyAttributes as CFDictionary, &error) else {
      let errMsg = error?.takeRetainedValue().localizedDescription ?? "Unknown error"
      reject("VERIFY_ERROR", "Failed to create SecKey from public key data: \(errMsg)", nil)
      return
    }

    // Verify RSA signature with PKCS1 padding and SHA-256
    let isValid = SecKeyVerifySignature(
      secKey,
      .rsaSignatureMessagePKCS1v15SHA256,
      dataBytes as CFData,
      signatureData as CFData,
      &error
    )

    if let verifyError = error?.takeRetainedValue(), !isValid {
      // Not a fatal error — signature just didn't verify
      let errDesc = verifyError.localizedDescription
      // Only reject for actual errors, not for "signature mismatch"
      if errDesc.contains("not valid") || errDesc.contains("verify") {
        resolve(false)
        return
      }
      reject("VERIFY_ERROR", "Signature verification error: \(errDesc)", nil)
      return
    }

    resolve(isValid)
  }

  /// Parse a PEM-encoded public key into raw DER Data.
  /// Strips "-----BEGIN PUBLIC KEY-----" / "-----END PUBLIC KEY-----" headers and base64-decodes.
  private func parsePEMPublicKey(_ pem: String) -> Data? {
    let stripped = pem
      .replacingOccurrences(of: "-----BEGIN PUBLIC KEY-----", with: "")
      .replacingOccurrences(of: "-----END PUBLIC KEY-----", with: "")
      .replacingOccurrences(of: "-----BEGIN RSA PUBLIC KEY-----", with: "")
      .replacingOccurrences(of: "-----END RSA PUBLIC KEY-----", with: "")
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")

    return Data(base64Encoded: stripped)
  }

  // MARK: - Secure Storage (Keychain)

  /// Store a value securely in the iOS Keychain using kSecClassGenericPassword.
  /// - Parameters:
  ///   - key: The storage key identifier
  ///   - value: The UTF-8 string value to store
  ///   - resolve: Promise resolve callback
  ///   - reject: Promise reject callback
  @objc
  func secureStore(
    _ key: String,
    value: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !key.isEmpty else {
      reject("KEYCHAIN_ERROR", "secureStore() requires a non-empty key", nil)
      return
    }

    guard let valueData = value.data(using: .utf8) else {
      reject("KEYCHAIN_ERROR", "Failed to encode value as UTF-8", nil)
      return
    }

    // Build the Keychain query
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: CryptoModule.keychainService,
      kSecAttrAccount: key,
      kSecValueData: valueData,
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]

    // Delete any existing item first (update = delete + add for simplicity and reliability)
    let deleteQuery: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: CryptoModule.keychainService,
      kSecAttrAccount: key,
    ]
    SecItemDelete(deleteQuery as CFDictionary)

    // Add the new item
    let status = SecItemAdd(query as CFDictionary, nil)

    if status == errSecSuccess {
      resolve(nil)
    } else {
      reject(
        "KEYCHAIN_ERROR",
        "Failed to store value in Keychain (OSStatus: \(status))",
        NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
      )
    }
  }

  /// Retrieve a value from the iOS Keychain.
  /// - Parameters:
  ///   - key: The storage key identifier
  ///   - resolve: Promise resolve callback with the stored string or null
  ///   - reject: Promise reject callback
  @objc
  func secureRetrieve(
    _ key: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !key.isEmpty else {
      reject("KEYCHAIN_ERROR", "secureRetrieve() requires a non-empty key", nil)
      return
    }

    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: CryptoModule.keychainService,
      kSecAttrAccount: key,
      kSecReturnData: true,
      kSecMatchLimit: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    switch status {
    case errSecSuccess:
      if let data = item as? Data,
         let value = String(data: data, encoding: .utf8) {
        resolve(value)
      } else {
        resolve(nil)
      }

    case errSecItemNotFound:
      resolve(nil)

    default:
      reject(
        "KEYCHAIN_ERROR",
        "Failed to retrieve value from Keychain (OSStatus: \(status))",
        NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
      )
    }
  }

  /// Delete a value from the iOS Keychain.
  /// - Parameters:
  ///   - key: The storage key identifier
  ///   - resolve: Promise resolve callback
  ///   - reject: Promise reject callback
  @objc
  func secureDelete(
    _ key: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !key.isEmpty else {
      reject("KEYCHAIN_ERROR", "secureDelete() requires a non-empty key", nil)
      return
    }

    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: CryptoModule.keychainService,
      kSecAttrAccount: key,
    ]

    let status = SecItemDelete(query as CFDictionary)

    // errSecItemNotFound is acceptable — idempotent delete
    if status == errSecSuccess || status == errSecItemNotFound {
      resolve(nil)
    } else {
      reject(
        "KEYCHAIN_ERROR",
        "Failed to delete value from Keychain (OSStatus: \(status))",
        NSError(domain: NSOSStatusErrorDomain, code: Int(status), userInfo: nil)
      )
    }
  }
}
