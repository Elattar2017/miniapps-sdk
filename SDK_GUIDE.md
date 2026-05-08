# Miniapps SDK — Architecture & Integration Guide

## Overview

The `@miniapps/sdk` is an enterprise-grade, schema-driven runtime for embedding dynamic UI modules inside React Native host applications. Modules are defined as JSON schemas (not native code), interpreted and rendered by the SDK at runtime. This guarantees security, version independence, and platform consistency.

**Key facts:**
- **Package:** `@miniapps/sdk` v0.1.0
- **Language:** TypeScript 5.4+
- **Platform:** React Native 0.76+, React 18+
- **Rendering:** 32 built-in components rendered from JSON schemas
- **Security:** JWT auth, PKI signature verification, ABAC policy engine, module isolation
- **Offline:** Sync engine with vector clocks and conflict resolution

---

## Table of Contents

1. [Architecture](#architecture)
2. [Project Structure](#project-structure)
3. [Kernel & Lifecycle](#kernel--lifecycle)
4. [Schema System](#schema-system)
5. [Component Registry (32 Components)](#component-registry-32-components)
6. [Expression Engine](#expression-engine)
7. [Action System](#action-system)
8. [State Management](#state-management)
9. [Networking & API Proxy](#networking--api-proxy)
10. [Navigation](#navigation)
11. [Security](#security)
12. [Policy Engine (ABAC)](#policy-engine-abac)
13. [Storage](#storage)
14. [Theming & Design Tokens](#theming--design-tokens)
15. [Internationalization (i18n)](#internationalization-i18n)
16. [Telemetry & Analytics](#telemetry--analytics)
17. [Module System](#module-system)
18. [DataBus (Inter-Module Communication)](#databus-inter-module-communication)
19. [Sync Engine](#sync-engine)
20. [Public API (Exports)](#public-api-exports)
21. [Integrating the SDK into a Host App](#integrating-the-sdk-into-a-host-app)
22. [Running the Reference Host App (WeConnect)](#running-the-reference-host-app-weconnect)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Host App (React Native)                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      SDKProvider                          │   │
│  │  authToken, tenantId, userId, apiBaseUrl, designTokens,  │   │
│  │  zones, subscription, locale, onModuleOpen/Close          │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │                 RuntimeKernel (FSM)                  │ │   │
│  │  │  IDLE → BOOT → AUTH → POLICY → MODULE → ACTIVE     │ │   │
│  │  │                                                     │ │   │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │ │   │
│  │  │  │ Identity │ │  Policy   │ │   Module System  │  │ │   │
│  │  │  │ JWT/PKI  │ │  Engine   │ │ Loader/Registry  │  │ │   │
│  │  │  └──────────┘ └───────────┘ └──────────────────┘  │ │   │
│  │  │  ┌──────────┐ ┌───────────┐ ┌──────────────────┐  │ │   │
│  │  │  │ APIProxy │ │ DataBus   │ │   Telemetry      │  │ │   │
│  │  │  │ Network  │ │ Pub/Sub   │ │   Analytics      │  │ │   │
│  │  │  └──────────┘ └───────────┘ └──────────────────┘  │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │              Schema Rendering Pipeline               │ │   │
│  │  │                                                     │ │   │
│  │  │  SchemaNode (JSON)                                  │ │   │
│  │  │       │                                             │ │   │
│  │  │       ▼                                             │ │   │
│  │  │  SchemaInterpreter                                  │ │   │
│  │  │       │  evaluate visible expression                │ │   │
│  │  │       │  resolve props ($data, $state, $t)          │ │   │
│  │  │       │  look up ComponentRegistry                  │ │   │
│  │  │       │  resolve styles (StyleResolver)             │ │   │
│  │  │       │  recurse children                           │ │   │
│  │  │       ▼                                             │ │   │
│  │  │  React Native Component Tree                        │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐                     │   │
│  │  │ ZoneRenderer │  │ ZoneRenderer │   (multiple zones)  │   │
│  │  │ zoneId=      │  │ zoneId=      │                     │   │
│  │  │ "actions"    │  │ "content"    │                     │   │
│  │  └──────────────┘  └──────────────┘                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│              API calls via APIProxy                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │  Backend API      │
                 │  (Port 3001)      │
                 └───────────────────┘
```

---

## Project Structure

```
sdk/
├── index.ts                   # Public API — all host-facing exports
├── package.json               # @miniapps/sdk metadata & peer deps
├── tsconfig.json
├── jest.config.ts
├── src/
│   ├── adapters/              # Native bridge adapters
│   │   ├── StorageAdapter.ts          # Key-value storage (MMKV/InMemory)
│   │   ├── NavigationAdapter.ts       # React Navigation wrapper
│   │   ├── PlatformAdapter.ts         # Device info, permissions
│   │   └── AnimationAdapter.ts        # Animations
│   │
│   ├── components/            # Host-facing React components
│   │   ├── SDKProvider.tsx            # Root provider (kernel + context)
│   │   ├── ZoneRenderer.tsx           # Zone-based module rendering
│   │   ├── ActionZone.tsx             # Module grid/tile zone
│   │   └── ScreenRenderer.tsx         # Single screen renderer
│   │
│   ├── constants/             # Configuration constants
│   │   ├── defaults.ts                # Default config values
│   │   ├── error-codes.ts            # SDK error codes
│   │   ├── kernel-states.ts          # FSM state definitions
│   │   └── performance-budgets.ts    # Timing budgets (boot: 500ms, etc.)
│   │
│   ├── i18n/                  # Internationalization
│   │   ├── I18nProvider.tsx           # Locale context
│   │   ├── useTranslation.ts          # i18n React hook
│   │   ├── strings.en.ts             # English strings
│   │   └── strings.ar.ts             # Arabic strings
│   │
│   ├── kernel/                # Core runtime engine
│   │   ├── Kernel.ts                  # FSM lifecycle (500+ lines)
│   │   ├── KernelConfig.ts           # Config validation & normalization
│   │   ├── KernelContext.ts           # React Context for kernel
│   │   ├── communication/
│   │   │   ├── DataBus.ts            # Pub/sub message bus
│   │   │   └── IntentBridge.ts       # Host ↔ module intent messaging
│   │   ├── errors/
│   │   │   ├── SDKError.ts           # Typed error class
│   │   │   ├── ErrorBoundary.tsx      # React error boundary
│   │   │   ├── ErrorRecovery.ts      # Auto-retry with backoff
│   │   │   └── CircuitBreaker.ts     # Cascading failure prevention
│   │   ├── identity/
│   │   │   ├── JWTValidator.ts       # JWT structural + crypto validation
│   │   │   ├── PKIVerifier.ts        # Module signature verification
│   │   │   ├── TokenRefreshManager.ts # Auto token refresh
│   │   │   ├── ModuleTokenManager.ts  # Per-module API tokens
│   │   │   └── CryptoAdapter.ts      # Hash, encrypt, sign, secure store
│   │   ├── network/
│   │   │   └── APIProxy.ts           # HTTP client (auth, retry, timeout)
│   │   ├── policy/
│   │   │   ├── PolicyEngine.ts       # ABAC rule evaluation
│   │   │   └── PolicyCache.ts        # LRU policy cache
│   │   ├── sync/
│   │   │   ├── SyncEngine.ts         # Offline-first data sync
│   │   │   ├── ConflictResolver.ts   # Vector clock conflict resolution
│   │   │   └── VectorClock.ts        # Causality tracking
│   │   └── telemetry/
│   │       ├── TelemetryCollector.ts  # Event buffering & flush
│   │       ├── AnalyticsCollector.ts  # User interaction tracking
│   │       ├── AuditLogger.ts        # Security audit events
│   │       └── PerformanceBudget.ts   # Timing budget enforcement
│   │
│   ├── modules/               # Module management
│   │   ├── ModuleLoader.ts           # Fetch manifests, verify signatures
│   │   ├── ModuleRegistry.ts         # Track active module instances
│   │   ├── ModuleContext.ts          # Per-module isolated state
│   │   ├── ModuleCache.ts           # Multi-tier caching
│   │   └── AssetResolver.ts         # Module asset URL resolution
│   │
│   ├── schema/                # Schema interpretation & rendering
│   │   ├── SchemaInterpreter.ts      # JSON → React tree (500+ lines)
│   │   ├── ComponentRegistry.ts      # Component type → React mapping
│   │   ├── ComponentSpecs.ts         # 32 component specifications
│   │   ├── ExpressionEngine.ts       # Safe expression parser (500+ lines)
│   │   ├── ValidationEngine.ts       # Form validation rules
│   │   ├── StyleResolver.ts          # Design token + security filtering
│   │   ├── components/              # 32 React Native component implementations
│   │   └── icons/
│   │       ├── IconRegistry.ts       # Icon provider registry
│   │       └── SVGIconProvider.ts    # Material Design SVG icons
│   │
│   ├── types/                 # TypeScript interfaces
│   │   ├── kernel.types.ts
│   │   ├── module.types.ts
│   │   ├── schema.types.ts
│   │   ├── security.types.ts
│   │   ├── policy.types.ts
│   │   ├── navigation.types.ts
│   │   ├── storage.types.ts
│   │   ├── events.types.ts
│   │   ├── network.types.ts
│   │   └── index.ts                  # Re-exports all types
│   │
│   └── utils/                 # Shared utilities
│       ├── logger.ts                 # Structured JSON logger
│       ├── crypto.ts                 # Hashing, encryption helpers
│       ├── validation.ts             # Input validation
│       └── event-emitter.ts          # Typed event emitter
│
├── __tests__/                 # Comprehensive test suite (100+ files)
└── cli/                       # Developer CLI (init, preview, sign, validate)
```

---

## Kernel & Lifecycle

The RuntimeKernel is a finite state machine (FSM) that manages the SDK's lifecycle:

```
IDLE → BOOT → AUTH → POLICY_SYNC → MODULE_SYNC → ZONE_RENDER → ACTIVE
                                                                  ↕
                                    SUSPEND ↔ RESUME    ERROR ↔ SHUTDOWN
```

| State | What Happens |
|-------|-------------|
| `IDLE` | SDK created, not started |
| `BOOT` | Config validation, adapter initialization |
| `AUTH` | JWT validation, token refresh setup |
| `POLICY_SYNC` | Fetch ABAC policies from backend |
| `MODULE_SYNC` | Load module manifests, verify PKI signatures |
| `ZONE_RENDER` | Prepare zone configurations for rendering |
| `ACTIVE` | SDK fully operational, modules rendered |
| `SUSPEND` | App backgrounded, resources paused |
| `RESUME` | App foregrounded, resources restored |
| `ERROR` | Unrecoverable error, fallback UI |
| `SHUTDOWN` | Cleanup and teardown |

**Performance budget:** Full boot cycle must complete within **500ms**.

---

## Schema System

The schema system is the core of the SDK. It converts JSON screen definitions into native React Native component trees.

### Pipeline

```
ScreenSchema (JSON from backend)
       │
       ▼
SchemaInterpreter.interpretScreen()
       │
       ├─ 1. Evaluate `visible` expression → conditionally render
       ├─ 2. Resolve expression-bearing props ($data, $state, $t())
       ├─ 3. Look up component in ComponentRegistry
       ├─ 4. Resolve styles via StyleResolver (with security whitelist)
       ├─ 5. Handle repeater cloning ($item, $index injection)
       ├─ 6. Recursively interpret children
       │
       ▼
React Native Component Tree (rendered on device)
```

### SchemaNode

Every UI element is a SchemaNode:

```typescript
interface SchemaNode {
  type: string;              // "text", "button", "row", etc.
  id?: string;               // Unique identifier for state binding
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  children?: SchemaNode[];
  visible?: string;          // Expression for conditional rendering
  onPress?: ActionConfig;    // Event handlers
  onChange?: ActionConfig;
  dataSource?: string;       // For repeater
  template?: SchemaNode;     // For repeater
}
```

---

## Component Registry (32 Components)

All components are registered in the ComponentRegistry with full prop/event/style specifications.

### Display (8)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `text` | Labels, headings, paragraphs | `value`, `numberOfLines` |
| `image` | Images from URLs or assets | `source`, `resizeMode`, `alt` |
| `icon` | Material/system icons | `name`, `size`, `color` |
| `badge` | Status tags, selectable chips | `value`, `color`, `variant`, `selectable` |
| `divider` | Horizontal separator | `color`, `thickness` |
| `loading` | Spinner, progress, skeleton | `loadingVariant`, `progress`, `skeletonPreset` |
| `spacer` | Empty vertical space | `size` |
| `chart` | Bar, line, pie, donut, gauge | `chartType`, `chartData`, `chartLabel`, `chartValue` |

### Input (5)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `input` | Text field with keyboard types | `id`, `label`, `placeholder`, `keyboardType`, `secureEntry`, `bind` |
| `select` | Dropdown picker | `id`, `options`, `placeholder`, `bind` |
| `checkbox` | Toggle boolean | `id`, `label`, `bind` |
| `camera_view` | Live camera viewfinder | `id`, `cameraFacing`, `shape` |
| `calendar` | Date picker with availability | `id`, `selectionMode`, `showAvailability`, `showTimeSlots` |

### Action (1)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `button` | Primary action trigger | `label`, `variant`, `disabled`, `loading`, `fullWidth` |

### Layout (14)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `row` | Horizontal flex layout | `gap`, `alignItems`, `justifyContent`, `wrap` |
| `column` | Vertical flex layout | `gap`, `alignItems`, `justifyContent` |
| `card` | Elevated container | `elevation`, `borderRadius` |
| `scroll` | Scrollable container | `direction`, `maxHeight`, `showIndicator` |
| `safe_area_view` | Device safe area padding | `edges` |
| `spacer` | Vertical space | `size` |
| `accordion` | Collapsible sections | `allowMultiple`, `variant` |
| `accordion_item` | Individual section | `title`, `subtitle`, `defaultExpanded` |
| `bottom_sheet` | Slide-up panel | `isOpen`, `sheetHeight`, `dismissable` |
| `bottom_tab_navigator` | Bottom tab bar | `activeTab`, `variant` |
| `top_tab_navigator` | Top tab bar | `activeTab`, `variant` |
| `tab_pane` | Tab content | `label`, `icon`, `badge` |
| `stepper` | Multi-step wizard | `activeStep`, `variant`, `showNavButtons` |
| `step` | Individual step | `title`, `optional`, `validateFields` |

### Data (3)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `repeater` | Renders template per data item | `dataSource`, `emptyMessage`, `itemVariable` |
| `conditional` | Show/hide based on expression | `visible` |
| `table` | Sortable data table | `columns`, `data`, `striped`, `sortable` |

### Overlay (6)

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `scan_frame` | Document scanning frame | `borderStyle`, `aspectRatio`, `label` |
| `corner_brackets` | L-shaped scanning brackets | `bracketSize`, `bracketColor`, `animated` |
| `face_guide` | Selfie capture guide | `shape`, `size`, `label` |
| `grid_overlay` | Rule-of-thirds grid | `rows`, `columns` |
| `crosshair` | Center-point alignment | `size`, `showCircle`, `animated` |
| `scan_line` | Animated scan sweep | `lineColor`, `speed`, `direction` |

---

## Expression Engine

The SDK includes a safe expression evaluator — a recursive descent parser with formal EBNF grammar. **No `eval()` is ever used.**

### Supported Syntax

```
$data.fieldName                    // Data source value
$state.varName                     // Screen state
$item.prop                         // Repeater current item
$index                             // Repeater current index
$t('key')                          // i18n translation
$theme.colors.primary              // Design token
${$data.count} items found         // Template interpolation
$state.age > 18 ? 'Adult' : 'Minor'   // Ternary
$data.items.length > 0             // Comparison
$data.name.toUpperCase()           // Safe method call
```

### Operators

Ternary (`?:`), logical (`&&`, `||`, `!`), comparison (`==`, `!=`, `===`, `!==`, `<`, `>`, `<=`, `>=`), arithmetic (`+`, `-`, `*`, `/`, `%`), member access (`.`, `[]`), function call (`()`)

### Whitelisted Methods

`includes`, `indexOf`, `slice`, `trim`, `toUpperCase`, `toLowerCase`, `startsWith`, `endsWith`, `join`, `map`, `filter`, `find`, `some`, `every`, `concat`, `flat`, `reverse`, `sort`, `toString`, `length`

### Safety Limits

| Limit | Value |
|-------|-------|
| Max expression length | 500 chars |
| Max AST depth | 10 levels |
| Max eval time | 5ms |
| Blocked patterns | `eval`, `Function`, `__proto__`, `constructor` |

---

## Action System

Actions are dispatched from component events (onPress, onChange, etc.):

| Action | Description |
|--------|-------------|
| `navigate` | Go to another screen in the module |
| `go_back` | Return to previous screen |
| `update_state` | Set a value in `$state` |
| `api_call` | Re-fetch a data source |
| `api_submit` | Submit data to an API endpoint (with onSuccess/onError callbacks) |
| `validate` | Run validation rules on form fields (with onValid/onInvalid callbacks) |
| `show_toast` | Display a notification (success/error/warning/info) |
| `show_loading` | Show full-screen loading overlay |
| `hide_loading` | Remove loading overlay |
| `emit_intent` | Send a message to the host app via IntentBridge |
| `capture_camera` | Capture photo from camera_view |
| `open_url` | Open external URL |

Actions can be **chained** — the result of one action triggers subsequent actions (up to 3 levels deep).

---

## State Management

### Module-Scoped State (ModuleContext)

Each module has isolated state. Cross-module state access is blocked and logged as a security event.

- Key scoping: `{tenantId}:{moduleId}:{key}`
- Proxy-based isolation prevents cross-module access
- Prototype pollution protection (`__proto__`, `constructor` blocked)

### Screen-Level State

- Passed through `RenderContext` as `state: Record<string, unknown>`
- Updated via `onStateChange(key, value)` callbacks
- Input components with `bind: "$state.fieldName"` create two-way bindings

### Data Sources

Each screen can define data sources that fetch from APIs:

```typescript
interface DataSourceConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  cache?: 'cache-first' | 'network-first' | 'no-cache';
  poll?: { interval: number; maxRetries?: number };
  timeout?: number;
}
```

Data sources are available in expressions as `$data.<name>`.

---

## Networking & API Proxy

The APIProxy handles all HTTP communication:

- **Authorization:** Auto-injects `Bearer {token}` header
- **Retry:** Exponential backoff on 5xx / network errors
- **Timeout:** AbortController with configurable timeouts (default 10s)
- **Certificate pinning:** Via native modules (TrustKit on iOS, OkHttp on Android)
- **Module tokens:** Per-module API tokens acquired via encrypted token factory URLs (AES-256-GCM)
- **Latency tracking:** Every request measured against performance budgets
- **DataBus events:** Request/response lifecycle published for monitoring

---

## Navigation

The NavigationAdapter wraps React Navigation v7+ behind a stable interface:

- Uses `NavigationIndependentTree` to prevent conflicts with host app navigation
- Supports screen transitions: `slide`, `fade`, `modal`, `none`
- Falls back to `StubNavigationManager` when React Navigation is unavailable

**Methods:** `navigate({ moduleId, screenId })`, `goBack()`, `reset()`, `getCurrentRoute()`

---

## Security

### JWT Validation

- Structural validation: format, expiry, required claims (`sub`, `iss`, `aud`, `exp`, `tenantId`)
- Optional cryptographic verification (RSA-4096, Ed25519)
- Token refresh via `onTokenRefresh` callback

### PKI Signature Verification

- Module manifests signed by developer certificates (RSA-SHA256)
- Signature verified against server-stapled or global operator public key
- Certificate revocation checking (OCSP)
- Minimum decoded signature length: 32 bytes

### Module Isolation

- Per-module state scoping (Proxy-based)
- API domain whitelisting per module
- Encrypted token factory URLs (AES-256-GCM)

---

## Policy Engine (ABAC)

Attribute-Based Access Control for fine-grained permissions:

- **Evaluation order:** Deny first → Allow → Default deny
- **Rule priority:** Higher priority evaluated first
- **Caching:** LRU policy cache for performance

```typescript
interface PolicyRule {
  id: string;
  resource: string;       // "module:budget", "screen:*"
  action: string;         // "view", "edit", "*"
  effect: 'allow' | 'deny';
  conditions?: PolicyCondition[];   // AND logic
  priority?: number;
}
```

**Condition operators:** `eq`, `neq`, `in`, `not_in`, `gt`, `lt`, `gte`, `lte`, `contains`, `startsWith`, `endsWith`, `regex`, `exists`, `not_exists`

---

## Storage

### IStorageAdapter Interface

Key-value API: `getString`, `setString`, `getNumber`, `setNumber`, `getBoolean`, `setBoolean`, `getAllKeys`, `clearAll`, `delete`, `contains`

### Backends

| Backend | Use Case | Persistence |
|---------|----------|-------------|
| **MMKVStorageBackend** | Production (iOS & Android) | File-backed, encrypted, synchronous |
| **InMemoryStorage** | Testing / fallback | Not persistent |

All keys auto-prefixed: `{tenantId}:{moduleId}:{key}`

---

## Theming & Design Tokens

The host app passes design tokens to customize the SDK's visual appearance:

```typescript
interface DesignTokens {
  colors: {
    primary, secondary, background, surface, text, textSecondary,
    error, success, warning, border, spinner, spinnerTrack
  };
  typography: {
    fontFamily, baseFontSize,
    scale?: { h1, h2, h3, h4, body, caption }
  };
  spacing: { unit, xs?, sm?, md?, lg?, xl? };
  borderRadius: { default, sm?, lg?, full? };
  shadows?: { sm?, md?, lg? };
}
```

Module manifests can override colors via `designTokens.colors` for per-module theming. Module colors merge over host tokens.

---

## Internationalization (i18n)

- **Locale switching:** `setLocale('ar')` updates RTL and string lookups
- **RTL locales:** ar, he, fa, ur (auto-detected)
- **Fallback chain:** current locale → `en` → key itself
- **Parameter interpolation:** `{{paramName}}` syntax
- **Pluralization:** `.zero`, `.one`, `.other` forms
- **Module strings:** Provided in manifest `i18n` field
- **Schema usage:** `$t('key')` in expressions

---

## Telemetry & Analytics

- **TelemetryCollector:** Circular buffer (1000 events), offline persistence (5000 events), batch flush to backend
- **AnalyticsCollector:** User interaction tracking, custom events
- **AuditLogger:** Security events (auth, policy denials, module loads)
- **PerformanceBudget:** Tracks metrics against budgets, warns on threshold breach

**Event types:** `kernel_state_change`, `module_loaded`, `module_opened`, `module_closed`, `screen_viewed`, `api_request`, `api_response`, `policy_denied`, `security_event`, `performance_metric`, `error`

---

## Module System

### ModuleManifest

Every module is identified by its manifest:

```typescript
interface ModuleManifest {
  id: string;                    // Reverse-domain: com.vendor.moduleName
  name: string;
  version: string;               // Semver
  entryScreen: string;           // First screen to render
  screens: string[];             // All screen IDs
  permissions: ModulePermissions;
  signature: string;             // Base64 PKI signature
  apiDomains?: string[];         // Allowed external API domains
  designTokens?: { colors?: Record<string, string> };
  i18n?: Record<string, Record<string, string>>;
  externalTokenFactoryURL?: string;   // AES-256-GCM encrypted
  navigation?: { headerMode?, presentation? };
}
```

### Module Lifecycle

```
loading → ready → active → suspended / error / unloaded
```

### ModuleLoader

- Fetches manifests from `/api/modules/:id/manifest`
- Cache: 4 hours + jitter (prevents thundering herd)
- PKI signature verification
- Circuit breaker for resilience

---

## DataBus (Inter-Module Communication)

Pub/sub message bus for communication between modules, kernel, and host:

- **Wildcard subscriptions:** `sdk:module:*`
- **Scoped publishing:** Tenant/module isolation
- **Rate limiting:** Per-channel max messages/second
- **Message history:** Enabled per-channel with max entries
- **Policy gating:** Access control on publish/subscribe

**Standard channels:** `sdk:api:request`, `sdk:api:response`, `sdk:module:opened`, `sdk:module:closed`, `sdk:sync:started`, `sdk:sync:completed`, `sdk:screen:loaded`

---

## Sync Engine

Offline-first data synchronization with conflict resolution:

- **Vector clocks** for per-entry causality tracking
- **Conflict resolution:** Pluggable custom resolver (last-write-wins default)
- **Push/pull pattern:** Dirty entries pushed, remote changes pulled
- **Persistence:** Offline queue persisted to storage

---

## Public API (Exports)

### Components

```typescript
import { SDKProvider } from '@miniapps/sdk';     // Root provider
import { ZoneRenderer } from '@miniapps/sdk';     // Zone-based rendering
import { ActionZone } from '@miniapps/sdk';       // Module grid
import { ScreenRenderer } from '@miniapps/sdk';   // Single screen
```

### Hooks

```typescript
import { useKernel } from '@miniapps/sdk';        // Kernel state/methods
import { useSDK } from '@miniapps/sdk';           // Module system access
import { useTranslation } from '@miniapps/sdk';   // i18n hook
```

### Utilities

```typescript
import { setLocale } from '@miniapps/sdk';        // Change locale
import { iconRegistry } from '@miniapps/sdk';     // Icon registration
import { SVGIconProvider } from '@miniapps/sdk';  // SVG icon provider
```

### Key Types

```typescript
import type {
  SDKProviderProps, KernelConfig, KernelState, KernelStatus,
  DesignTokens, ZoneConfig, ModuleFilter,
  ModuleManifest, ModuleSummary, ModulePermissions,
  ScreenSchema, SchemaNode, ActionConfig, DataSourceConfig, ValidationRule,
  IntentType, Intent, IIntentBridge,
} from '@miniapps/sdk';
```

---

## Integrating the SDK into a Host App

### Prerequisites

- **React Native** 0.76+ (New Architecture / Fabric recommended)
- **React** 18+
- **Node.js** 20+

### Step 1: Install Dependencies

Install the SDK and its peer dependencies:

```bash
npm install @miniapps/sdk

# Peer dependencies
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-mmkv
npm install react-native-screens react-native-safe-area-context
npm install react-native-svg     # Required for SVG icon rendering
```

For iOS:
```bash
cd ios && pod install && cd ..
```

### Step 2: Install Crypto (for JWT Signing)

If your host app needs to create JWTs locally (development):

```bash
npm install react-native-quick-crypto
```

In your entry file (`index.js`):
```javascript
import QuickCrypto from 'react-native-quick-crypto';
QuickCrypto.install();
```

### Step 3: Configure Metro Bundler

If using the SDK from a local monorepo path (not npm), configure Metro to resolve it:

```javascript
// metro.config.js
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const sdkRoot = path.resolve(__dirname, '../sdk');   // adjust path

const config = {
  watchFolders: [sdkRoot],
  resolver: {
    // Prevent duplicate React/RN from SDK's node_modules
    blockList: [
      new RegExp(path.resolve(sdkRoot, 'node_modules/react-native/.*').replace(/[/\\]/g, '[/\\\\]')),
      new RegExp(path.resolve(sdkRoot, 'node_modules/react/.*').replace(/[/\\]/g, '[/\\\\]')),
    ],
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
      '@react-navigation/native': path.resolve(__dirname, 'node_modules/@react-navigation/native'),
      '@react-navigation/native-stack': path.resolve(__dirname, 'node_modules/@react-navigation/native-stack'),
      'react-native-mmkv': path.resolve(__dirname, 'node_modules/react-native-mmkv'),
      'react-native-screens': path.resolve(__dirname, 'node_modules/react-native-screens'),
      'react-native-safe-area-context': path.resolve(__dirname, 'node_modules/react-native-safe-area-context'),
      'react-native-svg': path.resolve(__dirname, 'node_modules/react-native-svg'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

### Step 4: Register SVG Icons

In your app entry (before rendering):

```typescript
import { iconRegistry, SVGIconProvider } from '@miniapps/sdk';
iconRegistry.registerProvider(new SVGIconProvider());
```

### Step 5: Create Design Tokens

Define your brand's visual identity:

```typescript
import type { DesignTokens } from '@miniapps/sdk';

const myDesignTokens: DesignTokens = {
  colors: {
    primary: '#6C2BD9',
    secondary: '#14B8A6',
    background: '#F8F7FC',
    surface: '#FFFFFF',
    text: '#1F1235',
    textSecondary: '#6B7280',
    error: '#DC2626',
    success: '#16A34A',
    warning: '#F59E0B',
    border: '#E5E7EB',
    spinner: '#6C2BD9',
    spinnerTrack: '#E5E7EB',
  },
  typography: {
    fontFamily: 'System',
    baseFontSize: 16,
    scale: { h1: 28, h2: 22, h3: 18, h4: 16, body: 16, caption: 12 },
  },
  spacing: { unit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { default: 12, sm: 8, lg: 16, full: 9999 },
};
```

### Step 6: Create a JWT

The SDK requires a JWT for authentication. In production, your backend issues this. For development:

```typescript
function createJwt(msisdn: string, plan: string): string {
  // Use your JWT library (jose, jsonwebtoken, etc.)
  // Required claims:
  return sign({
    sub: `user-${msisdn}`,
    tenantId: 'your-tenant',
    roles: ['subscriber'],
    msisdn: msisdn,
    plan: plan,
    planId: plan,
    serviceNumber: msisdn,
    iss: 'your-app',
    aud: 'enterprise-module-sdk',
    exp: Math.floor(Date.now() / 1000) + 3600,   // 1 hour
  }, YOUR_JWT_SECRET);
}
```

### Step 7: Wrap Your App with SDKProvider

```tsx
import { SDKProvider, ZoneRenderer } from '@miniapps/sdk';

function App() {
  return (
    <NavigationContainer>
      <SDKProvider
        authToken={jwt}
        tenantId="your-tenant"
        userId={`user-${msisdn}`}
        apiBaseUrl="https://api.miniapps.work"
        moduleRegistryUrl="https://api.miniapps.work"
        locale="en"
        encryptionKey="your-encryption-key"
        zones={{
          actions: {
            type: 'actions',
            position: 'top',
            height: 280,
            layout: 'grid',
            columns: 3,
          },
          content: {
            type: 'fill',
            position: 'fill',
            emptyMessage: 'Select a module',
          },
        }}
        designTokens={myDesignTokens}
        subscription={{ tier: 'WeGold1000' }}
        accountIdentifier={{ identifier: msisdn }}
        onModuleOpen={(moduleId) => navigation.navigate('Module', { moduleId })}
        onModuleClose={() => navigation.goBack()}
      >
        {/* Your app screens go here */}
      </SDKProvider>
    </NavigationContainer>
  );
}
```

### Step 8: Render Zones

Use `ZoneRenderer` to display modules:

```tsx
// Home screen — shows module grid
function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <Text>Welcome!</Text>
      <ZoneRenderer zoneId="actions" />
    </View>
  );
}

// Module screen — shows selected module full-screen
function ModuleScreen() {
  return (
    <View style={{ flex: 1 }}>
      <ZoneRenderer zoneId="content" />
    </View>
  );
}
```

### Step 9: Handle Module Navigation

Set up navigation so tapping a module tile opens it full-screen:

```tsx
const Stack = createNativeStackNavigator();

// Inside SDKProvider:
<Stack.Navigator>
  <Stack.Screen name="Tabs" component={TabNavigator} />
  <Stack.Screen
    name="Module"
    component={ModuleScreen}
    options={{ headerShown: false }}
  />
</Stack.Navigator>
```

The `onModuleOpen` callback receives the `moduleId` and navigates to the Module screen. The `onModuleClose` callback navigates back.

### SDKProvider Props Reference

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `authToken` | string | Yes | JWT for API authentication |
| `tenantId` | string | Yes | Tenant identifier |
| `userId` | string | Yes | User identifier |
| `apiBaseUrl` | string | Yes | Backend API URL |
| `moduleRegistryUrl` | string | | Module discovery URL (defaults to apiBaseUrl) |
| `locale` | string | | Locale code (`en`, `ar`, etc.) |
| `encryptionKey` | string | | Data encryption key |
| `zones` | Record<string, ZoneConfig> | Yes | Zone configurations |
| `designTokens` | DesignTokens | | Visual theme tokens |
| `subscription` | { tier: string } | | Subscription tier for module filtering |
| `accountIdentifier` | { identifier: string } | | Account info passed to modules |
| `onModuleOpen` | (moduleId: string) => void | | Called when user opens a module |
| `onModuleClose` | () => void | | Called when module should close |
| `onTokenRefresh` | () => Promise<string> | | Token refresh callback |
| `intentHandlers` | Record<string, IntentHandler> | | Host intent handlers |
| `signingPublicKey` | string | | Operator's signing public key |

---

## Running the Reference Host App (WeConnect)

The `host-app/` directory contains a complete reference implementation showing how to integrate the SDK.

### Prerequisites

- **Node.js** 22+
- **Xcode** 16+ (for iOS)
- **Android Studio** (for Android)
- **CocoaPods** (for iOS: `gem install cocoapods`)
- **Ruby** 3.x (for CocoaPods)

### Step 1: Install Dependencies

```bash
cd host-app
npm install
```

### Step 2: Install iOS Pods

```bash
cd ios
pod install
cd ..
```

### Step 3: Start Metro Bundler

```bash
npm start
```

This starts the Metro bundler which serves the JavaScript bundle. Leave this running.

### Step 4: Run on iOS

In a separate terminal:

```bash
# Simulator
npx react-native run-ios

# Physical device
npx react-native run-ios --device "iPhone (69)" --mode Release
```

### Step 5: Run on Android

```bash
npx react-native run-android
```

### Step 6: Login

The app shows a login screen. Enter any phone number (10+ digits, e.g. `+971501234567`) to log in. A development JWT is generated locally.

### How the Reference App Works

```
LoginScreen
    │
    │  Enter phone number → creates HS256 JWT
    │
    ▼
SDKProvider (wraps entire app)
    │
    ├── TabNavigator
    │   ├── Home tab → ZoneRenderer zoneId="actions" (module grid)
    │   ├── Account tab → user profile, plan info
    │   └── Settings tab → language, plan tier, logout
    │
    └── Module screen → ZoneRenderer zoneId="content" (full-screen module)
```

**Key configuration:**
- Backend: `https://api.miniapps.work`
- Tenant: `weconnect`
- JWT secret: `coolify-jwt-secret-1773535531` (must match backend)
- Encryption key: `sdk-module-key-1773535533`
- Default plan: `WeGold1000`
- Zones: `actions` (3-column grid, 280px) + `content` (full-screen)

### Troubleshooting

**Metro bundler can't find SDK:**
- Verify `metro.config.js` has the correct `sdkRoot` path pointing to `../sdk`
- Run `npm install` in both `host-app/` and `sdk/`

**iOS build fails:**
- Run `cd ios && pod install && cd ..`
- Clean build: `cd ios && xcodebuild clean && cd ..`

**Android build fails:**
- Clean: `cd android && ./gradlew clean && cd ..`
- Ensure Android SDK 36 and NDK 27.1 are installed

**Modules not loading:**
- Check that `https://api.miniapps.work/health` is reachable
- Verify the JWT secret matches the backend
- Check the subscription tier — modules are filtered by plan
