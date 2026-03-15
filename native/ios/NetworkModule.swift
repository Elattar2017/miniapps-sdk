/**
 * NetworkModule - iOS TurboModule for certificate-pinned network requests
 *
 * Provides native-level HTTPS requests with TLS certificate pinning enforcement.
 * The TLS delegate compares SHA-256 hashes of the server's certificate public key
 * against a configured pin set per domain.
 *
 * Pin format: "sha256/<base64-encoded-hash>"
 *
 * Request options and responses are JSON-serialized strings for TurboModule
 * compatibility (TurboModules only support primitive types).
 *
 * Pin configuration JSON format:
 * {
 *   "pins": {
 *     "api.example.com": ["sha256/AAAA...", "sha256/BBBB..."],
 *     "cdn.example.com": ["sha256/CCCC..."]
 *   }
 * }
 *
 * Fetch options JSON format:
 * {
 *   "method": "GET" | "POST" | ...,
 *   "headers": { "Content-Type": "application/json", ... },
 *   "body": "...",
 *   "timeout": 30
 * }
 *
 * Response JSON format:
 * {
 *   "status": 200,
 *   "headers": { "content-type": "application/json", ... },
 *   "body": "..."
 * }
 */

import Foundation
import CryptoKit
import Security

@objc(NetworkModule)
class NetworkModule: NSObject {

  // MARK: - Pin Storage

  /// Certificate pins per domain: domain -> [sha256/<base64hash>, ...]
  private var domainPins: [String: [String]] = [:]

  /// Shared URLSession with pinning delegate — recreated when pins change
  private var pinnedSession: URLSession?

  /// Serial queue for thread-safe pin access
  private let pinQueue = DispatchQueue(label: "com.enterprise-module-sdk.network-pins")

  // MARK: - Module Registration

