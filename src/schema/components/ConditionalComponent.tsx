/**
 * ConditionalComponent - Conditionally renders children based on an expression
 * @module schema/components/ConditionalComponent
 *
 * The visibility check is handled by the SchemaInterpreter which evaluates
 * node.visible before creating the element. If SchemaInterpreter already
 * filtered this node out, this component will never mount.
 * This component simply renders its children when visible.
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const ConditionalComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  // node.visible is pre-resolved by SchemaInterpreter.
  // If we reached here, the node is visible (interpreter already filtered hidden ones).
  // Double-check for explicit false after resolution.
  const raw = node.visible;
  if (raw === 'false') {
    return null;
  }

  // Render children without any wrapping if no style is needed
  if (!node.style || Object.keys(node.style).length === 0) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(
    SDKView,
    { style: node.style ?? {} },
    children,
  );
};

ConditionalComponent.displayName = 'ConditionalComponent';
