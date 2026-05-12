/**
 * SDKProvider - Main entry point component for the Enterprise Module SDK
 * @module components/SDKProvider
 *
 * Accepts host app configuration, bootstraps the runtime kernel,
 * and provides kernel context to all descendant components.
 *
 * Usage:
 * ```tsx
 * <SDKProvider
 *   authToken={jwt}
 *   tenantId="acme"
 *   userId="user-1"
 *   apiBaseUrl="https://api.example.com"
 *   zones={{ actions: { type: 'actions', position: 'top', height: 120 } }}
 * >
 *   <ZoneRenderer zoneId="actions" />
 * </SDKProvider>
 * ```
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { logger } from '../utils/logger';
import { RuntimeKernel } from '../kernel/Kernel';
import { KernelProvider } from '../kernel/KernelContext';
import { ErrorBoundary } from '../kernel/errors/ErrorBoundary';
import { ModuleLoader } from '../modules/ModuleLoader';
import { ModuleCache } from '../modules/ModuleCache';
import { ModuleRegistry } from '../modules/ModuleRegistry';
import { AssetResolver } from '../modules/AssetResolver';
import { SchemaInterpreter } from '../schema/SchemaInterpreter';
import { ComponentRegistry } from '../schema/ComponentRegistry';
import { ExpressionEngine } from '../schema/ExpressionEngine';
import { StyleResolver } from '../schema/StyleResolver';
import { COMPONENT_SPECS } from '../schema/ComponentSpecs';
import {
  TextComponent,
  InputComponent,
  ButtonComponent,
  ImageComponent,
  RowComponent,
  ColumnComponent,
  CardComponent,
  ScrollComponent,
  RepeaterComponent,
  ConditionalComponent,
  SpacerComponent,
  DividerComponent,
  BadgeComponent,
  IconComponent,
  LoadingComponent,
  TableComponent,
  SelectComponent,
  CheckboxComponent,
  ChartComponent,
  FileUploadComponent,
  CameraViewComponent,
  BarcodeScannerComponent,
  AccordionComponent,
  AccordionItemComponent,
  BottomSheetComponent,
  ScanFrameComponent,
  CornerBracketsComponent,
  FaceGuideComponent,
  GridOverlayComponent,
  CrosshairComponent,
  ScanLineComponent,
  TabNavigatorComponent,
  TabPaneComponent,
  SafeAreaViewComponent,
  StepperComponent,
  StepComponent,
  CalendarComponent,
  TimeSlotComponent,
} from '../schema/components';
import { SDKView, SDKText, SDKActivityIndicator } from '../adapters';
import { createSDKNavigator, SDKNavigationContainer } from '../adapters/NavigationAdapter';
import { DEFAULT_DESIGN_TOKENS } from '../constants/defaults';
import { I18nProvider, i18n } from '../i18n';
import { SubscriptionProvider } from '../kernel/policy/SubscriptionProvider';
import type { KernelState, KernelConfig, KernelStatus, SchemaComponentProps } from '../types';

const providerLogger = logger.child({ component: 'SDKProvider' });

/** SDK-wide context for module system (available via useSDK hook) */
export interface SDKContextValue {
  moduleLoader: ModuleLoader;
  moduleRegistry: ModuleRegistry;
  schemaInterpreter: SchemaInterpreter;
  expressionEngine: ExpressionEngine;
  assetResolver: AssetResolver;
}

export const SDKContext = React.createContext<SDKContextValue | null>(null);
SDKContext.displayName = 'SDKContext';

/** Hook to access the SDK module system context */
export function useSDK(): SDKContextValue {
  const ctx = React.useContext(SDKContext);
  if (ctx === null) {
    throw new Error(
      'useSDK() must be used within an <SDKProvider>. ' +
        'Wrap your component tree with <SDKProvider>.',
    );
  }
  return ctx;
}

/** Props for SDKProvider (extends KernelConfig) */
export interface SDKProviderProps extends KernelConfig {
  children?: React.ReactNode;
}

