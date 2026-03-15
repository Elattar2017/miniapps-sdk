/**
 * Network Types - API proxy request/response and configuration
 * @module types/network
 */

import type { DataBus } from '../kernel/communication/DataBus';
import type { TelemetryCollector } from '../kernel/telemetry/TelemetryCollector';

/** Options for an individual API request through the proxy */
export interface APIRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  skipAuth?: boolean;
}

/** Normalized API response returned by the proxy */
export interface APIResponse {
  ok: boolean;
  status: number;
  data: unknown;
  headers: Record<string, string>;
  latencyMs: number;
}

/** Configuration for the APIProxy constructor */
export interface APIProxyConfig {
  baseUrl: string;
  authToken: string;
  dataBus?: DataBus;
  telemetry?: TelemetryCollector;
  timeouts?: { apiRequest?: number };
  /** Certificate pinning (Phase 8: native enforcement via TrustKit/OkHttp) */
  certificatePins?: CertificatePinConfig[];
}

/** Certificate pinning configuration (Phase 8 native implementation) */
export interface CertificatePinConfig {
  /** Domain to pin (e.g., 'api.example.com') */
  domain: string;
  /** SHA-256 pin hashes of certificate public keys */
  pins: string[];
  /** Whether to include subdomains (default: false) */
  includeSubdomains?: boolean;
  /** ISO date after which pins are not enforced */
  expirationDate?: string;
  /** URI to report pin violations */
  reportUri?: string;
}
