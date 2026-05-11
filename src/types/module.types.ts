/**
 * Module Types - Manifest, permissions, runtime state
 * @module types/module
 */

import type { ScreenSchema } from './schema.types';

/** Module manifest - the identity card of a module */
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  category: string;
  entryScreen: string;
  screens: string[];
  permissions: ModulePermissions;
  minSDKVersion: string;
  signature: string;
  author?: string;
  signedAt?: number;
  tags?: string[];
  requiredTiers?: string[];
  /** Encrypted factory URL — SDK sends host authToken + moduleId here to acquire a module-scoped API token (AES-256-GCM encrypted, decrypted by SDK at runtime) */
  externalTokenFactoryURL?: string;
  /** External API domains this module is allowed to call — token from factory is injected for matching requests */
  apiDomains?: string[];
  /** Color schema ID (resolved to designTokens at publish time) */
  colorSchemaId?: string;
  /** Embedded design tokens (resolved from colorSchemaId at publish time) */
  designTokens?: {
    colors?: Record<string, string>;
  };
  /** Internationalization string tables per locale */
  i18n?: Record<string, Record<string, string>>;
  /** SHA-256 fingerprint of the certificate used to sign this module (stapled by server) */
  signingCertFingerprint?: string;
  /** PEM-encoded public key of the signer (stapled by server from Certificate table) */
  signingPublicKey?: string;
  /** Certificate status stapled by server: 'valid' | 'expired' | 'superseded' | 'revoked' */
  certStatus?: string;
  /** Asset map: logicalName → relative URL (populated at publish time) */
  assets?: Record<string, string>;
  /** Declarative navigation configuration for all screens in this module */
  navigation?: ModuleNavigationConfig;
  /** Offline sync configuration for this module's data collections */
  sync?: ModuleSyncConfig;
}

/** Module-level sync configuration (defined in manifest) */
export interface ModuleSyncConfig {
  enabled: boolean;
  collections: Record<string, ModuleSyncCollectionConfig>;
}

/** Per-collection sync configuration */
export interface ModuleSyncCollectionConfig {
  conflictStrategy: 'server-wins' | 'client-wins' | 'latest-timestamp' | 'manual-resolution';
  syncIntervalMs?: number;
  fieldOverrides?: Record<string, 'server-wins' | 'client-wins' | 'latest-timestamp' | 'manual-resolution'>;
}

/** Module-level navigation configuration (declared in manifest, editable in Developer Portal) */
export interface ModuleNavigationConfig {
  /** Who renders the navigation header.
   * 'sdk' (default) — SDK renders its own header bar with screen title + back button
   * 'host' — SDK hides its header; host app provides one (receives onScreenChange callbacks)
   * 'none' — No header rendered (fullscreen/immersive modules)
   */
  headerMode?: 'sdk' | 'host' | 'none';
  /** Default screen presentation style: 'card' (default push), 'modal' (slide up) */
  presentation?: 'card' | 'modal';
}

/** Module permission declarations */
export interface ModulePermissions {
  apis: string[];
  storage: boolean;
  dataBus?: string[];
  /** Device capabilities required by this module */
  deviceCapabilities?: ('camera' | 'photo_library')[];
}

/** Runtime module instance */
export interface ModuleInstance {
  manifest: ModuleManifest;
  state: ModuleRuntimeState;
  loadedAt: number;
  lastActiveAt: number;
  screens: Map<string, ScreenSchema>;
}

/** Module runtime state */
export type ModuleRuntimeState =
  | 'loading'
  | 'ready'
  | 'active'
  | 'suspended'
  | 'error'
  | 'unloaded';

/** Module summary for listing (Action Zone tiles) */
export interface ModuleSummary {
  id: string;
  name: string;
  icon: string;
  category: string;
  version: string;
  description: string;
  requiredTiers?: string[];
}

/** Module publish bundle (sent to dev server) */
export interface ModuleBundle {
  manifest: ModuleManifest;
  screens: Record<string, ScreenSchema>;
  assets?: Record<string, string>;
}

/** Result of module token acquisition */
export interface ModuleTokenResult {
  acquired: boolean;
  token?: string;
  expiresAt?: number;
  error?: string;
}