/** Component registry builder - registers all 32 built-in components */
function buildComponentRegistry(): ComponentRegistry {
  const registry = new ComponentRegistry(COMPONENT_SPECS);

  const componentMap: Record<string, React.ComponentType<SchemaComponentProps>> = {
    text: TextComponent,
    input: InputComponent,
    button: ButtonComponent,
    image: ImageComponent,
    row: RowComponent,
    column: ColumnComponent,
    card: CardComponent,
    scroll: ScrollComponent,
    repeater: RepeaterComponent,
    conditional: ConditionalComponent,
    spacer: SpacerComponent,
    divider: DividerComponent,
    badge: BadgeComponent,
    icon: IconComponent,
    loading: LoadingComponent,
    table: TableComponent,
    select: SelectComponent,
    checkbox: CheckboxComponent,
    chart: ChartComponent,
    file_upload: FileUploadComponent,
    camera_view: CameraViewComponent,
    barcode_scanner: BarcodeScannerComponent,
    accordion: AccordionComponent,
    accordion_item: AccordionItemComponent,
    bottom_sheet: BottomSheetComponent,
    scan_frame: ScanFrameComponent,
    corner_brackets: CornerBracketsComponent,
    face_guide: FaceGuideComponent,
    grid_overlay: GridOverlayComponent,
    crosshair: CrosshairComponent,
    scan_line: ScanLineComponent,
    bottom_tab_navigator: TabNavigatorComponent,
    top_tab_navigator: TabNavigatorComponent,
    tab_pane: TabPaneComponent,
    safe_area_view: SafeAreaViewComponent,
    stepper: StepperComponent,
    step: StepComponent,
    calendar: CalendarComponent,
    time_slot: TimeSlotComponent,
  };

  for (const [type, component] of Object.entries(componentMap)) {
    const spec = COMPONENT_SPECS[type];
    if (spec) {
      registry.register(spec, component);
    }
  }

  return registry;
}

