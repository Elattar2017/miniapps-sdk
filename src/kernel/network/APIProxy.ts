/**
 * API Proxy - Kernel-level HTTP proxy for all module API calls
 * @module kernel/network/APIProxy
 *
 * All outbound API requests from modules flow through this proxy.
 * It provides:
 *  - Automatic auth header injection (Bearer token)
 *  - Configurable timeouts (with AbortController)
 *  - Exponential backoff retries on 5xx / network errors
 *  - DataBus event publication for request/response lifecycle
 *  - Latency measurement for every request
 *  - Certificate pinning via NativeNetworkModule (TrustKit/OkHttp)
 *
 * Modules never call fetch() directly — the kernel enforces this
 * via the schema-driven architecture.
 */

import { logger } from '../../utils/logger';
import { DEFAULT_TIMEOUTS } from '../../constants/defaults';
import type { APIRequestOptions, APIResponse, APIProxyConfig, CertificatePinConfig } from '../../types';
import type { DataBus } from '../communication/DataBus';
import type { TelemetryCollector } from '../telemetry/TelemetryCollector';

/** NativeNetworkModule TurboModule interface for cert-pinned requests */
interface NativeNetworkModuleSpec {
  fetch(url: string, options: string): Promise<string>;
  configurePins(pins: string): Promise<void>;
}

/** JSON response format returned by NativeNetworkModule.fetch() */
interface NativeNetworkResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export class APIProxy {
  private readonly log = logger.child({ component: 'APIProxy' });
  private readonly baseUrl: string;
  private authToken: string;
  private readonly dataBus: DataBus | undefined;
  private readonly telemetry: TelemetryCollector | undefined;
  private readonly certificatePins: CertificatePinConfig[];
  private readonly defaultTimeout: number;
  private readonly moduleTokens = new Map<string, { token: string; domains: string[] }>();

  /** Lazy-resolved NativeNetworkModule: undefined = not checked, null = unavailable */
  private nativeNetworkModule: NativeNetworkModuleSpec | null | undefined = undefined;
  private nativePinsConfigured = false;

  constructor(config: APIProxyConfig) {
    this.baseUrl = config.baseUrl;
    this.authToken = config.authToken;
    this.dataBus = config.dataBus;
    this.telemetry = config.telemetry;
    this.certificatePins = config.certificatePins ?? [];
    this.defaultTimeout = config.timeouts?.apiRequest ?? DEFAULT_TIMEOUTS.API_REQUEST;

    if (this.certificatePins.length > 0) {
      const nativeModule = this.resolveNativeNetworkModule();
      if (nativeModule) {
        this.log.info('Certificate pinning enforced via NativeNetworkModule', {
          domains: this.certificatePins.map(p => p.domain),
        });
      } else {
        this.log.warn('Certificate pins configured but NativeNetworkModule unavailable; pinning NOT enforced', {
          domains: this.certificatePins.map(p => p.domain),
        });
      }
    }

    this.log.info('APIProxy initialized', { baseUrl: this.baseUrl });
  }

  /**
   * Update the auth token used for subsequent requests.
   * Called when the token is refreshed by the identity layer.
   */
  updateAuthToken(token: string): void {
    this.authToken = token;
    this.log.debug('Auth token updated');
  }

  /**
   * Execute an API request through the proxy.
   *
   * @param path - The URL path (appended to baseUrl)
   * @param options - Optional request configuration
   * @returns APIResponse with ok, status, data, headers, and latencyMs
   */
  async request(path: string, options: APIRequestOptions = {}): Promise<APIResponse> {
    const url = `${this.baseUrl}${path}`;
    return this._executeRequest(url, options);
  }

  /**
   * Execute an API request to an absolute URL (does NOT prepend baseUrl).
   *
   * @param url - The full URL to send the request to
   * @param options - Optional request configuration
   * @returns APIResponse with ok, status, data, headers, and latencyMs
   */
  async requestAbsolute(url: string, options: APIRequestOptions = {}): Promise<APIResponse> {
    return this._executeRequest(url, options);
  }

