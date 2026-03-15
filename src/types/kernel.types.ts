/**
 * Kernel Types - Runtime lifecycle, configuration, and state management
 * @module types/kernel
 */

/** Kernel FSM lifecycle states */
export type KernelState =
  | 'IDLE'
  | 'BOOT'
  | 'AUTH'
  | 'POLICY_SYNC'
  | 'MODULE_SYNC'
  | 'ZONE_RENDER'
  | 'ACTIVE'
  | 'SUSPEND'
  | 'RESUME'
  | 'SHUTDOWN'
  | 'ERROR';

/** Kernel configuration provided by host app via SDKProvider */
export interface KernelConfig {
  authToken: string;
  tenantId: string;
  userId: string;
  apiBaseUrl: string;
  /** Module registry/management server URL. Defaults to apiBaseUrl when not set. */
  moduleRegistryUrl?: string;
  zones: Record<string, ZoneConfig>;
  designTokens?: DesignTokens;
  onTokenRefresh?: () => Promise<string>;
  onModuleOpen?: (moduleId: string) => void;
  onModuleClose?: (moduleId: string) => void;
  /** Called when the active screen changes within a module. Host can use to update its own header. */
  onScreenChange?: (info: ScreenChangeInfo) => void;
  intentHandlers?: Record<string, IntentHandler>;
  debug?: boolean;
  /** Organization identifier (e.g., 'etisalat-uae', 'acme-bank') */
  orgId?: string;
  /** Subscription tier configuration for tier-based module filtering */
  subscription?: SubscriptionConfig;
  /** Device attestation configuration for external API token acquisition */
  attestation?: DeviceAttestationConfig;
  /** Account identifier configuration for switchable identifiers */
  accountIdentifier?: AccountIdentifierConfig;
  /** PEM-encoded public key for module signature verification (RSA or Ed25519) */
  signingPublicKey?: string;
  /** Shared encryption key for decrypting sensitive manifest fields (must match backend MODULE_ENCRYPTION_KEY) */
  encryptionKey?: string;
  /** Locale code for i18n (e.g., 'en', 'ar', 'he'). Changes trigger RTL + string updates. */
  locale?: string;
}

/** Zone configuration for SDK rendering areas */
export interface ZoneConfig {
  type: 'actions' | 'dashboard' | 'forms' | 'fill' | 'custom';
  position: 'top' | 'bottom' | 'left' | 'right' | 'fill';
  height?: number;
  width?: number;
  flex?: number;
  layout?: 'horizontal-scroll' | 'grid' | 'list';
  columns?: number;
  moduleFilter?: ModuleFilter;
  showSearch?: boolean;
  emptyMessage?: string;
  backgroundColor?: string;
  padding?: number;
}

/** Module filter for zone-level module visibility */
export interface ModuleFilter {
  categories?: string[];
  moduleIds?: string[];
  maxModules?: number;
  excludeModuleIds?: string[];
}

/** Shadow value for design token shadows */
export interface ShadowValue {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  color: string;
}

/** Design tokens for theming */
export interface DesignTokens {
  colors: {
    primary: string;
    secondary?: string;
    background: string;
    surface?: string;
    text?: string;
    textSecondary?: string;
    error?: string;
    success?: string;
    warning?: string;
    border?: string;
    spinner?: string;
    spinnerTrack?: string;
  };
  typography: {
    fontFamily: string;
    baseFontSize: number;
    headingFontFamily?: string;
    scale?: {
      h1?: number;
      h2?: number;
      h3?: number;
      h4?: number;
      body?: number;
      caption?: number;
    };
  };
  spacing: {
    unit: number;
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  borderRadius: {
    default: number;
    sm?: number;
    lg?: number;
    full?: number;
  };
  shadows?: {
    sm?: ShadowValue;
    md?: ShadowValue;
    lg?: ShadowValue;
  };
}

export type IntentHandler = (params: Record<string, unknown>) => void | Promise<void>;

/** Info emitted when the active screen changes within a module */
export interface ScreenChangeInfo {
  moduleId: string;
  screenId: string;
  title: string;
  canGoBack: boolean;
}

/** Kernel status snapshot */
export interface KernelStatus {
  state: KernelState;
  bootTime?: number;
  moduleCount: number;
  activeModuleId?: string;
  lastError?: string;
}

/** SDKProvider props (KernelConfig + React children) */
export interface SDKProviderProps extends KernelConfig {
  children: React.ReactNode;
}

// ─── Subscription Tier System ───

/** Subscription tier configuration for tier-based module access control */
export interface SubscriptionConfig {
  /** Current tier identifier (e.g., 'gold', 'premium', 'basic') */
  tier: string;
  /** API endpoint path template. Default: '/api/subscription/tiers/{tierId}' */
  tierApiPath?: string;
  /** Callback when tier changes (e.g., upgrade/downgrade) */
  onTierChange?: (newTier: string) => void;
  /** Map backend response field names to SDK field names (e.g., { planId: 'tierId' }) */
  responseMapping?: Record<string, string>;
}

/** Tier configuration returned by the tier API */
export interface TierConfig {
  tierId: string;
  name: string;
  tier: number;
  modules: string[];
  featureFlags: Record<string, boolean>;
  quotas: TierQuotas;
}

/** Tier quota limits */
export interface TierQuotas {
  apiCallsPerHour: number;
  storageBytes: number;
  maxModules: number;
}

// ─── Device Attestation ───

/** Device attestation configuration for external API token acquisition */
export interface DeviceAttestationConfig {
  /** Backend attestation API endpoint URL */
  apiUrl: string;
  /** Token cache TTL in seconds (default: 3600) */
  tokenTTL?: number;
  /** Retry attempts for failed attestation (default: 3) */
  retryAttempts?: number;
  /** Timeout for attestation request in ms (default: 5000) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/** External API token acquisition parameters */
export interface ExternalAPITokenParams {
  /** Token scope (e.g., 'billing-api', 'usage-api') */
  scope: string;
  /** Module requesting the token */
  moduleId?: string;
  /** Force refresh even if cached token is valid */
  forceRefresh?: boolean;
}

/** Cached attestation token result */
export interface AttestationTokenResult {
  token: string;
  expiresAt: number;
  scope: string;
}

// ─── Account Identifier ───

/** Account identifier configuration for switchable identifiers */
export interface AccountIdentifierConfig {
  /** Primary account identifier value (e.g., phone number, account number) */
  identifier: string;
  /** API path for validation. Default: '/api/accounts/validate' */
  validateApiPath?: string;
  /** API path for listing identifiers. Default: '/api/accounts/identifiers' */
  listApiPath?: string;
  /** Callback when identifier changes */
  onIdentifierChange?: (newId: string) => void;
  /** Show multi-account switching UI */
  enableMultiAccountUI?: boolean;
  /** Map backend response field names to SDK field names */
  responseMapping?: Record<string, string>;
  /** Client-side format validation pattern. If omitted, skips format check (backend validates). */
  validationPattern?: RegExp;
}

/** Account identifier information */
export interface AccountIdentifierInfo {
  identifier: string;
  isPrimary: boolean;
  tier?: string;
  label?: string;
  active: boolean;
  metadata?: Record<string, unknown>;
}

/** Account identifier validation result */
export interface AccountIdentifierValidationResult {
  valid: boolean;
  active: boolean;
  tier?: string;
  isPrimary: boolean;
  label?: string;
  error?: { code: string; message: string };
}
