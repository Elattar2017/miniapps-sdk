/**
 * ActionZone - Renders a scrollable grid of module tiles
 * @module components/ActionZone
 *
 * Displays available modules as interactive tiles (icon + label).
 * Tapping a tile triggers the host callback to open the module
 * in a fill zone. Supports horizontal scroll, grid, and list layouts.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { useSDK } from './SDKProvider';
import { useKernel } from '../kernel/KernelContext';
import { ModuleTile } from './ModuleTile';
import { SDKView, SDKText, SDKScrollView, SDKActivityIndicator } from '../adapters';
import { i18n, useTranslation } from '../i18n';
import type { ZoneConfig, ModuleSummary } from '../types';

const actionLogger = logger.child({ component: 'ActionZone' });

export interface ActionZoneProps {
  zoneId: string;
  zoneConfig: ZoneConfig;
  onModuleOpen: (moduleId: string, entryScreen: string) => void;
}

export function ActionZone({
  zoneId,
  zoneConfig,
  onModuleOpen,
}: ActionZoneProps): React.JSX.Element {
  const { moduleLoader, moduleRegistry } = useSDK();
  const { config, policyEngine, userRoles, subscriptionProvider } = useKernel();
  const { isRTL } = useTranslation();

  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available modules
  useEffect(() => {
    let cancelled = false;

    async function fetchModules() {
      try {
        actionLogger.info('Fetching module list for ActionZone', { zoneId });
        const list = await moduleLoader.loadModuleList();

        if (cancelled) return;

        // Apply module filter from zone config
        let filtered = list;
        const filter = zoneConfig.moduleFilter;

        if (filter) {
          if (filter.categories && filter.categories.length > 0) {
            filtered = filtered.filter((m) => filter.categories!.includes(m.category));
          }
          if (filter.moduleIds && filter.moduleIds.length > 0) {
            filtered = filtered.filter((m) => filter.moduleIds!.includes(m.id));
          }
          if (filter.excludeModuleIds && filter.excludeModuleIds.length > 0) {
            filtered = filtered.filter((m) => !filter.excludeModuleIds!.includes(m.id));
          }
          if (filter.maxModules) {
            filtered = filtered.slice(0, filter.maxModules);
          }
        }

        // Policy-based filtering
        const policyChecked: ModuleSummary[] = [];
        for (const mod of filtered) {
          try {
            const decision = await policyEngine.evaluate({
              userId: config.userId,
              tenantId: config.tenantId,
              roles: userRoles,
              resource: `module:${mod.id}`,
              action: 'view',
              moduleId: mod.id,
            });
            if (decision.allowed) {
              policyChecked.push(mod);
            }
          } catch {
            // On policy error, include module (fail-open for view)
            policyChecked.push(mod);
          }
        }

        if (cancelled) return;

        // Subscription tier filtering
        let tierFiltered = policyChecked;
        if (config.subscription?.tier && subscriptionProvider) {
          const accessChecks = await Promise.all(
            policyChecked.map(async (mod) => {
              const allowed = await subscriptionProvider.getModuleAccess(config.subscription!.tier, mod.id);
              return { mod, allowed };
            }),
          );
          tierFiltered = accessChecks.filter(({ allowed }) => allowed).map(({ mod }) => mod);
        }

        // Client-side requiredTiers filter (manifest-declared tier requirements)
        if (config.subscription?.tier) {
          tierFiltered = tierFiltered.filter((mod) => {
            if (!mod.requiredTiers || mod.requiredTiers.length === 0) return true;
            return mod.requiredTiers.includes(config.subscription!.tier);
          });
        }

        if (cancelled) return;

        setModules(tierFiltered);
        setLoading(false);

        actionLogger.info('Module list loaded for ActionZone', {
          zoneId,
          total: list.length,
          filtered: tierFiltered.length,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        actionLogger.error('Failed to fetch module list', { zoneId, error: message });
        setError(message);
        setLoading(false);
      }
    }

    fetchModules();
    return () => {
      cancelled = true;
    };
  }, [zoneId, zoneConfig.moduleFilter, moduleLoader, policyEngine, config, userRoles, subscriptionProvider]);

  const handleTilePress = useCallback(
    async (moduleId: string) => {
      // Policy check before opening
      try {
        const decision = await policyEngine.evaluate({
          userId: config.userId,
          tenantId: config.tenantId,
          roles: userRoles,
          resource: `module:${moduleId}`,
          action: 'open',
          moduleId,
        });
        if (!decision.allowed) {
          actionLogger.warn('Module open blocked by policy', { moduleId, reason: decision.reason });
          return;
        }
      } catch (err) {
        actionLogger.warn('Policy check failed, allowing open', { moduleId, error: String(err) });
      }

      actionLogger.info('Module tile pressed', { zoneId, moduleId });

      try {
        // Load the manifest to get entryScreen
        const manifest = await moduleLoader.loadManifest(moduleId);

        // Register the module if not already registered
        if (!moduleRegistry.get(moduleId)) {
          moduleRegistry.register(manifest);
        }
        moduleRegistry.setModuleState(moduleId, 'active');

        onModuleOpen(moduleId, manifest.entryScreen);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        // eslint-disable-next-line no-console
        console.error('[ActionZone] Failed to open module:', moduleId, message, stack);
        actionLogger.error('Failed to open module', { moduleId, error: message });
      }
    },
    [zoneId, moduleLoader, moduleRegistry, onModuleOpen, policyEngine, config, userRoles],
  );

  // Loading state
  if (loading) {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
      React.createElement(SDKActivityIndicator, { size: 'small' }),
    );
  }

  // Error state
  if (error) {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 } },
      React.createElement(
        SDKText,
        { style: { fontSize: 12, color: '#DC2626' } },
        i18n.t('module.error.loadFailed'),
      ),
    );
  }

  // Empty state
  if (modules.length === 0) {
    return React.createElement(
      SDKView,
      { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
      React.createElement(
        SDKText,
        { style: { fontSize: 14, color: '#9CA3AF' } },
        zoneConfig.emptyMessage ?? 'No modules available',
      ),
    );
  }

  // Build tiles
  const tiles = modules.map((mod) =>
    React.createElement(ModuleTile, {
      key: mod.id,
      module: mod,
      onPress: () => handleTilePress(mod.id),
    }),
  );

  const layout = zoneConfig.layout ?? 'horizontal-scroll';

  // Horizontal scroll layout
  if (layout === 'horizontal-scroll') {
    return React.createElement(
      SDKScrollView,
      {
        horizontal: true,
        showsHorizontalScrollIndicator: false,
        style: { flex: 1 },
        contentContainerStyle: {
          paddingHorizontal: 12,
          alignItems: 'center',
          gap: 12,
        },
      },
      ...tiles,
    );
  }

  // Grid layout
  if (layout === 'grid') {
    const columns = zoneConfig.columns ?? 4;
    return React.createElement(
      SDKView,
      {
        style: {
          flex: 1,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          padding: 12,
          gap: 12,
        },
      },
      ...tiles.map((tile, i) =>
        React.createElement(
          SDKView,
          {
            key: `wrapper-${i}`,
            style: {
              width: `${Math.floor(100 / columns) - 2}%` as unknown as number,
            },
          },
          tile,
        ),
      ),
    );
  }

  // List layout
  return React.createElement(
    SDKScrollView,
    { style: { flex: 1 }, contentContainerStyle: { padding: 12, gap: 8 } },
    ...tiles,
  );
}
