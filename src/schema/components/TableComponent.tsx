/**
 * TableComponent - Data table with column headers and scrollable rows
 * @module schema/components/TableComponent
 */

import React, { useCallback, useState, useMemo } from 'react';
import { SDKView, SDKText, SDKScrollView, SDKTouchableOpacity } from '../../adapters';
import { i18n } from '../../i18n';
import type { SchemaComponentProps, TableColumn, ActionConfig } from '../../types';

/** Resolve $t('key') translation patterns in a label string */
function resolveLabel(text: string, moduleId?: string): string {
  const m = text.match(/^\$t\(['"](.+)['"]\)$/);
  if (!m) return text;
  const key = m[1];
  // Try module-namespaced key first (module strings are loaded as moduleId:key)
  if (moduleId) {
    const result = i18n.t(`${moduleId}:${key}`);
    if (result !== `${moduleId}:${key}`) return result;
  }
  return i18n.t(key);
}

export const TableComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const columns = (Array.isArray(node.columns) ? node.columns : []) as import('../../types').TableColumn[];
  const rawData = Array.isArray(node.data) ? node.data : [];
  const maxRows = node.maxRows;
  const data = maxRows != null ? rawData.slice(0, maxRows) : rawData;

  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleHeaderPress = useCallback((columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;
    const sorted = [...data].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
    return sorted;
  }, [data, sortColumn, sortDirection]);

  const isRTL = context.isRTL === true;
  const rowDirection = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const surfaceColor = context.designTokens.colors.surface ?? '#F9FAFB';
  const borderColor = context.designTokens.colors.border ?? '#E5E7EB';
  const textColor = context.designTokens.colors.text ?? '#111827';

  const handleRowPress = useCallback(
    (rowIndex: number, rowData: Record<string, unknown>) => {
      context.onAction({
        action: 'update_state',
        payload: { rowIndex, rowData },
      });
    },
    [context],
  );

  const handleCellAction = useCallback(
    (col: TableColumn, rowIndex: number, rowData: Record<string, unknown>) => {
      if (!col.onPress) return;
      // Normalize: screen builder may save 'type' instead of 'action'
      const press = col.onPress as ActionConfig & { type?: string; payload?: Record<string, unknown> };
      const action = press.action ?? press.type;
      if (!action) return;
      context.onAction({
        ...press,
        action: action as ActionConfig['action'],
        payload: { ...press.payload, rowIndex, rowData },
      });
    },
    [context],
  );

  // Header row
  const headerCells = columns.map((col, colIndex) => {
    // Accept both 'label' and 'header' (screen builder may use either)
    const colLabel = resolveLabel(col.label ?? col.header ?? col.key, context.moduleId);
    const sortIndicator = sortColumn === col.key ? (sortDirection === 'asc' ? ' \u2191' : ' \u2193') : '';
    return React.createElement(
      SDKTouchableOpacity,
      {
        key: `header-${col.key}-${colIndex}`,
        onPress: () => handleHeaderPress(col.key),
        activeOpacity: 0.7,
        style: {
          flex: col.width ?? 1,
          paddingVertical: 8,
          paddingHorizontal: 12,
        },
        accessibilityRole: 'button' as const,
        accessibilityLabel: `Sort by ${colLabel}`,
        accessibilityState: { selected: sortColumn === col.key },
      },
      React.createElement(
        SDKText,
        {
          style: {
            fontWeight: '700',
            fontSize: 14,
            color: textColor,
            textAlign,
          },
          accessibilityRole: 'text' as const,
        },
        colLabel + sortIndicator,
      ),
    );
  });

  const headerRow = React.createElement(
    SDKView,
    {
      key: 'header-row',
      style: {
        flexDirection: rowDirection,
        backgroundColor: surfaceColor,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
      },
      accessibilityRole: 'header' as const,
    },
    ...headerCells,
  );

  const primaryColor = context.designTokens.colors.primary ?? '#2563EB';

  // Data rows
  const dataRows = sortedData.map((rowData, rowIndex) => {
    const cells = columns.map((col, colIndex) => {
      const cellStyle = {
        flex: col.width ?? 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
      };
      const colType = col.type ?? 'text';

      // Button cell
      if (colType === 'button' && col.onPress) {
        return React.createElement(
          SDKView,
          { key: `cell-${rowIndex}-${col.key}-${colIndex}`, style: cellStyle },
          React.createElement(
            SDKTouchableOpacity,
            {
              onPress: () => handleCellAction(col, rowIndex, rowData),
              activeOpacity: 0.7,
              style: {
                backgroundColor: primaryColor,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 4,
                alignSelf: 'flex-start',
              },
              accessibilityRole: 'button' as const,
              accessibilityLabel: resolveLabel(col.buttonLabel ?? col.label ?? col.header ?? col.key, context.moduleId),
            },
            React.createElement(SDKText, {
              style: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
            }, resolveLabel(col.buttonLabel ?? col.label ?? col.header ?? col.key, context.moduleId)),
          ),
        );
      }

      // Icon cell
      if (colType === 'icon' && col.onPress) {
        return React.createElement(
          SDKView,
          { key: `cell-${rowIndex}-${col.key}-${colIndex}`, style: { ...cellStyle, alignItems: 'center' } },
          React.createElement(
            SDKTouchableOpacity,
            {
              onPress: () => handleCellAction(col, rowIndex, rowData),
              activeOpacity: 0.7,
              accessibilityRole: 'button' as const,
              accessibilityLabel: resolveLabel(col.iconName ?? col.label ?? col.header ?? col.key),
            },
            React.createElement(SDKText, {
              style: { fontSize: 18, color: col.iconColor ?? textColor },
            }, col.iconName ?? '\u2022'),
          ),
        );
      }

      // Text cell (default)
      return React.createElement(
        SDKView,
        { key: `cell-${rowIndex}-${col.key}-${colIndex}`, style: cellStyle },
        React.createElement(
          SDKText,
          {
            style: { fontSize: 14, color: textColor, textAlign },
            accessibilityRole: 'text' as const,
          },
          rowData[col.key] != null ? String(rowData[col.key]) : '',
        ),
      );
    });

    return React.createElement(
      SDKTouchableOpacity,
      {
        key: `row-${rowIndex}`,
        onPress: () => handleRowPress(rowIndex, rowData),
        activeOpacity: 0.7,
        style: {
          flexDirection: rowDirection,
          backgroundColor: rowIndex % 2 === 0 ? '#FFFFFF' : surfaceColor,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        },
        accessibilityRole: 'button' as const,
        accessibilityLabel: `Row ${rowIndex + 1}`,
      },
      ...cells,
    );
  });

  const containerStyle: Record<string, unknown> = {
    borderWidth: 1,
    borderColor,
    borderRadius: context.designTokens.borderRadius.default,
    overflow: 'hidden',
    ...(node.style ?? {}),
  };

  return React.createElement(
    SDKView,
    {
      style: containerStyle,
      accessibilityRole: 'summary' as const,
      accessibilityLabel: node.accessibilityLabel ?? 'Data table',
    },
    headerRow,
    React.createElement(
      SDKScrollView,
      { key: 'table-scroll' },
      ...dataRows,
    ),
  );
};

TableComponent.displayName = 'TableComponent';