  @objc
  static func moduleName() -> String {
    return "NetworkModule"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Configure Pins

  /// Configure certificate pins from a JSON string.
  /// Expected format: { "pins": { "domain": ["sha256/base64hash", ...] } }
  /// - Parameters:
  ///   - pins: JSON string with pin configuration
  ///   - resolve: Promise resolve callback
  ///   - reject: Promise reject callback
  @objc
  func configurePins(
    _ pins: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !pins.isEmpty else {
      reject("PIN_CONFIG_ERROR", "configurePins() requires a non-empty JSON string", nil)
      return
    }

    guard let jsonData = pins.data(using: .utf8) else {
      reject("PIN_CONFIG_ERROR", "Failed to encode pin config as UTF-8", nil)
      return
    }

    do {
      guard let config = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
            let pinMap = config["pins"] as? [String: [String]] else {
        reject("PIN_CONFIG_ERROR", "Invalid pin config format: expected { \"pins\": { \"domain\": [\"sha256/...\"] } }", nil)
        return
      }

      // Validate pin format
      for (domain, pinList) in pinMap {
        guard !domain.isEmpty else {
          reject("PIN_CONFIG_ERROR", "Pin config contains empty domain", nil)
          return
        }
        for pin in pinList {
          guard pin.hasPrefix("sha256/") else {
            reject("PIN_CONFIG_ERROR", "Invalid pin format for domain \(domain): \(pin). Expected 'sha256/<base64hash>'", nil)
            return
          }
          let base64Part = String(pin.dropFirst("sha256/".count))
          guard Data(base64Encoded: base64Part) != nil else {
            reject("PIN_CONFIG_ERROR", "Invalid base64 in pin for domain \(domain): \(pin)", nil)
            return
          }
        }
      }

      pinQueue.sync {
        self.domainPins = pinMap
        // Invalidate the current session so it gets recreated with new pins
        self.pinnedSession?.invalidateAndCancel()
        self.pinnedSession = nil
      }

      resolve(nil)
    } catch {
      reject("PIN_CONFIG_ERROR", "Failed to parse pin config JSON: \(error.localizedDescription)", error)
    }
  }

  // MARK: - Fetch

  /// Execute an HTTPS request with certificate pinning enforcement.
  /// - Parameters:
  ///   - url: The URL to fetch
  ///   - options: JSON string with request options (method, headers, body, timeout)
  ///   - resolve: Promise resolve callback with JSON response string
  ///   - reject: Promise reject callback
  @objc
  func fetch(
    _ url: String,
    options: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard !url.isEmpty else {
      reject("FETCH_ERROR", "fetch() requires a non-empty URL", nil)
      return
    }

    guard let requestUrl = URL(string: url) else {
      reject("FETCH_ERROR", "Invalid URL: \(url)", nil)
      return
    }

    // Parse options
    var method = "GET"
    var headers: [String: String] = [:]
    var body: String?
    var timeout: TimeInterval = 30

    if !options.isEmpty, let optData = options.data(using: .utf8) {
      do {
        if let opts = try JSONSerialization.jsonObject(with: optData) as? [String: Any] {
          if let m = opts["method"] as? String {
            method = m.uppercased()
          }
          if let h = opts["headers"] as? [String: String] {
            headers = h
          }
          if let b = opts["body"] as? String {
            body = b
          }
          if let t = opts["timeout"] as? Double {
            timeout = t
          }
        }
      } catch {
        reject("FETCH_ERROR", "Failed to parse request options JSON: \(error.localizedDescription)", error)
        return
      }
    }

    // Build URLRequest
    var request = URLRequest(url: requestUrl, timeoutInterval: timeout)
    request.httpMethod = method

    for (key, value) in headers {
      request.setValue(value, forHTTPHeaderField: key)
    }

    if let body = body {
      request.httpBody = body.data(using: .utf8)
    }

    // Get or create pinned session
    let session = getOrCreateSession()

    let task = session.dataTask(with: request) { data, response, error in
      if let error = error {
        let nsError = error as NSError

        // Check for certificate pinning failure
        if nsError.domain == NSURLErrorDomain &&
           (nsError.code == NSURLErrorServerCertificateUntrusted ||
            nsError.code == NSURLErrorSecureConnectionFailed ||
            nsError.code == NSURLErrorCancelled) {
          reject("PIN_VALIDATION_FAILED", "Certificate pinning validation failed for \(url): \(error.localizedDescription)", error)
          return
        }

        reject("FETCH_ERROR", "Network request failed: \(error.localizedDescription)", error)
        return
      }

      guard let httpResponse = response as? HTTPURLResponse else {
        reject("FETCH_ERROR", "Response is not an HTTP response", nil)
        return
      }

      // Build response headers dictionary
      var responseHeaders: [String: String] = [:]
      for (key, value) in httpResponse.allHeaderFields {
        if let keyStr = key as? String, let valStr = value as? String {
          responseHeaders[keyStr.lowercased()] = valStr
        }
      }

      // Build response body
      let responseBody: String
      if let data = data {
        responseBody = String(data: data, encoding: .utf8) ?? ""
      } else {
        responseBody = ""
      }

      // Serialize response to JSON
      let responseDict: [String: Any] = [
        "status": httpResponse.statusCode,
        "headers": responseHeaders,
        "body": responseBody,
      ]

      do {
        let jsonData = try JSONSerialization.data(withJSONObject: responseDict)
        let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
        resolve(jsonString)
      } catch {
        reject("FETCH_ERROR", "Failed to serialize response to JSON: \(error.localizedDescription)", error)
      }
    }

    task.resume()
  }

  // MARK: - Session Management

  private func getOrCreateSession() -> URLSession {
    return pinQueue.sync {
      if let existing = self.pinnedSession {
        return existing
      }

      let config = URLSessionConfiguration.default
      config.tlsMinimumSupportedProtocolVersion = .TLSv12
      config.requestCachePolicy = .reloadIgnoringLocalCacheData

      let delegate = CertificatePinningDelegate(domainPins: self.domainPins)
      let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
      self.pinnedSession = session
      return session
    }
  }
}

// MARK: - Certificate Pinning Delegate

/// URLSession delegate that performs certificate pinning by comparing the SHA-256
/// hash of the server's public key against configured pins for the domain.
private class CertificatePinningDelegate: NSObject, URLSessionDelegate {

  private let domainPins: [String: [String]]

  init(domainPins: [String: [String]]) {
    self.domainPins = domainPins
    super.init()
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let serverTrust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    let host = challenge.protectionSpace.host

    // If no pins configured for this domain, allow default TLS validation
    guard let pins = domainPins[host], !pins.isEmpty else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    // Evaluate the server trust (standard TLS validation first)
    var error: CFError?
    let isTrusted = SecTrustEvaluateWithError(serverTrust, &error)

    guard isTrusted else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }

    // Check the certificate chain for matching pins
    let certificateCount = SecTrustGetCertificateCount(serverTrust)

    for i in 0..<certificateCount {
      guard let certificate = SecTrustCopyCertificateChain(serverTrust)?[i] as? SecCertificate else {
        continue
      }

      // Extract public key from certificate
      guard let publicKey = SecCertificateCopyKey(certificate) else {
        continue
      }

      // Export public key as data
      guard let publicKeyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else {
        continue
      }

      // Compute SHA-256 hash of the public key
      let hash = SHA256.hash(data: publicKeyData)
      let hashBase64 = Data(hash).base64EncodedString()
      let pinString = "sha256/\(hashBase64)"

      // Check if this pin matches any configured pin
      if pins.contains(pinString) {
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
        return
      }
    }

    // No pin matched — reject the connection
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}
