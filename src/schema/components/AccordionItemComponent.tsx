/**
 * AccordionItemComponent - Collapsible section with header and expandable content
 * @module schema/components/AccordionItemComponent
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import { iconRegistry } from '../icons';
import type { SchemaComponentProps } from '../../types';

export const AccordionItemComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const title = node.title ?? node.label ?? (node.props?.title as string | undefined) ?? '';
  const subtitle = node.subtitle ?? (node.props?.subtitle as string | undefined);
  const icon = node.icon ?? (node.props?.icon as string | undefined);
  const iconPosition = (node.iconPosition ?? (node.props?.iconPosition as string | undefined)) ?? 'left';
  const defaultExpanded = node.defaultExpanded ?? (node.props?.defaultExpanded as boolean | undefined) ?? false;
  const disabled = node.disabled ?? (node.props?.disabled as string | undefined);
  const groupId = node.groupId ?? (node.props?.groupId as string | undefined);
  const nodeId = node.id ?? `accordion_item_${title}`;

  // State key: groupId for radio mode, or auto-generated for independent toggle
  const stateKey = groupId ?? `_accordion_${nodeId}`;

  const isExpanded = useMemo(() => {
    if (!context) return defaultExpanded;
    if (groupId) {
      const val = context.state[stateKey];
      if (val === undefined) return false;
      return String(val) === title;
    }
    const val = context.state[stateKey];
    if (val === undefined) return false;
    return String(val) === 'true';
  }, [context, stateKey, groupId, title, defaultExpanded]);

  // Initialize defaultExpanded on first render
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !context) return;
    initialized.current = true;
    if (defaultExpanded && context.state[stateKey] === undefined) {
      if (groupId) {
        context.onStateChange(stateKey, title);
      } else {
        context.onStateChange(stateKey, 'true');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDisabled = useMemo(() => {
    if (disabled === undefined || disabled === 'false') return false;
    if (disabled === 'true') return true;
    return !!disabled;
  }, [disabled]);

  const handleToggle = useCallback(() => {
    if (isDisabled || !context) return;

    if (groupId) {
      context.onStateChange(stateKey, isExpanded ? '' : title);
    } else {
      context.onStateChange(stateKey, isExpanded ? 'false' : 'true');
    }

    if (node.onToggle) {
      context.onAction(node.onToggle);
    }
  }, [isDisabled, context, groupId, isExpanded, title, stateKey, node.onToggle]);

  const headerStyle: Record<string, unknown> = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    opacity: isDisabled ? 0.5 : 1,
  };

  const contentStyle: Record<string, unknown> = {
    paddingHorizontal: 16,
    paddingBottom: 12,
  };

  const dividerStyle: Record<string, unknown> = {
    height: 1,
    backgroundColor: '#E5E7EB',
  };

  // Build header children
  const iconColor = '#6B7280';
  const iconElement = icon ? iconRegistry.resolve(icon, 20, iconColor) ?? null : null;

  const chevronStyle: Record<string, unknown> = {
    transform: [{ rotate: isExpanded ? '180deg' : '0deg' }],
  };

  const titleElements: React.ReactElement[] = [
    React.createElement(SDKText, {
      key: 'title',
      style: { fontSize: 16, fontWeight: '600', color: '#111827' },
    }, title),
  ];

  if (subtitle) {
    titleElements.push(
      React.createElement(SDKText, {
        key: 'subtitle',
        style: { fontSize: 13, color: '#6B7280', marginTop: 2 },
      }, subtitle),
    );
  }

  const leftGroup: React.ReactElement[] = [];
  if (iconElement && iconPosition === 'left') {
    leftGroup.push(
      React.createElement(SDKView, { key: 'icon', style: { marginRight: 12 } }, iconElement),
    );
  }
  leftGroup.push(
    React.createElement(SDKView, { key: 'titles', style: { flex: 1, flexDirection: 'column' } }, ...titleElements),
  );
  if (iconElement && iconPosition === 'right') {
    leftGroup.push(
      React.createElement(SDKView, { key: 'icon-r', style: { marginLeft: 8, marginRight: 8 } }, iconElement),
    );
  }

  const headerChildren: React.ReactElement[] = [
    React.createElement(SDKView, { key: 'left', style: { flex: 1, flexDirection: 'row', alignItems: 'center' } }, ...leftGroup),
    React.createElement(
      SDKView,
      { key: 'chevron', style: chevronStyle },
      React.createElement(SDKText, { style: { fontSize: 12, color: '#9CA3AF' } }, '\u25BC'),
    ),
  ];

  return React.createElement(
    SDKView,
    {
      style: node.style ?? {},
      accessibilityRole: 'none' as const,
    },
    React.createElement(
      SDKTouchableOpacity,
      {
        onPress: handleToggle,
        disabled: isDisabled,
        activeOpacity: 0.7,
        accessibilityRole: 'button' as const,
        accessibilityLabel: `Toggle ${title}`,
        accessibilityState: { expanded: isExpanded },
        style: headerStyle,
      },
      ...headerChildren,
    ),
    React.createElement(SDKView, { style: dividerStyle }),
    isExpanded
      ? React.createElement(SDKView, { style: contentStyle }, children)
      : null,
  );
};

AccordionItemComponent.displayName = 'AccordionItemComponent';