  /**
   * Core request execution logic shared by request() and requestAbsolute().
   */
  private async _executeRequest(url: string, options: APIRequestOptions): Promise<APIResponse> {
    const method = options.method ?? 'GET';
    const timeout = options.timeout ?? this.defaultTimeout;
    const maxRetries = options.retries ?? 2;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (!options.skipAuth) {
      const moduleToken = this.findModuleTokenForUrl(url);
      if (moduleToken) {
        headers['Authorization'] = `Bearer ${moduleToken}`;
      } else {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }
    }

    // Publish request event on DataBus
    this.dataBus?.publish('sdk:api:request', { url, method, timestamp: Date.now() });

    const startTime = Date.now();
    let lastError: Error | null = null;

    // Check if this URL targets a pinned domain and we have native enforcement
    const useNativePinning = this.shouldUseNativePinning(url);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let response: Response;

        if (useNativePinning) {
          // Route through NativeNetworkModule for TrustKit/OkHttp cert pinning
          response = await this.fetchViaNativeModule(url, method, headers, options.body, timeout);
        } else {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const fetchOptions: RequestInit = {
            method,
            headers,
            signal: controller.signal,
          };

          if (options.body && method !== 'GET') {
            fetchOptions.body = typeof options.body === 'string'
              ? options.body
              : JSON.stringify(options.body);
          }

          response = await fetch(url, fetchOptions);
          clearTimeout(timeoutId);
        }

        const latencyMs = Date.now() - startTime;

        // Don't retry on 4xx errors — they are client errors
        if (response.status >= 400 && response.status < 500) {
          const data = await this.safeParseJson(response);
          const apiResponse: APIResponse = {
            ok: false,
            status: response.status,
            data,
            headers: this.extractHeaders(response),
            latencyMs,
          };
          this.dataBus?.publish('sdk:api:response', { url, method, status: response.status, latencyMs });
          this.trackTelemetry(url, method, response.status, latencyMs);
          return apiResponse;
        }

        // Retry on 5xx errors (if not last attempt)
        if (response.status >= 500 && attempt < maxRetries) {
          lastError = new Error(`Server error: ${response.status}`);
          await this.backoff(attempt);
          continue;
        }

        const data = await this.safeParseJson(response);
        const apiResponse: APIResponse = {
          ok: response.ok,
          status: response.status,
          data,
          headers: this.extractHeaders(response),
          latencyMs,
        };
        this.dataBus?.publish('sdk:api:response', { url, method, status: response.status, latencyMs });
        this.trackTelemetry(url, method, response.status, latencyMs);
        return apiResponse;

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries && !lastError.message.includes('abort')) {
          await this.backoff(attempt);
          continue;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    this.dataBus?.publish('sdk:api:response', {
      url,
      method,
      status: 0,
      latencyMs,
      error: lastError?.message,
    });
    this.trackTelemetry(url, method, 0, latencyMs);

    return {
      ok: false,
      status: 0,
      data: null,
      headers: {},
      latencyMs,
    };
  }

  // ---------------------------------------------------------------
  // Module token management
  // ---------------------------------------------------------------

  /**
   * Register a module-specific token for domain-matched API requests.
   */
  setModuleToken(moduleId: string, token: string, domains: string[]): void {
    this.moduleTokens.set(moduleId, { token, domains });
    this.log.debug("Module token registered", { moduleId, domains });
  }

  /**
   * Remove a module-specific token.
   */
  removeModuleToken(moduleId: string): void {
    this.moduleTokens.delete(moduleId);
    this.log.debug("Module token removed", { moduleId });
  }

  /**
   * Get the token for a specific module.
   */
  getModuleToken(moduleId: string): string | undefined {
    return this.moduleTokens.get(moduleId)?.token;
  }

  // ---------------------------------------------------------------
  // Certificate pin accessors
  // ---------------------------------------------------------------

  /**
   * Returns a defensive copy of the configured certificate pins.
   */
  getCertificatePins(): CertificatePinConfig[] {
    return [...this.certificatePins];
  }

  /**
   * Checks whether certificate pins are configured for the given domain.
   * Respects the `includeSubdomains` flag on each pin entry.
   */
  hasCertificatePins(domain: string): boolean {
    return this.certificatePins.some(pin => {
      if (pin.domain === domain) return true;
      if (pin.includeSubdomains && domain.endsWith('.' + pin.domain)) return true;
      return false;
    });
  }

  // ---------------------------------------------------------------
  // Certificate pinning — native module integration
  // ---------------------------------------------------------------

