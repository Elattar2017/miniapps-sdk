/**
 * DeviceIntegrityModule - iOS TurboModule for device attestation
 *
 * Provides App Attest-based device integrity verification using DCAppAttestService.
 * Used by the AttestationTokenManager in telecom deployments to ensure API calls
 * originate from legitimate, uncompromised app instances.
 *
 * Flow:
 * 1. attestDevice(challenge) -> generates key + attestation using App Attest
 * 2. verifyAttestation(token) -> verifies attestation (delegates to backend in production;
 *    locally checks service availability and token format)
 *
 * Requires iOS 14.0+ for App Attest APIs.
 */

import Foundation
import DeviceCheck
import CryptoKit

@objc(DeviceIntegrityModule)
class DeviceIntegrityModule: NSObject {

  // MARK: - Key Storage

  /// Keychain key for persisting the App Attest key identifier
  private static let attestKeyIdKey = "com.enterprise-module-sdk.app-attest-key-id"
  private static let keychainService = "com.enterprise-module-sdk.device-integrity"

  // MARK: - Module Registration

  @objc
  static func moduleName() -> String {
    return "DeviceIntegrityModule"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Attest Device

  /// Generate a device attestation using App Attest.
  ///
  /// The challenge string is hashed (SHA-256) and used as the client data hash
  /// for the attestation. On first call, generates a new App Attest key and
  /// persists the key ID in the Keychain. On subsequent calls, reuses the
  /// existing key to generate assertions.
  ///
  /// - Parameters:
  ///   - challenge: Server-provided challenge/nonce string
  ///   - resolve: Promise resolve callback with base64-encoded attestation object
  ///   - reject: Promise reject callback
  @objc
  func attestDevice(
    _ challenge: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !challenge.isEmpty else {
      reject("ATTEST_ERROR", "attestDevice() requires a non-empty challenge", nil)
      return
    }

    if #available(iOS 14.0, *) {
      let service = DCAppAttestService.shared

      guard service.isSupported else {
        reject("ATTEST_ERROR", "App Attest is not supported on this device", nil)
        return
      }

      // Hash the challenge to produce clientDataHash (32 bytes)
      guard let challengeData = challenge.data(using: .utf8) else {
        reject("ATTEST_ERROR", "Failed to encode challenge as UTF-8", nil)
        return
      }
      let clientDataHash = Data(SHA256.hash(data: challengeData))

      // Check if we already have a key ID
      if let existingKeyId = loadKeyId() {
        // Generate an assertion with the existing key
        generateAssertion(service: service, keyId: existingKeyId, clientDataHash: clientDataHash, resolve: resolve, reject: reject)
      } else {
        // Generate a new App Attest key
        service.generateKey { [weak self] keyId, error in
          guard let self = self else { return }

          if let error = error {
            reject("ATTEST_ERROR", "Failed to generate App Attest key: \(error.localizedDescription)", error)
            return
          }

          guard let keyId = keyId else {
            reject("ATTEST_ERROR", "App Attest key generation returned nil key ID", nil)
            return
          }

          // Persist the key ID for future attestations
          self.saveKeyId(keyId)

          // Generate attestation with the new key
          service.attestKey(keyId, clientDataHash: clientDataHash) { attestationObject, attestError in
            if let attestError = attestError {
              // If attestation fails, clean up the key ID so we retry next time
              self.deleteKeyId()
              reject("ATTEST_ERROR", "App Attest attestKey failed: \(attestError.localizedDescription)", attestError)
              return
            }

            guard let attestationObject = attestationObject else {
              self.deleteKeyId()
              reject("ATTEST_ERROR", "App Attest attestKey returned nil attestation object", nil)
              return
            }

            let base64Attestation = attestationObject.base64EncodedString()
            resolve(base64Attestation)
          }
        }
      }
    } else {
      reject("ATTEST_ERROR", "App Attest requires iOS 14.0 or later", nil)
    }
  }

  // MARK: - Verify Attestation

  /// Verify an attestation token.
  ///
  /// In production, attestation verification is performed server-side by Apple's
  /// attestation verification endpoint. This local check validates:
  /// 1. The App Attest service is available on this device
  /// 2. The token is a valid non-empty base64 string
  ///
  /// The actual cryptographic verification of the attestation object (CBOR decoding,
  /// certificate chain validation, nonce matching) MUST be done on the backend.
  ///
  /// - Parameters:
  ///   - token: Base64-encoded attestation token to verify
  ///   - resolve: Promise resolve callback with boolean
  ///   - reject: Promise reject callback
  @objc
  func verifyAttestation(
    _ token: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !token.isEmpty else {
      reject("VERIFY_ATTEST_ERROR", "verifyAttestation() requires a non-empty token", nil)
      return
    }

    // Validate that the token is valid base64
    guard Data(base64Encoded: token) != nil else {
      resolve(false)
      return
    }

    if #available(iOS 14.0, *) {
      let service = DCAppAttestService.shared

      // Local check: service must be supported
      guard service.isSupported else {
        resolve(false)
        return
      }

      // Local check passed — token format is valid and service is available.
      // Full verification must be done server-side.
      resolve(true)
    } else {
      // iOS < 14.0: App Attest not available
      resolve(false)
    }
  }

  // MARK: - Assertion Generation (for returning attestation users)

  @available(iOS 14.0, *)
  private func generateAssertion(
    service: DCAppAttestService,
    keyId: String,
    clientDataHash: Data,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    service.generateAssertion(keyId, clientDataHash: clientDataHash) { assertionObject, error in
      if let error = error {
        reject("ATTEST_ERROR", "App Attest generateAssertion failed: \(error.localizedDescription)", error)
        return
      }

      guard let assertionObject = assertionObject else {
        reject("ATTEST_ERROR", "App Attest generateAssertion returned nil", nil)
        return
      }

      let base64Assertion = assertionObject.base64EncodedString()
      resolve(base64Assertion)
    }
  }

  // MARK: - Key ID Persistence (Keychain)

  private func saveKeyId(_ keyId: String) {
    guard let data = keyId.data(using: .utf8) else { return }

    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: DeviceIntegrityModule.keychainService,
      kSecAttrAccount: DeviceIntegrityModule.attestKeyIdKey,
      kSecValueData: data,
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]

    // Delete existing, then add
    let deleteQuery: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: DeviceIntegrityModule.keychainService,
      kSecAttrAccount: DeviceIntegrityModule.attestKeyIdKey,
    ]
    SecItemDelete(deleteQuery as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
  }

  private func loadKeyId() -> String? {
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: DeviceIntegrityModule.keychainService,
      kSecAttrAccount: DeviceIntegrityModule.attestKeyIdKey,
      kSecReturnData: true,
      kSecMatchLimit: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    guard status == errSecSuccess,
          let data = item as? Data,
          let keyId = String(data: data, encoding: .utf8) else {
      return nil
    }

    return keyId
  }

  private func deleteKeyId() {
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: DeviceIntegrityModule.keychainService,
      kSecAttrAccount: DeviceIntegrityModule.attestKeyIdKey,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
