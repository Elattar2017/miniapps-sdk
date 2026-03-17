/**
 * StepComponent - Individual step content panel
 * @module schema/components/StepComponent
 *
 * Child of stepper. Simple passthrough container that wraps children in a flex view.
 * The parent stepper handles showing/hiding based on active step index.
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const StepComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  return React.createElement(
    SDKView,
    { style: { flex: 1, ...(node.style ?? {}) } },
    children,
  );
};

StepComponent.displayName = 'StepComponent';
