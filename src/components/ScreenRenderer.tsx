/**
 * ScreenRenderer - Renders a single module screen from its schema
 * @module components/ScreenRenderer
 *
 * Fetches the screen schema via ModuleLoader, builds a RenderContext,
 * and passes everything to SchemaInterpreter for rendering.
 *
 * Handles:
 * - Screen loading states
 * - Action dispatch (navigate, go_back, api_call, update_state, emit_intent)
 * - Data source fetching with auth injection
 * - Module-scoped state management via ModuleContext
 * - State persistence via StorageAdapter
 * - DataBus event publication for screen lifecycle and actions
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';
import { useKernel, useSDKServices } from '../kernel/KernelContext';
import { useSDK } from './SDKProvider';
import { DEFAULT_DESIGN_TOKENS } from '../constants/defaults';
import { SDKView, SDKText, SDKScrollView, SDKKeyboardAvoidingView, SDKActivityIndicator, SDKTouchableOpacity, getDefaultSafeAreaInsets } from '../adapters';
import { Platform } from 'react-native';
import { ValidationEngine } from '../schema/ValidationEngine';
import { i18n, useTranslation } from '../i18n';
import { ModuleContext } from '../modules/ModuleContext';
import { createStorageAdapter } from '../adapters/StorageAdapter';
import { getNativeModule } from '../adapters/BridgeAdapter';
import type { ScreenSchema, SchemaNode, ActionConfig, RenderContext, DataSourceConfig, DataSourceCachePolicy, IntentType, DesignTokens, MediaResult } from '../types';

const screenLogger = logger.child({ component: 'ScreenRenderer' });

/**
 * Check if a schema tree contains a tab navigator (bottom or top).
 * When present, the outer SDKScrollView must be skipped so the tab bar stays fixed.
 */
function containsTabNavigator(node: SchemaNode | undefined, depth = 0): boolean {
  if (!node || depth > 5) return false;
  if (node.type === 'bottom_tab_navigator' || node.type === 'top_tab_navigator') return true;
  if (Array.isArray(node.children)) {
    return node.children.some(child => containsTabNavigator(child as SchemaNode, depth + 1));
  }
  return false;
}

/**
 * Merge module-level designTokens (from manifest.designTokens.colors) over
 * host-provided tokens.  Module colors win; everything else stays from host.
 */
function mergeDesignTokens(
  base: DesignTokens,
  moduleColors?: Record<string, string>,
): DesignTokens {
  if (!moduleColors || Object.keys(moduleColors).length === 0) return base;
  return {
    ...base,
    colors: { ...base.colors, ...moduleColors },
  };
}

