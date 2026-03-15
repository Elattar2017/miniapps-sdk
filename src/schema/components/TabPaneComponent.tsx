/**
 * TabPaneComponent - Individual tab content panel
 * @module schema/components/TabPaneComponent
 *
 * Child of bottom_tab_navigator or top_tab_navigator.
 * Simple passthrough container that wraps children in a flex view.
 * The parent navigator handles showing/hiding based on active tab index.
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const TabPaneComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  return React.createElement(
    SDKView,
    { style: { flex: 1, ...(node.style ?? {}) } },
    children,
  );
};

TabPaneComponent.displayName = 'TabPaneComponent';