  /**
   * Lazy-resolve the NativeNetworkModule TurboModule.
   * Returns null if unavailable (test environment, no native code, etc.).
   */
  private resolveNativeNetworkModule(): NativeNetworkModuleSpec | null {
    if (this.nativeNetworkModule === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('../../native/NativeNetworkModule').default;
        this.nativeNetworkModule = mod ?? null;
      } catch {
        this.nativeNetworkModule = null;
      }
    }
    return this.nativeNetworkModule ?? null;
  }

  /**
   * Configure certificate pins on the native module.
   * Called once lazily before the first pinned request.
   */
  private async configureNativePins(): Promise<void> {
    if (this.nativePinsConfigured) return;

    const nativeModule = this.resolveNativeNetworkModule();
    if (!nativeModule) return;

    const activePins = this.getActivePins();
    if (activePins.length === 0) return;

    try {
      await nativeModule.configurePins(JSON.stringify(activePins));
      this.nativePinsConfigured = true;
      this.log.info('Certificate pins configured on native module', {
        pinCount: activePins.length,
        domains: activePins.map(p => p.domain),
      });
    } catch (err) {
      this.log.error('Failed to configure native certificate pins', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Determine if a URL should be routed through the native module for pinning.
   * Returns true when: pins are configured for the domain, pins haven't expired,
   * and the NativeNetworkModule is available.
   */
  private shouldUseNativePinning(url: string): boolean {
    if (this.certificatePins.length === 0) return false;

    const nativeModule = this.resolveNativeNetworkModule();
    if (!nativeModule) return false;

    try {
      const hostname = new URL(url).hostname;
      return this.getActivePins().some(pin => {
        if (pin.domain === hostname) return true;
        if (pin.includeSubdomains && hostname.endsWith('.' + pin.domain)) return true;
        return false;
      });
    } catch {
      return false;
    }
  }

  /**
   * Filter certificate pins to only those that haven't expired.
   */
  private getActivePins(): CertificatePinConfig[] {
    const now = Date.now();
    return this.certificatePins.filter(pin => {
      if (!pin.expirationDate) return true;
      return new Date(pin.expirationDate).getTime() > now;
    });
  }

  /**
   * Execute a request through NativeNetworkModule with certificate pinning.
   * The native module enforces TrustKit (iOS) / OkHttp CertificatePinner (Android).
   *
   * Returns a synthetic Response object compatible with the standard fetch API
   * so the caller can process it uniformly.
   */
  private async fetchViaNativeModule(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: unknown,
    timeout: number,
  ): Promise<Response> {
    // Ensure pins are configured on the native side
    await this.configureNativePins();

    const nativeModule = this.resolveNativeNetworkModule()!;

    const nativeOptions: Record<string, unknown> = {
      method,
      headers,
      timeout,
    };

    if (body && method !== 'GET') {
      nativeOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    this.log.debug('Routing request through NativeNetworkModule (cert pinning)', {
      url,
      method,
    });

    const responseStr = await nativeModule.fetch(url, JSON.stringify(nativeOptions));
    const nativeResponse: NativeNetworkResponse = JSON.parse(responseStr);

    // Build a synthetic Response object that matches the interface used by _executeRequest
    const status = nativeResponse.status;
    const responseHeaders = new Map(Object.entries(nativeResponse.headers ?? {}));

    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(nativeResponse.data),
      headers: {
        forEach: (cb: (value: string, key: string) => void) => {
          responseHeaders.forEach((value, key) => cb(value, key));
        },
      },
    } as unknown as Response;
  }

  /**
   * Check if native certificate pinning is active (native module resolved and pins configured).
   */
  isNativePinningActive(): boolean {
    return this.resolveNativeNetworkModule() !== null && this.getActivePins().length > 0;
  }

  // ---------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------

  /**
   * Match a request URL against registered module apiDomains.
   * Supports three formats (auto-detected):
   *   - "api.vendor.com"              → hostname match (+ subdomain)
   *   - "127.0.0.1:3003"             → host:port match
   *   - "127.0.0.1:3003/api/module1" → host:port + path prefix match
   */
  private findModuleTokenForUrl(url: string): string | undefined {
    try {
      const urlObj = new URL(url);
      for (const [, entry] of this.moduleTokens) {
        for (const domain of entry.domains) {
          if (domain.includes('/')) {
            // Path prefix match: "host:port/path" or "hostname/path"
            const slashIdx = domain.indexOf('/');
            const hostPart = domain.slice(0, slashIdx);
            const pathPrefix = domain.slice(slashIdx);
            if (urlObj.host === hostPart && urlObj.pathname.startsWith(pathPrefix)) {
              return entry.token;
            }
          } else if (domain.includes(':')) {
            // Host:port match: "hostname:port"
            if (urlObj.host === domain) {
              return entry.token;
            }
          } else {
            // Hostname-only match: exact or subdomain
            if (urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)) {
              return entry.token;
            }
          }
        }
      }
    } catch {
      // Invalid URL, skip module token matching
    }
    return undefined;
  }

  private async safeParseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private extractHeaders(response: Response): Record<string, string> {
    const result: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }

  private backoff(attempt: number): Promise<void> {
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, ...
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private trackTelemetry(url: string, method: string, status: number, latencyMs: number): void {
    this.telemetry?.track({
      type: 'api_request',
      timestamp: Date.now(),
      tenantId: '',
      userId: '',
      data: { url, method, status, latencyMs },
    });
  }
}
