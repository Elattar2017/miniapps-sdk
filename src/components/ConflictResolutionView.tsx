/**
 * ConflictResolutionView - Manual conflict resolution UI
 * @module components/ConflictResolutionView
 *
 * Renders pending sync conflicts for manual resolution.
 * Shows side-by-side local vs remote values with action buttons.
 * Used for Tier 3 conflict resolution (manual-resolution strategy).
 */

import React from 'react';
import { SDKView, SDKText, SDKScrollView, SDKTouchableOpacity } from '../adapters';
import type { SyncConflict } from '../types';

export interface ConflictResolutionViewProps {
  conflicts: SyncConflict[];
  onResolve: (conflictId: string, resolution: 'local' | 'remote') => void;
  onResolveAll?: (resolution: 'local' | 'remote') => void;
  textColor?: string;
  textSecondaryColor?: string;
  borderColor?: string;
  primaryColor?: string;
}

export function ConflictResolutionView({
  conflicts,
  onResolve,
  onResolveAll,
  textColor = '#111827',
  textSecondaryColor = '#6B7280',
  borderColor = '#E5E7EB',
  primaryColor = '#3B82F6',
}: ConflictResolutionViewProps): React.ReactElement {
  // Empty state
  if (conflicts.length === 0) {
    return React.createElement(
      SDKView,
      { style: { padding: 24, alignItems: 'center' }, accessibilityRole: 'summary' },
      React.createElement(
        SDKText,
        { style: { fontSize: 14, color: textSecondaryColor } },
        'No conflicts to resolve',
      ),
    );
  }

  // Header with count and "Resolve All" buttons
  const header = React.createElement(
    SDKView,
    {
      key: 'header',
      style: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      },
    },
    React.createElement(
      SDKText,
      { style: { fontSize: 16, fontWeight: '600', color: textColor } },
      `${conflicts.length} Conflict${conflicts.length !== 1 ? 's' : ''}`,
    ),
    onResolveAll
      ? React.createElement(
          SDKView,
          { style: { flexDirection: 'row' } },
          React.createElement(
            SDKTouchableOpacity,
            {
              onPress: () => onResolveAll('local'),
              accessibilityLabel: 'Use all local',
              style: {
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 4,
                backgroundColor: primaryColor,
                marginRight: 8,
              },
            },
            React.createElement(
              SDKText,
              { style: { fontSize: 12, color: '#FFFFFF' } },
              'Use All Local',
            ),
          ),
          React.createElement(
            SDKTouchableOpacity,
            {
              onPress: () => onResolveAll('remote'),
              accessibilityLabel: 'Use all remote',
              style: {
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 4,
                borderWidth: 1,
                borderColor,
              },
            },
            React.createElement(
              SDKText,
              { style: { fontSize: 12, color: textColor } },
              'Use All Remote',
            ),
          ),
        )
      : null,
  );

  // Conflict cards
  const cards = conflicts.map((conflict) => {
    const localData = JSON.stringify(conflict.local.data, null, 2);
    const remoteData = JSON.stringify(conflict.remote.data, null, 2);
    const localTime = new Date(conflict.local.timestamp).toLocaleString();
    const remoteTime = new Date(conflict.remote.timestamp).toLocaleString();

    return React.createElement(
      SDKView,
      {
        key: conflict.id,
        style: {
          borderWidth: 1,
          borderColor,
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
        },
        accessibilityLabel: `Conflict ${conflict.id}`,
      },
      // Field name (if available)
      conflict.field
        ? React.createElement(
            SDKText,
            { style: { fontSize: 12, color: textSecondaryColor, marginBottom: 8 } },
            `Field: ${conflict.field}`,
          )
        : null,
      // Side by side: Local vs Remote
      React.createElement(
        SDKView,
        { style: { flexDirection: 'row' } },
        // Local side
        React.createElement(
          SDKView,
          { style: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 4, padding: 8, marginRight: 4 } },
          React.createElement(
            SDKText,
            { style: { fontSize: 12, fontWeight: '600', color: textColor, marginBottom: 4 } },
            'Local',
          ),
          React.createElement(
            SDKText,
            { style: { fontSize: 11, color: textSecondaryColor, marginBottom: 4 } },
            localTime,
          ),
          React.createElement(
            SDKText,
            { style: { fontSize: 12, color: textColor }, numberOfLines: 5 },
            localData,
          ),
        ),
        // Remote side
        React.createElement(
          SDKView,
          { style: { flex: 1, backgroundColor: '#EFF6FF', borderRadius: 4, padding: 8, marginLeft: 4 } },
          React.createElement(
            SDKText,
            { style: { fontSize: 12, fontWeight: '600', color: textColor, marginBottom: 4 } },
            'Remote',
          ),
          React.createElement(
            SDKText,
            { style: { fontSize: 11, color: textSecondaryColor, marginBottom: 4 } },
            remoteTime,
          ),
          React.createElement(
            SDKText,
            { style: { fontSize: 12, color: textColor }, numberOfLines: 5 },
            remoteData,
          ),
        ),
      ),
      // Action buttons
      React.createElement(
        SDKView,
        { style: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 } },
        React.createElement(
          SDKTouchableOpacity,
          {
            onPress: () => onResolve(conflict.id, 'local'),
            accessibilityLabel: `Use local for ${conflict.id}`,
            style: {
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 4,
              backgroundColor: '#10B981',
              marginRight: 8,
            },
          },
          React.createElement(
            SDKText,
            { style: { fontSize: 12, color: '#FFFFFF' } },
            'Use Local',
          ),
        ),
        React.createElement(
          SDKTouchableOpacity,
          {
            onPress: () => onResolve(conflict.id, 'remote'),
            accessibilityLabel: `Use remote for ${conflict.id}`,
            style: {
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 4,
              backgroundColor: '#3B82F6',
            },
          },
          React.createElement(
            SDKText,
            { style: { fontSize: 12, color: '#FFFFFF' } },
            'Use Remote',
          ),
        ),
      ),
    );
  });

  return React.createElement(
    SDKScrollView,
    { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
    header,
    ...cards,
  );
}

ConflictResolutionView.displayName = 'ConflictResolutionView';
