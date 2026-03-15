/**
 * ZoneRenderer - Renders SDK zones based on zone configuration
 * @module components/ZoneRenderer
 *
 * Reads zone config from the kernel and delegates rendering to
 * the appropriate zone-specific component (ActionZone, ScreenRenderer, etc.).
 *
 * Usage:
 * ```tsx
 * <SDKProvider zones={{ actions: { type: 'actions', ... }, main: { type: 'fill', ... } }}>
 *   <ZoneRenderer zoneId="actions" />
 *   <ZoneRenderer zoneId="main" />
 * </SDKProvider>
 * ```
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dimensions } from 'react-native';
import { logger } from '../utils/logger';
import { useKernel, useSDKServices } from '../kernel/KernelContext';
import { SDKView, SDKText, SDKAnimatedView, SDKAnimatedValue, createFadeAnimation, createSlideAnimation } from '../adapters';
import { ActionZone } from './ActionZone';
import { ScreenRenderer } from './ScreenRenderer';
import type { ZoneConfig } from '../types';
import type { ScreenTransition } from '../types/schema.types';

const zoneLogger = logger.child({ component: 'ZoneRenderer' });

export interface ZoneRendererProps {
  zoneId: string;
}

export function ZoneRenderer({ zoneId }: ZoneRendererProps): React.JSX.Element | null {
  const { config, state: kernelState } = useKernel();
  const { navigator, dataBus } = useSDKServices();

  // navState is kept in state to trigger re-renders on navigation changes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_navState, setNavState] = useState(navigator.getState());

  useEffect(() => {
    const unsubscribe = navigator.addListener((state) => {
      setNavState(state);
    });
    return unsubscribe;
  }, [navigator]);

  const currentRoute = navigator.getCurrentRoute();
  const activeModuleId = currentRoute?.moduleId;
  const activeScreenId = currentRoute?.screenId;

  // Transition animation state
  const opacityAnim = useRef(new SDKAnimatedValue(1)).current;
  const translateXAnim = useRef(new SDKAnimatedValue(0)).current;
  const translateYAnim = useRef(new SDKAnimatedValue(0)).current;
  const prevRouteKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const routeKey = activeModuleId && activeScreenId ? `${activeModuleId}:${activeScreenId}` : undefined;
    if (routeKey && routeKey !== prevRouteKeyRef.current) {
      const transition: ScreenTransition = currentRoute?.transition ?? 'slide';
      const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

      switch (transition) {
        case 'fade':
          opacityAnim.setValue(0);
          translateXAnim.setValue(0);
          translateYAnim.setValue(0);
          createFadeAnimation({ value: opacityAnim, toValue: 1, duration: 250 }).start();
          break;
        case 'slide':
          opacityAnim.setValue(1);
          translateXAnim.setValue(screenWidth);
          translateYAnim.setValue(0);
          createSlideAnimation({ value: translateXAnim, toValue: 0, duration: 250 }).start();
          break;
        case 'modal':
          opacityAnim.setValue(1);
          translateXAnim.setValue(0);
          translateYAnim.setValue(screenHeight);
          createSlideAnimation({ value: translateYAnim, toValue: 0, duration: 300 }).start();
          break;
        case 'none':
        default:
          opacityAnim.setValue(1);
          translateXAnim.setValue(0);
          translateYAnim.setValue(0);
          break;
      }
      prevRouteKeyRef.current = routeKey;
    }
  }, [activeModuleId, activeScreenId, currentRoute, opacityAnim, translateXAnim, translateYAnim]);

  const zoneConfig: ZoneConfig | undefined = config.zones[zoneId];

  if (!zoneConfig) {
    zoneLogger.warn('Zone not found in config', { zoneId });
    return null;
  }

  if (kernelState !== 'ACTIVE') {
    return null;
  }

  const handleModuleOpen = useCallback(
    (moduleId: string, entryScreen: string) => {
      zoneLogger.info('Module opened from zone', { zoneId, moduleId, entryScreen });
      navigator.navigate({ moduleId, screenId: entryScreen });
      dataBus.publish('sdk:module:opened', { moduleId, screenId: entryScreen, zoneId });
      config.onModuleOpen?.(moduleId);
    },
    [zoneId, config, navigator, dataBus],
  );

  const handleModuleClose = useCallback(() => {
    const closingModuleId = activeModuleId;
    if (closingModuleId) {
      zoneLogger.info('Module closed', { zoneId, moduleId: closingModuleId });
      config.onModuleClose?.(closingModuleId);
    }
    navigator.reset();
    dataBus.publish('sdk:module:closed', { moduleId: closingModuleId, zoneId });
  }, [zoneId, activeModuleId, config, navigator, dataBus]);

  const handleNavigate = useCallback(
    (screenId: string) => {
      zoneLogger.info('Navigating to screen', { zoneId, moduleId: activeModuleId, screenId });
      if (activeModuleId) {
        navigator.navigate({ moduleId: activeModuleId, screenId });
      }
    },
    [zoneId, activeModuleId, navigator],
  );

  // Build zone container style
  const containerStyle: Record<string, unknown> = {
    backgroundColor: zoneConfig.backgroundColor,
    padding: zoneConfig.padding,
  };

  if (zoneConfig.height) {
    containerStyle.height = zoneConfig.height;
  }
  if (zoneConfig.width) {
    containerStyle.width = zoneConfig.width;
  }
  if (zoneConfig.flex) {
    containerStyle.flex = zoneConfig.flex;
  }
  if (zoneConfig.type === 'fill' && !zoneConfig.height && !zoneConfig.flex) {
    containerStyle.flex = 1;
  }

  // Render zone content based on type
  let content: React.ReactElement;

  switch (zoneConfig.type) {
    case 'actions':
      content = React.createElement(ActionZone, {
        zoneId,
        zoneConfig,
        onModuleOpen: handleModuleOpen,
      });
      break;

    case 'fill':
    case 'dashboard':
    case 'forms':
    case 'custom':
      if (activeModuleId && activeScreenId) {
        content = React.createElement(
          SDKAnimatedView,
          {
            style: {
              flex: 1,
              opacity: opacityAnim,
              transform: [{ translateX: translateXAnim }, { translateY: translateYAnim }],
            },
          },
          React.createElement(ScreenRenderer, {
            key: `${activeModuleId}:${activeScreenId}`,
            moduleId: activeModuleId,
            screenId: activeScreenId,
            onNavigate: handleNavigate,
            onBack: handleModuleClose,
          }),
        );
      } else if (zoneConfig.emptyMessage) {
        content = React.createElement(
          SDKView,
          { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
          React.createElement(
            SDKText,
            { style: { fontSize: 14, color: '#9CA3AF' } },
            zoneConfig.emptyMessage,
          ),
        );
      } else {
        content = React.createElement(SDKView, { style: { flex: 1 } });
      }
      break;

    default:
      zoneLogger.warn('Unknown zone type', { zoneId, type: zoneConfig.type });
      content = React.createElement(React.Fragment);
  }

  return React.createElement(SDKView, { style: containerStyle }, content);
}