export function SDKProvider({ children, ...config }: SDKProviderProps): React.JSX.Element {
  const [kernelState, setKernelState] = useState<KernelState>('IDLE');
  const [kernelStatus, setKernelStatus] = useState<KernelStatus>({
    state: 'IDLE',
    moduleCount: 0,
  });
  const [bootError, setBootError] = useState<string | null>(null);
  const [subscriptionProvider, setSubscriptionProvider] = useState<SubscriptionProvider | undefined>(undefined);

  // Refs for stable instances
  const kernelRef = useRef<RuntimeKernel | null>(null);
  const configRef = useRef<KernelConfig>(config);
  const navigatorRef = useRef(createSDKNavigator());

  // Create module system instances (stable across renders)
  const sdkContext = useMemo<SDKContextValue>(() => {
    const cache = new ModuleCache();
    const assetResolver = new AssetResolver(config.apiBaseUrl, cache);
    const loader = new ModuleLoader(config.moduleRegistryUrl ?? config.apiBaseUrl, cache, undefined, undefined, undefined, assetResolver);
    const registry = new ModuleRegistry();
    const expressionEngine = new ExpressionEngine();
    const styleResolver = new StyleResolver();
    const componentRegistry = buildComponentRegistry();
    const interpreter = new SchemaInterpreter(componentRegistry, expressionEngine, styleResolver);

    return {
      moduleLoader: loader,
      moduleRegistry: registry,
      schemaInterpreter: interpreter,
      expressionEngine,
      assetResolver,
    };
  }, [config.apiBaseUrl]);

  // Boot the kernel on mount
  useEffect(() => {
    const kernel = new RuntimeKernel();
    kernelRef.current = kernel;
    configRef.current = config;

    // Listen for state changes
    const emitter = kernel.getEmitter();
    const handleStateChange = (data: { from: string; to: string }) => {
      setKernelState(data.to as KernelState);
      setKernelStatus(kernel.getStatus());
    };
    emitter.on('kernel_state_change', handleStateChange);

    // Boot
    providerLogger.info('SDKProvider mounting, booting kernel', {
      tenantId: config.tenantId,
      apiBaseUrl: config.apiBaseUrl,
      zoneCount: Object.keys(config.zones).length,
    });

    kernel
      .boot(config)
      .then(() => {
        providerLogger.info('Kernel boot successful');
        setKernelState(kernel.getState());
        setKernelStatus(kernel.getStatus());

        // Create SubscriptionProvider only when an explicit tierApiPath is configured
        // (server-side tier validation). Without it, ActionZone uses client-side
        // requiredTiers filtering from the module manifest — no server call needed.
        if (config.subscription?.tierApiPath && kernel.getAPIProxy()) {
          const provider = new SubscriptionProvider(
            kernel.getAPIProxy()!,
            kernel.getDataBus(),
            config.subscription.tierApiPath,
            config.subscription.responseMapping,
          );
          setSubscriptionProvider(provider);
          providerLogger.info('SubscriptionProvider created', {
            tier: config.subscription.tier,
            orgId: config.orgId,
          });
        }

        // Register LOCALE_CHANGE intent handler so host can push locale changes at runtime
        try {
          const intentBridge = kernel.getIntentBridge();
          intentBridge.registerHandler('LOCALE_CHANGE', (payload: unknown) => {
            const p = payload as { locale?: string } | undefined;
            if (p?.locale) {
              providerLogger.info('Locale changed via intent', { locale: p.locale });
              i18n.setLocale(p.locale);
            }
          });
        } catch {
          // IntentBridge may not be available in all configurations
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        providerLogger.error('Kernel boot failed', { error: message });
        setBootError(message);
        setKernelState('ERROR');
      });

    // Cleanup on unmount
    return () => {
      emitter.off('kernel_state_change', handleStateChange);
      kernel.shutdown().catch((err: unknown) => {
        providerLogger.error('Kernel shutdown error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      kernelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.authToken, config.tenantId, config.userId, config.apiBaseUrl]);

  // Sync host locale prop → i18n singleton (reactive)
  useEffect(() => {
    if (config.locale) {
      i18n.setLocale(config.locale);
    }
  }, [config.locale]);

  // Render loading state during boot
  if (kernelState !== 'ACTIVE' && kernelState !== 'ERROR') {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
      React.createElement(SDKActivityIndicator, { size: 'large' }),
      React.createElement(
        SDKText,
        { style: { marginTop: 12, fontSize: 14, color: '#6B7280' } },
        'Initializing SDK...',
      ),
    );
  }

  // Render error state
  if (kernelState === 'ERROR' || bootError) {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 } },
      React.createElement(
        SDKText,
        { style: { fontSize: 16, color: '#DC2626', fontWeight: 'bold' } },
        'SDK Initialization Error',
      ),
      React.createElement(
        SDKText,
        { style: { marginTop: 8, fontSize: 14, color: '#6B7280', textAlign: 'center' } },
        bootError ?? 'Unknown error occurred',
      ),
    );
  }

  const kernel = kernelRef.current;
  if (!kernel) {
    return React.createElement(React.Fragment);
  }

  return React.createElement(
    ErrorBoundary,
    {
      fallback: React.createElement(
        SDKView,
        { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
        React.createElement(
          SDKText,
          { style: { color: '#DC2626' } },
          'SDK encountered an error',
        ),
      ),
    },
    React.createElement(
      KernelProvider,
      {
        kernel,
        state: kernelState,
        config: configRef.current,
        status: kernelStatus,
        dataBus: kernel.getDataBus(),
        intentBridge: kernel.getIntentBridge(),
        policyEngine: kernel.getPolicyEngine(),
        moduleRegistry: kernel.getModuleRegistry(),
        navigator: navigatorRef.current,
        designTokens: configRef.current.designTokens ?? DEFAULT_DESIGN_TOKENS,
        apiProxy: kernel.getAPIProxy(),
        syncEngine: kernel.getSyncEngine(),
        userRoles: kernel.getUserRoles(),
        subscriptionProvider,
      },
      React.createElement(
        I18nProvider,
        null,
        React.createElement(
          SDKContext.Provider,
          { value: sdkContext },
          React.createElement(SDKNavigationContainer, null, children),
        ),
      ),
    ),
  );
}