const TOAST_COLORS = {
  success: { bg: '#DCFCE7', text: '#166534' },
  error: { bg: '#FEE2E2', text: '#991B1B' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  info: { bg: '#DBEAFE', text: '#1E40AF' },
};

// --- Error screen icons built from View primitives ---

/** Shared outer circle container for all error icons */
function iconCircle(bgColor: string, children: React.ReactNode): React.JSX.Element {
  return React.createElement(
    SDKView,
    { style: { width: 80, height: 80, borderRadius: 40, backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', marginBottom: 20 } },
    children,
  );
}

/** Network error: disconnected Wi-Fi — three arcs + a small cross */
function networkIcon(): React.JSX.Element {
  return iconCircle('#DBEAFE',
    React.createElement(SDKView, { style: { alignItems: 'center' } },
      // Top arc
      React.createElement(SDKView, { style: { width: 32, height: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 3, borderBottomWidth: 0, borderColor: '#3B82F6', marginBottom: 2 } }),
      // Middle arc
      React.createElement(SDKView, { style: { width: 22, height: 11, borderTopLeftRadius: 11, borderTopRightRadius: 11, borderWidth: 3, borderBottomWidth: 0, borderColor: '#3B82F6', marginBottom: 2 } }),
      // Bottom dot
      React.createElement(SDKView, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6', marginTop: 2 } }),
      // Slash overlay (diagonal line via rotated thin view)
      React.createElement(SDKView, { style: { position: 'absolute', top: 4, width: 36, height: 3, backgroundColor: '#EF4444', borderRadius: 1.5, transform: [{ rotate: '-45deg' }] } }),
    ),
  );
}

/** Timeout error: clock face with hands */
function timeoutIcon(): React.JSX.Element {
  return iconCircle('#FEF3C7',
    React.createElement(SDKView, { style: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: '#D97706', justifyContent: 'center', alignItems: 'center' } },
      // Hour hand (vertical, pointing up)
      React.createElement(SDKView, { style: { position: 'absolute', width: 3, height: 12, backgroundColor: '#D97706', borderRadius: 1.5, bottom: 17 } }),
      // Minute hand (horizontal, pointing right)
      React.createElement(SDKView, { style: { position: 'absolute', width: 10, height: 3, backgroundColor: '#D97706', borderRadius: 1.5, left: 17 } }),
      // Center dot
      React.createElement(SDKView, { style: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#D97706' } }),
    ),
  );
}

/** Not-found error: document with question mark */
function notFoundIcon(): React.JSX.Element {
  return iconCircle('#F3F4F6',
    React.createElement(SDKView, { style: { width: 32, height: 40, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 2, borderColor: '#9CA3AF', justifyContent: 'center', alignItems: 'center' } },
      // Folded corner
      React.createElement(SDKView, { style: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, backgroundColor: '#F3F4F6', borderBottomLeftRadius: 2, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#9CA3AF' } }),
      // Question mark
      React.createElement(SDKText, { style: { fontSize: 20, fontWeight: '700', color: '#9CA3AF', marginTop: 4 } }, '?'),
    ),
  );
}

/** Server error: warning triangle with exclamation */
function serverErrorIcon(): React.JSX.Element {
  return iconCircle('#FEE2E2',
    React.createElement(SDKView, { style: { alignItems: 'center' } },
      // Triangle (approximated with borders)
      React.createElement(SDKView, { style: { width: 0, height: 0, borderLeftWidth: 22, borderRightWidth: 22, borderBottomWidth: 38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#DC2626', borderRadius: 4 } }),
      // Exclamation mark (positioned over triangle)
      React.createElement(SDKView, { style: { position: 'absolute', top: 12, alignItems: 'center' } },
        React.createElement(SDKView, { style: { width: 3, height: 14, backgroundColor: '#FFFFFF', borderRadius: 1.5, marginBottom: 3 } }),
        React.createElement(SDKView, { style: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' } }),
      ),
    ),
  );
}

/** Generic error: circle with exclamation */
function genericErrorIcon(): React.JSX.Element {
  return iconCircle('#FEE2E2',
    React.createElement(SDKView, { style: { alignItems: 'center' } },
      React.createElement(SDKView, { style: { width: 4, height: 20, backgroundColor: '#DC2626', borderRadius: 2, marginBottom: 6 } }),
      React.createElement(SDKView, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#DC2626' } }),
    ),
  );
}

/** Categorize an error message into a user-friendly error type with icon */
function categorizeError(message: string): { title: string; description: string; canRetry: boolean; icon: React.JSX.Element } {
  if (message.includes('404')) {
    return {
      title: i18n.t('screen.error.notFound.title'),
      description: i18n.t('screen.error.notFound.description'),
      canRetry: false,
      icon: notFoundIcon(),
    };
  }
  if (message.includes('timed out') || message.includes('timeout') || message.includes('Timeout')) {
    return {
      title: i18n.t('screen.error.timeout.title'),
      description: i18n.t('screen.error.timeout.description'),
      canRetry: true,
      icon: timeoutIcon(),
    };
  }
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return {
      title: i18n.t('screen.error.server.title'),
      description: i18n.t('screen.error.server.description'),
      canRetry: true,
      icon: serverErrorIcon(),
    };
  }
  if (/network|fetch|Network|Failed to fetch/i.test(message)) {
    return {
      title: i18n.t('screen.error.network.title'),
      description: i18n.t('screen.error.network.description'),
      canRetry: true,
      icon: networkIcon(),
    };
  }
  return {
    title: i18n.t('screen.error.generic.title'),
    description: i18n.t('screen.error.generic.description'),
    canRetry: true,
    icon: genericErrorIcon(),
  };
}

export interface ScreenRendererProps {
  moduleId: string;
  screenId: string;
  onNavigate: (screenId: string) => void;
  onBack: () => void;
  /** Override header visibility (from zone/host config). Manifest headerMode takes priority. */
  showHeader?: boolean;
}

export function ScreenRenderer({
  moduleId,
  screenId,
  onNavigate,
  onBack,
  showHeader,
}: ScreenRendererProps): React.JSX.Element {
  const { config } = useKernel();
  const { moduleLoader, schemaInterpreter, expressionEngine, assetResolver } = useSDK();
  const { navigator, intentBridge, dataBus, apiProxy } = useSDKServices();
  const { isRTL: i18nIsRTL, locale: i18nLocale } = useTranslation();

  const [schema, setSchema] = useState<ScreenSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [screenLoading, setScreenLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<{
    message: string;
    title?: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moduleDesignColors, setModuleDesignColors] = useState<Record<string, string> | undefined>(undefined);
  const [headerMode, setHeaderMode] = useState<'sdk' | 'host' | 'none'>('sdk');

  // Module state isolation via ModuleContext
  const moduleContextRef = useRef(new ModuleContext(config.tenantId, moduleId));
  const [moduleState, setModuleState] = useState<Record<string, unknown>>({});
  // Synchronously-updated refs — avoids stale closure when sequential actions
  // read state/data set by a preceding action in the same dispatch cycle.
  const moduleStateRef = useRef(moduleState);
  moduleStateRef.current = moduleState;
  const dataRef = useRef(data);
  dataRef.current = data;

  const validationEngineRef = useRef(new ValidationEngine());
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMountRef = useRef(true);

  // State persistence via StorageAdapter
  const storageRef = useRef(createStorageAdapter({ tenantId: config.tenantId, moduleId }));

  useEffect(() => {
    // Restore persisted state on mount
    const storage = storageRef.current;
    const savedState = storage.getString('__module_state__');
    console.log('[SDK-DEBUG] mount restore', screenId, 'hasSaved:', !!savedState, 'len:', savedState?.length ?? 0);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        console.log('[SDK-DEBUG] restored keys:', Object.keys(parsed), 'hasSelectedPlan:', 'selectedPlan' in parsed);
        Object.entries(parsed).forEach(([k, v]) => {
          moduleContextRef.current.setState(k, v);
        });
        setModuleState(parsed);
      } catch {
        // Ignore corrupt persisted data
      }
    }

    // Persist state on unmount
    return () => {
      const currentState = moduleContextRef.current;
      const allKeys = currentState.getAllKeys();
      console.log('[SDK-DEBUG] unmount persist', screenId, 'keys:', allKeys);
      if (allKeys.length > 0) {
        const stateObj: Record<string, unknown> = {};
        for (const key of allKeys) {
          stateObj[key] = currentState.getState(key);
        }
        const json = JSON.stringify(stateObj);
        console.log('[SDK-DEBUG] persisting:', json.substring(0, 200));
        storage.setString('__module_state__', json);
        // Verify write
        const verify = storage.getString('__module_state__');
        console.log('[SDK-DEBUG] verify after write:', !!verify, 'len:', verify?.length ?? 0);
      }
    };
  }, [config.tenantId, moduleId]);

  // Fetch the screen schema
  useEffect(() => {
    let cancelled = false;

    async function loadScreen() {
      setLoading(true);
      setError(null);
      setData({});

      // Merge navigation params into moduleContext so data source URL expressions
      // resolve correctly. This avoids the stale-closure issue where the useState
      // moduleState is still {} on the initial render of a newly mounted screen.
      const navParams = navigator.getCurrentRoute()?.params;
      if (navParams) {
        for (const [k, v] of Object.entries(navParams)) {
          moduleContextRef.current.setState(k, v);
        }
        setModuleState((prev) => ({ ...prev, ...navParams }));
      }

      try {
        screenLogger.info('Loading screen', { moduleId, screenId });

        // Load screen and manifest in parallel
        const [screenSchema, manifest] = await Promise.all([
          moduleLoader.loadScreen(moduleId, screenId),
          moduleLoader.loadManifest(moduleId).catch(() => null),
        ]);

        if (cancelled) return;

        // Extract module-specific design token colors from manifest
        if (manifest?.designTokens?.colors) {
          setModuleDesignColors(manifest.designTokens.colors);
        }

        // Read navigation config from manifest
        if (manifest?.navigation?.headerMode) {
          setHeaderMode(manifest.navigation.headerMode);
        }

        // Load module i18n string tables if present (namespaced by moduleId)
        if (manifest?.i18n) {
          for (const [locale, strings] of Object.entries(manifest.i18n)) {
            // Prefix each key with moduleId: to prevent cross-module collisions
            const namespacedStrings: Record<string, string> = {};
            for (const [key, value] of Object.entries(strings)) {
              namespacedStrings[`${moduleId}:${key}`] = value;
            }
            i18n.addStrings(locale, namespacedStrings);
          }
        }

        setSchema(screenSchema);
        setLoading(false);

        dataBus.publish('sdk:screen:loaded', { moduleId, screenId });

        // Fetch data sources if defined
        if (screenSchema.dataSources) {
          // Build state snapshot from moduleContext (avoids stale closure over moduleState)
          const stateSnapshot: Record<string, unknown> = {};
          for (const key of moduleContextRef.current.getAllKeys()) {
            stateSnapshot[key] = moduleContextRef.current.getState(key);
          }
          await fetchDataSources(screenSchema.dataSources, stateSnapshot);
        }

        // Execute onLoad actions if defined
        if (screenSchema.onLoad && isFirstMountRef.current) {
          for (const loadAction of screenSchema.onLoad) {
            handleAction(loadAction);
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        screenLogger.error('Failed to load screen', { moduleId, screenId, error: message });
        setError(message);
        setLoading(false);
      }
    }

    loadScreen();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, screenId, moduleLoader, retryCount]);

  // Cancel timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Debounced data source fetcher
  function debouncedFetchDataSources(
    dataSources: Record<string, DataSourceConfig | { api: string; method: string }>,
  ): void {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      fetchDataSources(dataSources);
      return;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchDataSources(dataSources);
    }, 300);
  }

  // Data source cache TTL: 5 minutes
  const DS_CACHE_TTL = 300_000;

  // Fetch data sources for a screen with auth injection and optional caching
  async function fetchDataSources(
    dataSources: Record<string, DataSourceConfig | { api: string; method: string }>,
    stateSnapshot?: Record<string, unknown>,
  ): Promise<void> {
    const storage = storageRef.current;
    const effectiveState = stateSnapshot ?? moduleState;

    for (const [key, ds] of Object.entries(dataSources)) {
      try {
        // Resolve expressions in ds.api (e.g. "/api/plans/${state.planId}")
        const resolvedApi = ds.api.includes('${')
          ? expressionEngine.resolveExpressions(ds.api, { state: effectiveState, data })
          : ds.api;
        const isAbsoluteUrl = resolvedApi.startsWith('http://') || resolvedApi.startsWith('https://');
        const url = isAbsoluteUrl ? resolvedApi : `${config.apiBaseUrl}${resolvedApi}`;
        const cacheKey = `__ds_cache__:${url}`;
        const policy: DataSourceCachePolicy = ('cachePolicy' in ds && ds.cachePolicy) ? ds.cachePolicy : 'cache-first';

        // Check cache for cache-first policy
        if (policy === 'cache-first') {
          const cached = storage.getString(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as { data: unknown; timestamp: number };
              const effectiveTTL = ('cache' in ds && (ds as DataSourceConfig).cache?.ttl)
                ? (ds as DataSourceConfig).cache!.ttl * 1000
                : DS_CACHE_TTL;
              if (parsed.timestamp + effectiveTTL > Date.now()) {
                setData((prev) => ({ ...prev, [key]: parsed.data }));
                continue;
              }
            } catch {
              // Corrupt cache, proceed to fetch
            }
          }
        }

        // Skip fetch only for cache-first with fresh cache (handled above)
        // For no-cache and network-first, always fetch
        // Helper: apply transform expression to fetched data if defined
        const applyTransform = (rawData: unknown): unknown => {
          const dsTyped = ds as DataSourceConfig;
          if (dsTyped.transform) {
            try {
              return expressionEngine.evaluate(dsTyped.transform, { data: rawData });
            } catch (err: unknown) {
              screenLogger.warn('Data source transform failed', {
                key,
                transform: dsTyped.transform,
                error: err instanceof Error ? err.message : String(err),
              });
              return rawData;
            }
          }
          return rawData;
        };

        if (apiProxy) {
          // Use APIProxy for all requests (auth injection, retries, telemetry)
          // Absolute URLs use requestAbsolute() to skip baseUrl prepending
          const proxyResponse = isAbsoluteUrl
            ? await apiProxy.requestAbsolute(resolvedApi, {
                method: ds.method,
                ...('body' in ds && ds.body ? { body: ds.body } : {}),
              })
            : await apiProxy.request(resolvedApi, {
                method: ds.method,
                ...('body' in ds && ds.body ? { body: ds.body } : {}),
              });
          if (proxyResponse.ok) {
            const transformed = applyTransform(proxyResponse.data);
            setData((prev) => ({ ...prev, [key]: transformed }));

            // Update cache (except for no-cache policy)
            if (policy !== 'no-cache') {
              storage.setString(cacheKey, JSON.stringify({ data: transformed, timestamp: Date.now() }));
            }
          } else {
            screenLogger.warn('Data source response not ok', {
              key, status: proxyResponse.status, api: resolvedApi,
            });
          }
        } else {
          // Fallback to raw fetch (for backwards compatibility)
          const fetchOptions: RequestInit = {
            method: ds.method,
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${config.authToken}`,
            },
          };
          if ('body' in ds && ds.body && ds.method !== 'GET') {
            fetchOptions.headers = { ...fetchOptions.headers as Record<string, string>, 'Content-Type': 'application/json' };
            fetchOptions.body = JSON.stringify(ds.body);
          }
          const response = await fetch(url, fetchOptions);
          if (response.ok) {
            const result = await response.json();
            const transformed = applyTransform(result);
            setData((prev) => ({ ...prev, [key]: transformed }));

            // Update cache (except for no-cache policy)
            if (policy !== 'no-cache') {
              storage.setString(cacheKey, JSON.stringify({ data: transformed, timestamp: Date.now() }));
            }
          }
        }
      } catch (err: unknown) {
        screenLogger.warn('Failed to fetch data source', {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Handle action dispatch from schema components
  const handleAction = useCallback(
    (action: ActionConfig) => {
      // Helper: execute one or many actions in sequence
      const executeActions = (actions: ActionConfig | ActionConfig[]) => {
        if (Array.isArray(actions)) {
          for (const a of actions) handleAction(a);
        } else {
          handleAction(actions);
        }
      };

      dataBus.publish('sdk:action:dispatched', { moduleId, screenId, action: action.action });
      console.log('[SDK-DEBUG] handleAction:', action.action, 'screen:', screenId);

      switch (action.action) {
        case 'navigate':
          if (action.screen) {
            // Resolve $event expressions in params when payload is present (e.g. onChartPress, table onPress)
            let resolvedParams = action.params;
            if (action.payload) {
              if (action.params) {
                resolvedParams = expressionEngine.resolveObjectExpressions(
                  action.params,
                  { data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId }, event: action.payload },
                );
              } else {
                // No explicit params — auto-forward payload as params
                resolvedParams = action.payload;
              }
            }
            // Merge navigate params into module state so the target screen can access them
            if (resolvedParams) {
              for (const [k, v] of Object.entries(resolvedParams)) {
                moduleContextRef.current.setState(k, v);
              }
              moduleStateRef.current = { ...moduleStateRef.current, ...resolvedParams };
              setModuleState((prev) => ({ ...prev, ...resolvedParams }));
            }
            // Push to navigator (ZoneRenderer re-renders via listener)
            navigator.navigate({ moduleId, screenId: action.screen, params: resolvedParams, transition: action.transition });
          }
          break;

        case 'go_back': {
          const wentBack = navigator.goBack();
          if (!wentBack) {
            // No internal history — tell host to navigate back
            onBack();
          }
          // If wentBack is true, navigator state change triggers ZoneRenderer re-render
          break;
        }

        case 'update_state':
          if (action.key) {
            // Resolve $event expressions when payload is present (e.g. from onChartPress)
            let resolvedValue = action.value;
            if (action.payload && typeof resolvedValue === 'string' && expressionEngine.isExpression(resolvedValue)) {
              resolvedValue = expressionEngine.evaluate(resolvedValue, {
                data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId }, event: action.payload,
              });
            }
            console.log('[SDK-DEBUG] update_state', action.key, 'resolved:', resolvedValue);
            // Update ref synchronously so subsequent actions in the same cycle see it
            moduleStateRef.current = { ...moduleStateRef.current, [action.key!]: resolvedValue };
            moduleContextRef.current.setState(action.key, resolvedValue);
            setModuleState((prev) => ({ ...prev, [action.key!]: resolvedValue }));
          }
          break;

        case 'api_call':
          if (action.dataSource && schema?.dataSources?.[action.dataSource]) {
            const ds = schema.dataSources[action.dataSource];
            if (action.params) {
              const resolvedParams = expressionEngine.resolveObjectExpressions(
                typeof action.params === 'string' ? JSON.parse(action.params) : action.params,
                { data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId } },
              );
              const paramStr = new URLSearchParams(
                Object.entries(resolvedParams).map(([k, v]) => [k, String(v)]),
              ).toString();
              const apiWithParams = ds.api.includes('?') ? `${ds.api}&${paramStr}` : `${ds.api}?${paramStr}`;
              debouncedFetchDataSources({ [action.dataSource]: { ...ds, api: apiWithParams } });
            } else {
              debouncedFetchDataSources({ [action.dataSource]: ds });
            }
          }
          break;

        case 'api_submit': {
          if (!action.api) {
            screenLogger.warn('api_submit action missing api path', { moduleId });
            break;
          }

          const submitMethod = action.method ?? 'POST';

          // Resolve $state/$data/$event expressions in API URL (e.g. "/usage/day/${$state.selectedDay}")
          const exprCtx: Record<string, unknown> = { data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId } };
          if (action.payload) exprCtx.event = action.payload;
          let resolvedApi = action.api;
          if (expressionEngine.isExpression(resolvedApi)) {
            resolvedApi = expressionEngine.resolveExpressions(resolvedApi, exprCtx);
          }

          // Resolve body template expressions (includes $event when payload present)
          let resolvedBody: Record<string, unknown> = {};
          if (action.bodyTemplate) {
            resolvedBody = expressionEngine.resolveObjectExpressions(action.bodyTemplate, exprCtx);
          }

          // Execute the API call
          (async () => {
            try {
              setScreenLoading(true);
              console.log('[SDK-DEBUG] api_submit:', submitMethod, resolvedApi, 'apiProxy:', !!apiProxy);
              dataBus.publish('sdk:api:submit', { moduleId, screenId, api: resolvedApi, method: submitMethod });

              const isAbsoluteApi = resolvedApi.startsWith('http://') || resolvedApi.startsWith('https://');
              let response: { ok: boolean; status: number; data: unknown };

              if (apiProxy) {
                response = isAbsoluteApi
                  ? await apiProxy.requestAbsolute(resolvedApi, {
                      method: submitMethod,
                      body: resolvedBody,
                    })
                  : await apiProxy.request(resolvedApi, {
                      method: submitMethod,
                      body: resolvedBody,
                    });
              } else {
                // Fallback to raw fetch when apiProxy is not available
                const fetchOptions: RequestInit = {
                  method: submitMethod,
                  headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${config.authToken}`,
                  },
                };
                if (resolvedBody && Object.keys(resolvedBody).length > 0 && submitMethod !== 'GET') {
                  fetchOptions.headers = { ...fetchOptions.headers as Record<string, string>, 'Content-Type': 'application/json' };
                  fetchOptions.body = JSON.stringify(resolvedBody);
                }
                const fetchUrl = isAbsoluteApi ? resolvedApi : `${config.apiBaseUrl}${resolvedApi}`;
                const rawResponse = await fetch(fetchUrl, fetchOptions);
                let data: unknown = null;
                try { data = await rawResponse.json(); } catch { /* non-JSON response */ }
                response = { ok: rawResponse.ok, status: rawResponse.status, data };
              }

              setScreenLoading(false);
              console.log('[SDK-DEBUG] api_submit response:', response.status, response.ok, JSON.stringify(response.data).slice(0, 200));

              // Store response data only on success (error responses should not pollute $data)
              const storeKey = action.responseKey ?? action.dataSource;

              if (response.ok) {
                if (storeKey) {
                  dataRef.current = { ...dataRef.current, [storeKey]: response.data };
                  setData((prev) => ({ ...prev, [storeKey]: response.data }));
                }
                // Execute onSuccess action(s)
                if (action.onSuccess) {
                  executeActions(action.onSuccess);
                }

                screenLogger.info('api_submit succeeded', { moduleId, api: resolvedApi, status: response.status });
              } else {
                // Execute onError action(s)
                if (action.onError) {
                  executeActions(action.onError);
                }

                screenLogger.warn('api_submit failed', { moduleId, api: resolvedApi, status: response.status });
              }
            } catch (err: unknown) {
              setScreenLoading(false);
              const message = err instanceof Error ? err.message : String(err);
              screenLogger.error('api_submit error', { moduleId, api: resolvedApi, error: message });

              if (action.onError) {
                executeActions(action.onError);
              }
            }
          })();
          break;
        }

        case 'emit_intent':
          if (action.event) {
            intentBridge.emit({
              type: action.event as IntentType,
              payload: action.payload ?? {},
              source: 'sdk',
              timestamp: Date.now(),
            }).catch((err: unknown) => {
              screenLogger.error('Intent emission failed', {
                event: action.event,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
          break;

        case 'validate': {
          const rules = schema?.validation;
          console.log('[SDK-DEBUG] validate: hasRules:', !!rules, 'hasOnValid:', !!action.onValid, 'onValidCount:', Array.isArray(action.onValid) ? action.onValid.length : 0);
          if (!rules) {
            // No validation rules on this screen — treat as all valid
            if (action.onValid) {
              console.log('[SDK-DEBUG] validate: no rules, executing onValid');
              executeActions(action.onValid);
            }
            break;
          }

          const fieldsToValidate = action.fields ?? Object.keys(rules);
          const newErrors: Record<string, string[]> = {};
          let allValid = true;

          for (const fieldId of fieldsToValidate) {
            const fieldRules = rules[fieldId];
            if (!fieldRules) continue;
            const fieldValue = moduleStateRef.current[fieldId];
            const result = validationEngineRef.current.validate(fieldValue, fieldRules);
            if (!result.valid) {
              newErrors[fieldId] = result.errors;
              allValid = false;
            }
          }

          setValidationErrors(newErrors);

          if (allValid) {
            // Execute onValid callback(s) — the primary chaining mechanism
            if (action.onValid) {
              executeActions(action.onValid);
            }
            // Legacy: navigate directly if screen is set (backward compatible)
            else if (action.screen) {
              navigator.navigate({ moduleId, screenId: action.screen });
            }
          } else {
            // Execute onInvalid callback(s) — e.g. show_toast with error
            if (action.onInvalid) {
              executeActions(action.onInvalid);
            }
          }
          break;
        }

        case 'show_loading':
          setScreenLoading(true);
          break;

        case 'hide_loading':
          setScreenLoading(false);
          break;

        case 'track_screen_view':
          dataBus.publish('sdk:analytics:screen_view', { moduleId, screenId, timestamp: Date.now() });
          screenLogger.debug('Screen view tracked', { moduleId, screenId });
          break;

        case 'track_interaction':
          dataBus.publish('sdk:analytics:interaction', {
            moduleId, screenId,
            action: action.event ?? 'unknown',
            elementId: action.key,
            timestamp: Date.now(),
          });
          screenLogger.debug('Interaction tracked', { moduleId, screenId, event: action.event });
          break;

        case 'analytics':
          screenLogger.info('Analytics event', {
            event: action.event,
            payload: action.payload,
          });
          break;

        case 'run_action': {
          // Named action sequences: look up schema.actions[ref] and execute each
          const ref = action.ref;
          if (!ref) {
            screenLogger.warn('run_action missing ref', { moduleId });
            break;
          }
          const actionSequence = schema?.actions?.[ref];
          if (!actionSequence) {
            screenLogger.warn('run_action ref not found', { moduleId, ref });
            break;
          }
          for (const seqAction of actionSequence) {
            // Propagate payload so sub-actions can resolve $event expressions
            handleAction(action.payload ? { ...seqAction, payload: action.payload } : seqAction);
          }
          break;
        }

        case 'show_toast': {
          const toastMessage = action.message ?? '';
          if (!toastMessage) {
            screenLogger.warn('show_toast missing message', { moduleId });
            break;
          }
          let resolvedMessage = toastMessage;
          if (expressionEngine.isExpression(toastMessage)) {
            resolvedMessage = expressionEngine.resolveExpressions(toastMessage, {
              data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId },
            });
          }
          let resolvedTitle = action.title;
          if (resolvedTitle && expressionEngine.isExpression(resolvedTitle)) {
            resolvedTitle = expressionEngine.resolveExpressions(resolvedTitle, {
              data: dataRef.current, state: moduleStateRef.current, user: { id: config.userId, tenantId: config.tenantId },
            });
          }

          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          const toastDuration = action.duration ?? 3000;
          setToast({
            message: resolvedMessage,
            title: resolvedTitle,
            variant: action.toastVariant ?? 'info',
          });
          toastTimerRef.current = setTimeout(() => setToast(null), toastDuration);
          dataBus.publish('sdk:toast:shown', { moduleId, screenId, variant: action.toastVariant ?? 'info' });
          break;
        }

        case 'media_pick': {
          if (!action.mediaSource) {
            screenLogger.warn('media_pick action missing mediaSource', { moduleId });
            break;
          }
          (async () => {
            try {
              dataBus.publish('sdk:media:request', { moduleId, screenId, source: action.mediaSource });
              const mediaModule = getNativeModule('MediaModule');

              // Request permissions based on source
              if (action.mediaSource === 'camera' || action.mediaSource === 'camera_or_library') {
                const camPerm = await mediaModule.requestCameraPermission();
                if (camPerm !== 'granted') {
                  screenLogger.warn('Camera permission denied', { moduleId });
                  if (action.onError) executeActions(action.onError);
                  return;
                }
              }
              if (action.mediaSource === 'photo_library' || action.mediaSource === 'camera_or_library') {
                const libPerm = await mediaModule.requestLibraryPermission();
                if (libPerm !== 'granted') {
                  screenLogger.warn('Photo library permission denied', { moduleId });
                  if (action.onError) executeActions(action.onError);
                  return;
                }
              }

              // Build options from action config
              const options = {
                accept: action.mediaAccept ?? 'image/*',
                maxSize: action.mediaMaxSize,
                maxDimension: action.mediaMaxDimension,
                quality: action.mediaQuality ?? 0.8,
                includeBase64: action.mediaIncludeBase64 ?? false,
                multiple: action.mediaMultiple ?? false,
                maxCount: action.mediaMaxCount ?? 10,
                storage: action.mediaStorage ?? { location: 'temp', persist: false },
              };

              // Invoke native module
              const resultStr = action.mediaSource === 'camera'
                ? await mediaModule.captureImage(JSON.stringify(options))
                : await mediaModule.pickFromLibrary(JSON.stringify(options));
              const result: MediaResult | MediaResult[] = JSON.parse(resultStr);

              // Store in state
              const storeKey = action.responseKey ?? 'mediaPick';
              moduleStateRef.current = { ...moduleStateRef.current, [storeKey]: result };
              moduleContextRef.current.setState(storeKey, result);
              setModuleState(prev => ({ ...prev, [storeKey]: result }));

              dataBus.publish('sdk:media:captured', { moduleId, source: action.mediaSource });
              if (action.onSuccess) executeActions(action.onSuccess);
            } catch (err: unknown) {
              screenLogger.error('media_pick error', { moduleId, error: err instanceof Error ? err.message : String(err) });
              if (action.onError) executeActions(action.onError);
            }
          })();
          break;
        }

        case 'capture_camera': {
          if (!action.cameraId) {
            screenLogger.warn('capture_camera action missing cameraId', { moduleId });
            break;
          }
          (async () => {
            try {
              dataBus.publish('sdk:media:request', { moduleId, screenId, source: 'camera_view' });
              const mediaModule = getNativeModule('MediaModule');

              const options = {
                quality: action.mediaQuality ?? 0.8,
                maxDimension: action.mediaMaxDimension,
                includeBase64: action.mediaIncludeBase64 ?? false,
                storage: action.mediaStorage ?? { location: 'temp', persist: false },
              };

              const resultStr = await mediaModule.captureFromView(action.cameraId!, JSON.stringify(options));
              const result: MediaResult = JSON.parse(resultStr);

              const storeKey = action.responseKey ?? 'cameraCapture';
              moduleStateRef.current = { ...moduleStateRef.current, [storeKey]: result };
              moduleContextRef.current.setState(storeKey, result);
              setModuleState(prev => ({ ...prev, [storeKey]: result }));

              dataBus.publish('sdk:media:captured', { moduleId, source: 'camera_view' });
              if (action.onSuccess) executeActions(action.onSuccess);
            } catch (err: unknown) {
              screenLogger.error('capture_camera error', { moduleId, error: err instanceof Error ? err.message : String(err) });
              if (action.onError) executeActions(action.onError);
            }
          })();
          break;
        }

        default:
          screenLogger.warn('Unhandled action type', { action: action.action });
      }
    },
    [moduleId, screenId, schema, config, moduleState, onNavigate, onBack, navigator, intentBridge, dataBus, apiProxy, expressionEngine],
  );

  // Handle state changes from input components
  const handleStateChange = useCallback((key: string, value: unknown) => {
    moduleContextRef.current.setState(key, value);
    setModuleState((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Emit screen change info to host app (for host-controlled headers)
  const resolvedTitleRef = useRef('');
  useEffect(() => {
    if (schema && config.onScreenChange) {
      // Resolve title for emission — uses the same logic as render-time title resolution
      let emitTitle = schema.header?.title ?? schema.title ?? '';
      if (expressionEngine.isExpression(emitTitle)) {
        const titleCtx: Record<string, unknown> = {
          data,
          state: moduleState,
          user: { id: config.userId, tenantId: config.tenantId },
          $t: (key: string) => {
            const namespaced = `${moduleId}:${key}`;
            const result = i18n.t(namespaced);
            if (result !== namespaced) return result;
            return i18n.t(key);
          },
        };
        if (emitTitle.includes('${')) {
          emitTitle = expressionEngine.resolveExpressions(emitTitle, titleCtx);
        } else {
          try {
            const result = expressionEngine.evaluate(emitTitle, titleCtx);
            emitTitle = result == null ? '' : String(result);
          } catch { /* keep original */ }
        }
      }
      resolvedTitleRef.current = emitTitle;
      config.onScreenChange({
        moduleId,
        screenId,
        title: emitTitle,
        canGoBack: navigator.canGoBack(),
      });
    }
  }, [moduleId, screenId, schema, data, moduleState, config, navigator, expressionEngine]);

  // Loading state
  if (loading) {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
      React.createElement(SDKActivityIndicator, { size: 'large' }),
    );
  }

  // Compute design tokens early so the error screen can use them
  const baseTokens = config.designTokens ?? DEFAULT_DESIGN_TOKENS;
  const designTokens = mergeDesignTokens(baseTokens, moduleDesignColors);

  // Error state
  if (error || !schema) {
    const errorInfo = categorizeError(error ?? '');
    const primaryColor = designTokens?.colors?.primary ?? '#6366F1';

    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#FAFAFA' } },
      // Icon
      errorInfo.icon,
      // Title
      React.createElement(
        SDKText,
        { style: { fontSize: 18, fontWeight: '600', color: '#1F2937', textAlign: 'center', marginBottom: 8 } },
        errorInfo.title,
      ),
      // Description
      React.createElement(
        SDKText,
        { style: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 32, paddingHorizontal: 16 } },
        errorInfo.description,
      ),
      // Retry button (only for retryable errors)
      errorInfo.canRetry
        ? React.createElement(
            SDKTouchableOpacity,
            {
              onPress: () => { setError(null); setRetryCount((c) => c + 1); },
              style: {
                paddingHorizontal: 32, paddingVertical: 12,
                backgroundColor: primaryColor,
                borderRadius: 8, marginBottom: 12,
              },
            },
            React.createElement(SDKText, { style: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' } }, i18n.t('screen.action.retry')),
          )
        : null,
      // Go Back button
      React.createElement(
        SDKTouchableOpacity,
        { onPress: onBack, style: { paddingHorizontal: 24, paddingVertical: 12 } },
        React.createElement(SDKText, { style: { color: primaryColor, fontSize: 14, fontWeight: '500' } }, i18n.t('screen.action.goBack')),
      ),
    );
  }
  const renderContext: RenderContext = {
    tenantId: config.tenantId,
    moduleId,
    screenId,
    data,
    state: moduleState,
    user: {
      id: config.userId,
      tenantId: config.tenantId,
    },
    designTokens,
    onAction: handleAction,
    onStateChange: handleStateChange,
    validationRules: schema.validation,
    validationErrors,
    isRTL: i18nIsRTL,
    locale: i18nLocale,
    resolveAssetUrl: assetResolver
      ? (mid: string, ref: string) => assetResolver.resolveAssetUrl(mid, ref)
      : undefined,
  };

  // Resolve screen title (include $t for i18n expressions)
  // Per-screen header.title override takes priority
  let title = schema.header?.title ?? schema.title ?? '';
  if (expressionEngine.isExpression(title)) {
    const titleCtx: Record<string, unknown> = {
      data,
      state: moduleState,
      user: renderContext.user,
      $t: (key: string) => {
        if (moduleId) {
          const namespaced = `${moduleId}:${key}`;
          const result = i18n.t(namespaced);
          if (result !== namespaced) return result;
        }
        return i18n.t(key);
      },
    };
    if (title.includes('${')) {
      // Template expression: "Hello ${$data.name}"
      title = expressionEngine.resolveExpressions(title, titleCtx);
    } else {
      // Direct expression: "$t('dashboard.title')" or "$data.plan.name"
      try {
        const result = expressionEngine.evaluate(title, titleCtx);
        title = result == null ? '' : String(result);
      } catch {
        // Keep original title on evaluation failure
      }
    }
  }

  // Determine header visibility:
  // 1. Per-screen schema.header.visible overrides everything
  // 2. Manifest navigation.headerMode ('sdk' shows, 'host'/'none' hides)
  // 3. showHeader prop from parent (ZoneRenderer/host)
  const headerVisible = schema.header?.visible !== undefined
    ? schema.header.visible
    : headerMode === 'sdk' && showHeader !== false;

  const backVisible = schema.header?.backVisible !== false;

  // Pass header visibility so safe_area_view can avoid double top padding
  renderContext.headerVisible = headerVisible;

  // Detect tab navigator to adjust layout strategy
  const hasTabNavigator = containsTabNavigator(schema?.body);

  // For tab screens, inject flex: 1 into the body node so the root column
  // fills the container. Without this, ColumnComponent has auto height and
  // flex: 1 children (SafeAreaView, TabNavigator) collapse to 0.
  let effectiveSchema = schema;
  if (hasTabNavigator && schema.body) {
    const bodyStyle = (schema.body.style ?? {}) as Record<string, unknown>;
    if (!bodyStyle.flex) {
      effectiveSchema = {
        ...schema,
        body: { ...schema.body, style: { ...bodyStyle, flex: 1 } },
      };
    }
  }

  // Render the screen
  const screenContent = schemaInterpreter.interpretScreen(effectiveSchema, renderContext);

  // Safe area insets for devices with notch/Dynamic Island
  const safeAreaInsets = getDefaultSafeAreaInsets();

  return React.createElement(
    SDKView,
    { style: { flex: 1 } },
    // Header with back button and title (conditionally rendered)
    headerVisible
      ? React.createElement(
          SDKView,
          {
            style: {
              flexDirection: i18nIsRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingTop: safeAreaInsets.top + 12,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: designTokens.colors.border ?? '#E5E7EB',
              backgroundColor: designTokens.colors.primary,
            },
          },
          backVisible
            ? React.createElement(
                SDKTouchableOpacity,
                {
                  onPress: () => handleAction({ action: 'go_back' }),
                  style: { [i18nIsRTL ? 'paddingLeft' : 'paddingRight']: 12, paddingVertical: 4 },
                },
                React.createElement(
                  SDKText,
                  { style: { fontSize: 18, color: '#FFFFFF' } },
                  i18nIsRTL ? '\u2192' : '\u2190',
                ),
              )
            : null,
          React.createElement(
            SDKText,
            {
              numberOfLines: 1,
              style: {
                flex: 1,
                fontSize: 17,
                fontWeight: '600',
                color: '#FFFFFF',
              },
            },
            title,
          ),
        )
      : null,
    // Screen body with keyboard avoidance
    React.createElement(
      SDKKeyboardAvoidingView,
      {
        style: { flex: 1 },
        behavior: Platform.OS === 'ios' ? 'padding' as const : undefined,
        keyboardVerticalOffset: headerVisible ? 56 : 0,
      },
      // Tab screens: use plain SDKView (tab panes have their own inner scroll).
      // Non-tab screens: use SDKScrollView for normal page scrolling.
      hasTabNavigator
        ? React.createElement(
            SDKView,
            { style: { flex: 1 } },
            screenContent,
          )
        : React.createElement(
            SDKScrollView,
            {
              style: { flex: 1 },
              contentContainerStyle: { flexGrow: 1 },
              keyboardShouldPersistTaps: 'handled' as const,
            },
            screenContent,
          ),
    ),
    // Loading overlay
    screenLoading
      ? React.createElement(
          SDKView,
          {
            style: {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(255,255,255,0.7)',
              justifyContent: 'center',
              alignItems: 'center',
            },
          },
          React.createElement(SDKActivityIndicator, { size: 'large' }),
        )
      : null,
    // Toast overlay
    toast
      ? React.createElement(
          SDKView,
          {
            style: {
              position: 'absolute' as const,
              bottom: 40,
              left: 16,
              right: 16,
              backgroundColor: TOAST_COLORS[toast.variant].bg,
              borderRadius: 8,
              padding: 12,
              flexDirection: i18nIsRTL ? 'row-reverse' as const : 'row' as const,
              alignItems: 'center',
            },
          },
          React.createElement(
            SDKView,
            { style: { flex: 1 } },
            toast.title
              ? React.createElement(SDKText, {
                  style: { fontSize: 13, fontWeight: '600', color: TOAST_COLORS[toast.variant].text, marginBottom: 2, textAlign: i18nIsRTL ? 'right' : 'left' },
                }, toast.title)
              : null,
            React.createElement(SDKText, {
              style: { fontSize: 13, color: TOAST_COLORS[toast.variant].text, textAlign: i18nIsRTL ? 'right' : 'left' },
            }, toast.message),
          ),
          React.createElement(
            SDKTouchableOpacity,
            { onPress: () => setToast(null), style: { [i18nIsRTL ? 'paddingRight' : 'paddingLeft']: 8 } },
            React.createElement(SDKText, { style: { fontSize: 16, color: TOAST_COLORS[toast.variant].text } }, '\u00D7'),
          ),
        )
      : null,
  );
}
