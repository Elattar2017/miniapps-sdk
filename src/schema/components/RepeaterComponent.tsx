/**
 * RepeaterComponent - Renders pre-cloned template children from SchemaInterpreter
 * @module schema/components/RepeaterComponent
 *
 * The SchemaInterpreter handles the template cloning: it resolves the dataSource,
 * iterates the array, and interprets the template per item with $item/$index
 * injected. This component just renders the resulting children or an empty message.
 */

import React from 'react';
import { SDKView, SDKText } from '../../adapters';
import { i18n } from '../../i18n';
import type { SchemaComponentProps } from '../../types';

export const RepeaterComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  // emptyMessage is pre-resolved by SchemaInterpreter
  const emptyMessage = node.emptyMessage ?? (node.props?.emptyMessage as string | undefined) ?? i18n.t('repeater.empty');

  const containerStyle: Record<string, unknown> = {
    ...(node.style ?? {}),
  };

  // children are pre-built by SchemaInterpreter's interpretRepeater
  const hasChildren = React.Children.count(children) > 0;

  if (!hasChildren) {
    return React.createElement(
      SDKView,
      { style: { ...containerStyle, alignItems: 'center', padding: 16 } },
      React.createElement(
        SDKText,
        {
          style: { color: '#9CA3AF', fontSize: 14 },
          accessibilityRole: 'text' as const,
        },
        emptyMessage,
      ),
    );
  }

  return React.createElement(
    SDKView,
    {
      style: containerStyle,
      accessibilityRole: 'list' as const,
    },
    children,
  );
};

RepeaterComponent.displayName = 'RepeaterComponent';
