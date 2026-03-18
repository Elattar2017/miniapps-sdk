/**
 * TimeSlotComponent - Template container for custom time slot chip content inside calendar
 * @module schema/components/TimeSlotComponent
 *
 * Child of calendar. Simple passthrough container that wraps children in a column layout.
 * The parent calendar handles chip styling, selection, disabled state, and grid layout.
 * This component only provides the inner content template.
 */

import React from 'react';
import { SDKView } from '../../adapters';
import type { SchemaComponentProps } from '../../types';

export const TimeSlotComponent: React.FC<SchemaComponentProps> = ({ node, children }) => {
  return React.createElement(
    SDKView,
    { style: { flexDirection: 'column' as const, alignItems: 'center' as const, ...(node.style ?? {}) } },
    children,
  );
};

TimeSlotComponent.displayName = 'TimeSlotComponent';
