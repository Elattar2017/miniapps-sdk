/**
 * TabNavigatorComponent - Tab bar with switchable content panes
 * @module schema/components/TabNavigatorComponent
 *
 * Handles both bottom_tab_navigator (tab bar at bottom) and
 * top_tab_navigator (tab bar at top). Checks node.type for layout.
 *
 * State managed via context.onStateChange, same pattern as AccordionItemComponent.
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity, SDKScrollView } from '../../adapters';
import { iconRegistry } from '../icons';
import type { SchemaComponentProps, SchemaNode } from '../../types';

export const TabNavigatorComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const isBottom = node.type === 'bottom_tab_navigator';
  const variant = (node.variant ?? (node.props?.variant as string | undefined)) ?? 'default';
  const scrollable = node.scrollable ?? (node.props?.scrollable as boolean | undefined) ?? false;
  const nodeId = node.id ?? 'tab_nav';
  const stateKey = `__tabs_${nodeId}`;

  // Read tab pane metadata from schema node children
  const tabPanes: SchemaNode[] = useMemo(() => {
    if (!node.children) return [];
    return (node.children as SchemaNode[]).filter(
      (child) => child.type === 'tab_pane',
    );
  }, [node.children]);

  // Determine active tab index
  const activeTabIndex = useMemo(() => {
    if (!context) return 0;
    const stateVal = context.state[stateKey];
    if (stateVal !== undefined) return Number(stateVal);
    // Fall back to activeTab prop
    const propVal = node.activeTab ?? (node.props?.activeTab as number | undefined);
    if (propVal !== undefined) return Number(propVal);
    return 0;
  }, [context, stateKey, node.activeTab, node.props?.activeTab]);

  // Clamp to valid range
  const safeIndex = useMemo(() => {
    if (tabPanes.length === 0) return 0;
    if (activeTabIndex < 0 || activeTabIndex >= tabPanes.length) return 0;
    return activeTabIndex;
  }, [activeTabIndex, tabPanes.length]);

  // Initialize default active tab on first render
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !context) return;
    initialized.current = true;
    if (context.state[stateKey] === undefined) {
      const initial = node.activeTab ?? (node.props?.activeTab as number | undefined) ?? 0;
      context.onStateChange(stateKey, Number(initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTabPress = useCallback((index: number) => {
    if (!context || index === safeIndex) return;
    context.onStateChange(stateKey, index);
    if (node.onTabChange) {
      const pane = tabPanes[index];
      context.onAction({
        ...node.onTabChange,
        tabIndex: index,
        tabLabel: pane?.label ?? '',
      } as Parameters<typeof context.onAction>[0]);
    }
  }, [context, stateKey, safeIndex, node.onTabChange, tabPanes]);

  const primaryColor = context?.designTokens?.colors?.primary ?? '#3B82F6';

  // ── Tab bar ──

  const tabButtons = tabPanes.map((pane, idx) => {
    const isActive = idx === safeIndex;
    const label = pane.label ?? (pane.props?.label as string | undefined) ?? `Tab ${idx + 1}`;
    const iconName = pane.icon ?? (pane.props?.icon as string | undefined);
    const badge = pane.badge ?? (pane.props?.badge as string | number | undefined);

    const tabColor = isActive ? primaryColor : '#9CA3AF';

    // Icon element
    const iconEl = iconName
      ? iconRegistry.resolve(iconName, isBottom ? 22 : 16, tabColor) ?? null
      : null;

    // Badge element
    const badgeEl = badge !== undefined && badge !== '' && badge !== null
      ? React.createElement(
          SDKView,
          {
            key: 'badge',
            style: {
              position: 'absolute' as const,
              top: -4,
              right: -8,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: '#EF4444',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            },
          },
          React.createElement(SDKText, {
            style: { fontSize: 9, fontWeight: '700', color: '#FFFFFF' },
          }, String(badge)),
        )
      : null;

    // Label element
    const labelEl = React.createElement(SDKText, {
      key: 'label',
      numberOfLines: 1,
      style: {
        fontSize: isBottom ? 10 : 13,
        fontWeight: isActive ? '600' : '400',
        color: tabColor,
        ...(isBottom ? { marginTop: iconEl ? 2 : 0 } : {}),
        ...(!isBottom && iconEl ? { marginLeft: 6 } : {}),
      },
    }, label);

    // Tab button style varies by variant
    const buttonStyle: Record<string, unknown> = {
      flex: scrollable ? undefined : 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: isBottom ? 8 : 10,
      paddingHorizontal: scrollable ? 16 : 8,
      ...(isBottom
        ? { flexDirection: 'column' as const }
        : { flexDirection: 'row' as const }
      ),
    };

    if (variant === 'pills' && isActive) {
      buttonStyle.backgroundColor = `${primaryColor}15`;
      buttonStyle.borderRadius = 20;
      buttonStyle.marginHorizontal = 4;
    }
    if (variant === 'underline' && isActive) {
      if (isBottom) {
        buttonStyle.borderTopWidth = 2;
        buttonStyle.borderTopColor = primaryColor;
      } else {
        buttonStyle.borderBottomWidth = 2;
        buttonStyle.borderBottomColor = primaryColor;
      }
    }
    if (variant === 'default' && isActive) {
      if (isBottom) {
        buttonStyle.borderTopWidth = 2;
        buttonStyle.borderTopColor = primaryColor;
      } else {
        buttonStyle.borderBottomWidth = 2;
        buttonStyle.borderBottomColor = primaryColor;
      }
    }

    // Build children array based on layout
    const tabChildren: React.ReactElement[] = [];
    if (iconEl) {
      tabChildren.push(
        React.createElement(SDKView, { key: 'icon-wrap', style: { position: 'relative' as const } },
          iconEl,
          badgeEl,
        ),
      );
    } else if (badgeEl) {
      tabChildren.push(
        React.createElement(SDKView, { key: 'badge-wrap', style: { position: 'relative' as const } },
          badgeEl,
        ),
      );
    }
    tabChildren.push(labelEl);

    return React.createElement(
      SDKTouchableOpacity,
      {
        key: `tab-${idx}`,
        onPress: () => handleTabPress(idx),
        activeOpacity: 0.7,
        accessibilityRole: 'tab' as const,
        accessibilityLabel: label,
        accessibilityState: { selected: isActive },
        style: buttonStyle,
      },
      ...tabChildren,
    );
  });

  // Tab bar container
  const tabBarStyle: Record<string, unknown> = {
    flexDirection: 'row' as const,
    backgroundColor: '#FFFFFF',
    ...(isBottom
      ? { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingBottom: 4 }
      : { borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }
    ),
  };

  const tabBar = scrollable
    ? React.createElement(
        SDKScrollView,
        { horizontal: true, showsHorizontalScrollIndicator: false, style: tabBarStyle },
        ...tabButtons,
      )
    : React.createElement(SDKView, { style: tabBarStyle }, ...tabButtons);

  // ── Content area ──

  const childrenArray = React.Children.toArray(children);
  const activeContent = safeIndex < childrenArray.length
    ? childrenArray[safeIndex]
    : null;

  const contentArea = React.createElement(
    SDKView,
    { style: { flex: 1 } },
    activeContent,
  );

  // ── Layout: bottom vs top ──

  return React.createElement(
    SDKView,
    {
      style: { flex: 1, ...(node.style ?? {}) },
      accessibilityRole: 'tablist' as const,
    },
    ...(isBottom ? [contentArea, tabBar] : [tabBar, contentArea]),
  );
};

TabNavigatorComponent.displayName = 'TabNavigatorComponent';
