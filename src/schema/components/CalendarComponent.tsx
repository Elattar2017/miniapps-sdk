/**
 * CalendarComponent - Inline month grid with optional time slots and availability
 * @module schema/components/CalendarComponent
 *
 * Two-way binding: uses rawBindingKey pattern from InputComponent.
 * State: __calendar_month_{nodeId} for viewed month, value binding for selection.
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import { iconRegistry } from '../icons';
import type { SchemaComponentProps } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Pad number to 2 digits */
const pad2 = (n: number): string => (n < 10 ? '0' + n : String(n));

/** Format Date to YYYY-MM-DD */
const toISO = (y: number, m: number, d: number): string =>
  `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** Parse YYYY-MM-DD */
const parseISO = (s: string): { y: number; m: number; d: number } | null => {
  if (!s || s.length < 10) return null;
  const y = parseInt(s.slice(0, 4), 10);
  const m = parseInt(s.slice(5, 7), 10) - 1;
  const d = parseInt(s.slice(8, 10), 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d };
};

/** Month names */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Short day names starting from Sunday */
const DAY_NAMES_BASE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** ISO week number for a date */
const getWeekNumber = (y: number, m: number, d: number): number => {
  const date = new Date(y, m, d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
};

/** Days in a given month (0-indexed) */
const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();

/** Hex color with alpha suffix */
const hexAlpha = (hex: string, alpha: number): string => {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return hex.length === 7 ? hex + a : hex;
};

// ── Slot type ────────────────────────────────────────────────────────────────

interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
  capacity?: number;
  booked?: number;
  remaining?: number;
  reason?: string;
  price?: string;
  icon?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export const CalendarComponent: React.FC<SchemaComponentProps> = ({ node, context }) => {
  const nodeId = node.id ?? 'cal';
  const { colors, spacing, borderRadius: tokenRadius } = context.designTokens;
  const primaryColor = colors.primary ?? '#0066CC';
  const isRTL = context.isRTL ?? false;

  // ── Props ─────────────────────────────────────────────────────────────────
  const selectionMode = (node.selectionMode ?? (node.props?.selectionMode as string | undefined)) ?? 'single';
  const minDate = node.minDate ?? (node.props?.minDate as string | undefined);
  const maxDate = node.maxDate ?? (node.props?.maxDate as string | undefined);
  const firstDayOfWeek = node.firstDayOfWeek ?? (node.props?.firstDayOfWeek as number | undefined) ?? 0;
  const showHeader = node.showHeader ?? (node.props?.showHeader as boolean | undefined) ?? true;
  const showToday = node.showToday ?? (node.props?.showToday as boolean | undefined) ?? true;
  const showWeekNumbers = node.showWeekNumbers ?? (node.props?.showWeekNumbers as boolean | undefined) ?? false;

  const selectedColor = node.selectedColor ?? (node.props?.selectedColor as string | undefined) ?? primaryColor;
  const todayColor = node.todayColor ?? (node.props?.todayColor as string | undefined);
  const headerColor = node.headerColor ?? (node.props?.headerColor as string | undefined) ?? colors.text;
  const dayNameColor = node.dayNameColor ?? (node.props?.dayNameColor as string | undefined) ?? colors.textSecondary;
  const markedColor = node.markedColor ?? (node.props?.markedColor as string | undefined) ?? '#F59E0B';

  const showAvailability = node.showAvailability ?? (node.props?.showAvailability as boolean | undefined) ?? false;
  const availabilityData = (node.availabilityData ?? node.props?.availabilityData ?? null) as Record<string, { status: string; slots?: number }> | null;
  const availableColor = node.availableColor ?? (node.props?.availableColor as string | undefined) ?? '#10B981';
  const fewLeftColor = node.fewLeftColor ?? (node.props?.fewLeftColor as string | undefined) ?? '#F59E0B';
  const bookedColor = node.bookedColor ?? (node.props?.bookedColor as string | undefined) ?? '#EF4444';

  const showTimeSlots = node.showTimeSlots ?? (node.props?.showTimeSlots as boolean | undefined) ?? false;
  const timeSlotsRaw = (node.timeSlots ?? node.props?.timeSlots ?? null) as TimeSlot[] | null;
  const timeSlotsTitle = node.timeSlotsTitle ?? (node.props?.timeSlotsTitle as string | undefined);
  const slotColumns = node.slotColumns ?? (node.props?.slotColumns as number | undefined) ?? 3;
  const slotHeight = node.slotHeight ?? (node.props?.slotHeight as number | undefined) ?? 40;
  const slotGap = node.slotGap ?? (node.props?.slotGap as number | undefined) ?? 8;
  const slotFontSize = node.slotFontSize ?? (node.props?.slotFontSize as number | undefined) ?? 13;
  const slotSelectedColor = node.slotSelectedColor ?? (node.props?.slotSelectedColor as string | undefined) ?? primaryColor;
  const slotSelectedTextColor = node.slotSelectedTextColor ?? (node.props?.slotSelectedTextColor as string | undefined) ?? '#FFFFFF';
  const slotAvailableColor = node.slotAvailableColor ?? (node.props?.slotAvailableColor as string | undefined) ?? '#F3F4F6';
  const slotAvailableTextColor = node.slotAvailableTextColor ?? (node.props?.slotAvailableTextColor as string | undefined) ?? colors.text;
  const slotUnavailableColor = node.slotUnavailableColor ?? (node.props?.slotUnavailableColor as string | undefined) ?? '#E5E7EB';
  const slotUnavailableTextColor = node.slotUnavailableTextColor ?? (node.props?.slotUnavailableTextColor as string | undefined) ?? '#9CA3AF';
  const slotBorderRadius = node.slotBorderRadius ?? (node.props?.slotBorderRadius as number | undefined) ?? 8;
  const slotEmptyMessage = node.slotEmptyMessage ?? (node.props?.slotEmptyMessage as string | undefined) ?? 'No slots available';

  // Marked & disabled dates
  const markedDates = useMemo<Set<string>>(() => {
    const raw = node.markedDates ?? node.props?.markedDates;
    if (!raw) return new Set<string>();
    if (Array.isArray(raw)) return new Set(raw as string[]);
    return new Set<string>();
  }, [node.markedDates, node.props?.markedDates]);

  const disabledDates = useMemo<Set<string>>(() => {
    const raw = node.disabledDates ?? node.props?.disabledDates;
    if (!raw) return new Set<string>();
    if (Array.isArray(raw)) return new Set(raw as string[]);
    return new Set<string>();
  }, [node.disabledDates, node.props?.disabledDates]);

  // ── Two-way value binding (InputComponent pattern) ────────────────────────
  const rawBindingKey = (node.props?.value as string | undefined) ?? '';
  const currentValue = node.value ?? '';

  // Parse current selection
  const selectedDates = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    if (!currentValue) return set;
    if (typeof currentValue === 'string') {
      // Could be a plain date string or JSON
      if ((currentValue as string).startsWith('[')) {
        try { (JSON.parse(currentValue as string) as string[]).forEach(d => set.add(d)); } catch { /* skip */ }
      } else if ((currentValue as string).startsWith('{')) {
        try {
          const obj = JSON.parse(currentValue as string) as Record<string, string>;
          if (obj.start) set.add(obj.start);
          if (obj.end) set.add(obj.end);
          if (obj.date) set.add(obj.date);
        } catch { /* skip */ }
      } else {
        set.add(currentValue as string);
      }
    } else if (Array.isArray(currentValue)) {
      (currentValue as string[]).forEach(d => set.add(d));
    } else if (typeof currentValue === 'object' && currentValue !== null) {
      const obj = currentValue as Record<string, unknown>;
      if (obj.start) set.add(String(obj.start));
      if (obj.end) set.add(String(obj.end));
      if (obj.date) set.add(String(obj.date));
    }
    return set;
  }, [currentValue]);

  // Extract range start/end
  const rangeInfo = useMemo(() => {
    if (selectionMode !== 'range') return { start: '', end: '' };
    if (typeof currentValue === 'string' && (currentValue as string).startsWith('{')) {
      try {
        const obj = JSON.parse(currentValue as string) as Record<string, string>;
        return { start: obj.start ?? '', end: obj.end ?? '' };
      } catch { /* skip */ }
    }
    if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
      const obj = currentValue as Record<string, unknown>;
      return { start: String(obj.start ?? ''), end: String(obj.end ?? '') };
    }
    // Single date selected means range start only
    if (typeof currentValue === 'string' && !((currentValue as string).startsWith('{')) && !((currentValue as string).startsWith('['))) {
      return { start: currentValue as string, end: '' };
    }
    return { start: '', end: '' };
  }, [currentValue, selectionMode]);

  // Extract selected time
  const selectedTime = useMemo(() => {
    if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
      return String((currentValue as Record<string, unknown>).time ?? '');
    }
    if (typeof currentValue === 'string' && (currentValue as string).startsWith('{')) {
      try {
        return String((JSON.parse(currentValue as string) as Record<string, string>).time ?? '');
      } catch { return ''; }
    }
    return '';
  }, [currentValue]);

  // ── View month state ──────────────────────────────────────────────────────
  const monthStateKey = `__calendar_month_${nodeId}`;
  const viewMonthRaw = context.state[monthStateKey] as string | undefined;

  // Initialize month state on first render
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !context) return;
    initialized.current = true;
    if (context.state[monthStateKey] === undefined) {
      // Default to selected date's month or today
      let initMonth: string;
      const firstSelected = selectedDates.size > 0 ? Array.from(selectedDates)[0] : '';
      const parsed = parseISO(firstSelected);
      if (parsed) {
        initMonth = `${parsed.y}-${pad2(parsed.m + 1)}`;
      } else {
        const now = new Date();
        initMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
      }
      context.onStateChange(monthStateKey, initMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewMonth = useMemo(() => {
    if (viewMonthRaw && typeof viewMonthRaw === 'string' && viewMonthRaw.length >= 7) {
      const y = parseInt(viewMonthRaw.slice(0, 4), 10);
      const m = parseInt(viewMonthRaw.slice(5, 7), 10) - 1;
      if (!isNaN(y) && !isNaN(m)) return { year: y, month: m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [viewMonthRaw]);

  // ── Navigation handlers ───────────────────────────────────────────────────
  const canGoPrev = useMemo(() => {
    if (!minDate) return true;
    const p = parseISO(minDate);
    if (!p) return true;
    return viewMonth.year > p.y || (viewMonth.year === p.y && viewMonth.month > p.m);
  }, [minDate, viewMonth]);

  const canGoNext = useMemo(() => {
    if (!maxDate) return true;
    const p = parseISO(maxDate);
    if (!p) return true;
    return viewMonth.year < p.y || (viewMonth.year === p.y && viewMonth.month < p.m);
  }, [maxDate, viewMonth]);

  const handleMonthNav = useCallback((direction: -1 | 1) => {
    let newM = viewMonth.month + direction;
    let newY = viewMonth.year;
    if (newM < 0) { newM = 11; newY -= 1; }
    if (newM > 11) { newM = 0; newY += 1; }
    const key = `${newY}-${pad2(newM + 1)}`;
    context.onStateChange(monthStateKey, key);
    if (node.onMonthChange) {
      context.onAction({
        ...node.onMonthChange,
        payload: { ...(node.onMonthChange.payload ?? {}), month: newM + 1, year: newY },
      });
    }
  }, [viewMonth, context, monthStateKey, node.onMonthChange]);

  // ── Selection handlers ────────────────────────────────────────────────────
  const setValueState = useCallback((val: unknown) => {
    if (typeof rawBindingKey === 'string' && rawBindingKey.startsWith('$state.')) {
      const stateKey = rawBindingKey.slice('$state.'.length);
      context.onStateChange(stateKey, val);
    }
  }, [rawBindingKey, context]);

  const handleDayPress = useCallback((dateStr: string) => {
    let newValue: unknown;
    if (selectionMode === 'single') {
      newValue = showTimeSlots ? { date: dateStr, time: selectedTime } : dateStr;
    } else if (selectionMode === 'range') {
      if (!rangeInfo.start || (rangeInfo.start && rangeInfo.end)) {
        // Start new range
        newValue = showTimeSlots ? { start: dateStr, end: '', time: '' } : { start: dateStr, end: '' };
      } else {
        // Complete range — ensure start <= end
        let s = rangeInfo.start;
        let e = dateStr;
        if (s > e) { const tmp = s; s = e; e = tmp; }
        newValue = showTimeSlots ? { start: s, end: e, time: selectedTime } : { start: s, end: e };
      }
    } else {
      // multiple
      const arr = Array.from(selectedDates);
      const idx = arr.indexOf(dateStr);
      if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(dateStr); }
      newValue = arr;
    }
    setValueState(newValue);
    if (node.onChange) {
      context.onAction({
        ...node.onChange,
        payload: { ...(node.onChange.payload ?? {}), date: dateStr, value: newValue },
      });
    }
  }, [selectionMode, showTimeSlots, selectedTime, rangeInfo, selectedDates, setValueState, node.onChange, context]);

  const handleSlotPress = useCallback((slot: TimeSlot) => {
    if (!slot.available) return;
    let newValue: unknown;
    if (selectionMode === 'single') {
      const dateStr = Array.from(selectedDates)[0] ?? '';
      newValue = { date: dateStr, time: slot.time };
    } else if (selectionMode === 'range') {
      newValue = { start: rangeInfo.start, end: rangeInfo.end, time: slot.time };
    } else {
      newValue = { dates: Array.from(selectedDates), time: slot.time };
    }
    setValueState(newValue);
    if (node.onSlotSelect) {
      context.onAction({
        ...node.onSlotSelect,
        payload: { ...(node.onSlotSelect.payload ?? {}), date: Array.from(selectedDates)[0] ?? '', time: slot.time, slot },
      });
    }
  }, [selectionMode, selectedDates, rangeInfo, setValueState, node.onSlotSelect, context]);

  // ── Day name headers ──────────────────────────────────────────────────────
  const dayNames = useMemo(() => {
    const names = [...DAY_NAMES_BASE];
    const rotated: string[] = [];
    for (let i = 0; i < 7; i++) {
      rotated.push(names[(i + firstDayOfWeek) % 7]);
    }
    return rotated;
  }, [firstDayOfWeek]);

  // ── Grid cells ────────────────────────────────────────────────────────────
  const gridCells = useMemo(() => {
    const y = viewMonth.year;
    const m = viewMonth.month;
    const dim = daysInMonth(y, m);
    const firstDayDow = new Date(y, m, 1).getDay();
    const offset = (firstDayDow - firstDayOfWeek + 7) % 7;

    // Previous month trailing days
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const prevDim = daysInMonth(prevY, prevM);

    const cells: Array<{
      date: string;
      day: number;
      inMonth: boolean;
      year: number;
      month: number;
    }> = [];

    // Leading cells from previous month
    for (let i = 0; i < offset; i++) {
      const d = prevDim - offset + 1 + i;
      cells.push({ date: toISO(prevY, prevM, d), day: d, inMonth: false, year: prevY, month: prevM });
    }
    // Current month
    for (let d = 1; d <= dim; d++) {
      cells.push({ date: toISO(y, m, d), day: d, inMonth: true, year: y, month: m });
    }
    // Trailing cells from next month
    const nextM = m === 11 ? 0 : m + 1;
    const nextY = m === 11 ? y + 1 : y;
    const totalNeeded = 42; // 6 rows x 7 cols
    let nd = 1;
    while (cells.length < totalNeeded) {
      cells.push({ date: toISO(nextY, nextM, nd), day: nd, inMonth: false, year: nextY, month: nextM });
      nd++;
    }
    return cells;
  }, [viewMonth, firstDayOfWeek]);

  // ── Today string ──────────────────────────────────────────────────────────
  const todayStr = useMemo(() => {
    const now = new Date();
    return toISO(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // ── Dates in range for highlighting ───────────────────────────────────────
  const isInRange = useCallback((dateStr: string): boolean => {
    if (selectionMode !== 'range' || !rangeInfo.start || !rangeInfo.end) return false;
    return dateStr >= rangeInfo.start && dateStr <= rangeInfo.end;
  }, [selectionMode, rangeInfo]);

  // ── Date disabled check ───────────────────────────────────────────────────
  const isDateDisabled = useCallback((dateStr: string): boolean => {
    if (disabledDates.has(dateStr)) return true;
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    // If availability data and booked, treat as disabled
    if (showAvailability && availabilityData) {
      const avail = availabilityData[dateStr];
      if (avail && avail.status === 'booked') return true;
    }
    return false;
  }, [disabledDates, minDate, maxDate, showAvailability, availabilityData]);

  // ── Cell size ─────────────────────────────────────────────────────────────
  const cellSize = 40;
  const dayFontSize = 14;
  const outsideDayOpacity = 0.3;

  // ── Render ────────────────────────────────────────────────────────────────
  const elements: React.ReactElement[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  if (showHeader) {
    const arrowSize = 18;
    const arrowColor = colors.textSecondary ?? '#6B7280';
    const disabledArrowColor = colors.border ?? '#E5E7EB';

    const leftArrow = React.createElement(
      SDKTouchableOpacity,
      {
        key: 'prev',
        onPress: canGoPrev ? () => handleMonthNav(-1) : undefined,
        activeOpacity: canGoPrev ? 0.6 : 1,
        style: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          backgroundColor: canGoPrev ? hexAlpha(primaryColor, 0.06) : 'transparent',
        },
        accessibilityLabel: 'Previous month',
        accessibilityRole: 'button' as const,
      },
      iconRegistry.resolve('chevron-left', arrowSize, canGoPrev ? arrowColor : disabledArrowColor),
    );

    const rightArrow = React.createElement(
      SDKTouchableOpacity,
      {
        key: 'next',
        onPress: canGoNext ? () => handleMonthNav(1) : undefined,
        activeOpacity: canGoNext ? 0.6 : 1,
        style: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          backgroundColor: canGoNext ? hexAlpha(primaryColor, 0.06) : 'transparent',
        },
        accessibilityLabel: 'Next month',
        accessibilityRole: 'button' as const,
      },
      iconRegistry.resolve('chevron-right', arrowSize, canGoNext ? arrowColor : disabledArrowColor),
    );

    const monthTitle = React.createElement(
      SDKText,
      {
        key: 'title',
        style: {
          fontSize: 17,
          fontWeight: '600' as const,
          color: headerColor,
          textAlign: 'center' as const,
          flex: 1,
        },
      },
      `${MONTH_NAMES[viewMonth.month]} ${viewMonth.year}`,
    );

    const headerChildren = isRTL ? [rightArrow, monthTitle, leftArrow] : [leftArrow, monthTitle, rightArrow];

    elements.push(
      React.createElement(
        SDKView,
        {
          key: 'header',
          style: {
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            justifyContent: 'space-between' as const,
            paddingHorizontal: 4,
            paddingTop: 4,
            paddingBottom: 12,
          },
        },
        ...headerChildren,
      ),
    );
  }

  // ── Day name row ──────────────────────────────────────────────────────────
  const dayNameCells: React.ReactElement[] = [];
  if (showWeekNumbers) {
    dayNameCells.push(
      React.createElement(SDKView, { key: 'wk-hdr', style: { width: 28, alignItems: 'center' as const, justifyContent: 'center' as const } },
        React.createElement(SDKText, { style: { fontSize: 10, color: dayNameColor, fontWeight: '500' as const } }, 'Wk'),
      ),
    );
  }
  for (let i = 0; i < 7; i++) {
    dayNameCells.push(
      React.createElement(
        SDKView,
        { key: `dn-${i}`, style: { flex: 1, alignItems: 'center' as const, paddingVertical: 4 } },
        React.createElement(SDKText, {
          style: {
            fontSize: 12,
            fontWeight: '600' as const,
            color: dayNameColor,
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
          },
        }, dayNames[i]),
      ),
    );
  }
  elements.push(
    React.createElement(
      SDKView,
      {
        key: 'day-names',
        style: {
          flexDirection: isRTL ? 'row-reverse' as const : 'row' as const,
          marginBottom: 4,
          paddingHorizontal: 2,
        },
      },
      ...dayNameCells,
    ),
  );

  // ── Day grid (6 rows) ────────────────────────────────────────────────────
  for (let row = 0; row < 6; row++) {
    const rowCells: React.ReactElement[] = [];

    // Week number
    if (showWeekNumbers) {
      const firstCellInRow = gridCells[row * 7];
      const wn = getWeekNumber(firstCellInRow.year, firstCellInRow.month, firstCellInRow.day);
      rowCells.push(
        React.createElement(SDKView, { key: `wn-${row}`, style: { width: 28, alignItems: 'center' as const, justifyContent: 'center' as const, height: cellSize } },
          React.createElement(SDKText, { style: { fontSize: 10, color: colors.textSecondary ?? '#9CA3AF' } }, String(wn)),
        ),
      );
    }

    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col;
      const cell = gridCells[idx];
      const { date, day, inMonth } = cell;
      const isToday = date === todayStr;
      const isSelected = selectedDates.has(date);
      const isRangeStart = selectionMode === 'range' && date === rangeInfo.start;
      const isRangeEnd = selectionMode === 'range' && date === rangeInfo.end;
      const inRange = isInRange(date);
      const disabled = !inMonth || isDateDisabled(date);

      // Availability
      let availDotColor: string | null = null;
      if (showAvailability && availabilityData && inMonth) {
        const avail = availabilityData[date];
        if (avail) {
          if (avail.status === 'available') availDotColor = availableColor;
          else if (avail.status === 'few-left') availDotColor = fewLeftColor;
          else if (avail.status === 'booked') availDotColor = bookedColor;
        }
      }

      // Marked dot
      const isMarked = markedDates.has(date) && inMonth;

      // ── Cell style computation ──────────────────────────────────────────
      const cellWrapStyle: Record<string, unknown> = {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        height: cellSize,
        position: 'relative',
      };

      // Range strip background (extends full width behind circle)
      let rangeStripEl: React.ReactElement | null = null;
      if (inRange && inMonth && selectionMode === 'range' && rangeInfo.end) {
        const isStart = isRangeStart;
        const isEnd = isRangeEnd;
        const stripStyle: Record<string, unknown> = {
          position: 'absolute',
          top: (cellSize - 32) / 2,
          height: 32,
          backgroundColor: hexAlpha(selectedColor, 0.12),
        };
        if (isStart && !isEnd) {
          // Left half: clear, right half: strip
          stripStyle.right = 0;
          stripStyle.left = '50%';
        } else if (isEnd && !isStart) {
          stripStyle.left = 0;
          stripStyle.right = '50%';
        } else if (!isStart && !isEnd) {
          stripStyle.left = 0;
          stripStyle.right = 0;
        } else {
          // single day range (start === end)
          stripStyle.left = '25%';
          stripStyle.right = '25%';
          stripStyle.borderRadius = 16;
        }
        rangeStripEl = React.createElement(SDKView, { key: 'strip', style: stripStyle });
      }

      // Circle element
      const circleStyle: Record<string, unknown> = {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
      };

      let textColor = inMonth ? (colors.text ?? '#111827') : (colors.textSecondary ?? '#9CA3AF');
      let fontWeight: '400' | '500' | '600' | '700' = '400';

      if (isSelected || isRangeStart || isRangeEnd) {
        circleStyle.backgroundColor = selectedColor;
        textColor = '#FFFFFF';
        fontWeight = '600';
      } else if (isToday && showToday && inMonth) {
        const todayBg = todayColor ?? hexAlpha(primaryColor, 0.12);
        circleStyle.backgroundColor = todayBg;
        textColor = primaryColor;
        fontWeight = '700';
      }

      if (!inMonth) {
        circleStyle.opacity = outsideDayOpacity;
      }
      if (disabled && inMonth) {
        circleStyle.opacity = 0.35;
      }

      // Day number text
      const dayText = React.createElement(SDKText, {
        key: 'num',
        style: {
          fontSize: dayFontSize,
          fontWeight,
          color: textColor,
          textAlign: 'center' as const,
          includeFontPadding: false,
        },
      }, String(day));

      // Dots container below the number
      const dots: React.ReactElement[] = [];
      if (availDotColor) {
        dots.push(
          React.createElement(SDKView, {
            key: 'avail-dot',
            style: {
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: availDotColor,
              marginHorizontal: 1,
            },
          }),
        );
      }
      if (isMarked) {
        dots.push(
          React.createElement(SDKView, {
            key: 'mark-dot',
            style: {
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: markedColor,
              marginHorizontal: 1,
            },
          }),
        );
      }

      const dotRow = dots.length > 0
        ? React.createElement(SDKView, {
            key: 'dots',
            style: {
              flexDirection: 'row' as const,
              position: 'absolute' as const,
              bottom: 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
          }, ...dots)
        : null;

      // Circle container
      const circleEl = React.createElement(
        SDKView, { key: 'circle', style: circleStyle }, dayText, dotRow,
      );

      // Wrap in touchable or plain view
      const cellContent = disabled
        ? React.createElement(SDKView, { key: `cell-${idx}`, style: cellWrapStyle }, rangeStripEl, circleEl)
        : React.createElement(
            SDKTouchableOpacity,
            {
              key: `cell-${idx}`,
              onPress: () => handleDayPress(date),
              activeOpacity: 0.6,
              style: cellWrapStyle,
              accessibilityLabel: `${MONTH_NAMES[cell.month]} ${day}, ${cell.year}`,
              accessibilityRole: 'button' as const,
            },
            rangeStripEl,
            circleEl,
          );

      rowCells.push(cellContent);
    }

    elements.push(
      React.createElement(
        SDKView,
        {
          key: `row-${row}`,
          style: {
            flexDirection: isRTL ? 'row-reverse' as const : 'row' as const,
            marginBottom: 1,
          },
        },
        ...rowCells,
      ),
    );
  }

  // ── Time slots section ────────────────────────────────────────────────────
  const hasDateSelected = selectedDates.size > 0;
  if (showTimeSlots && hasDateSelected) {
    const slots: TimeSlot[] = Array.isArray(timeSlotsRaw) ? timeSlotsRaw : [];
    const firstDate = Array.from(selectedDates)[0];
    const parsedDate = parseISO(firstDate);
    const dateLabel = parsedDate
      ? `${MONTH_NAMES[parsedDate.m].slice(0, 3)} ${parsedDate.d}`
      : firstDate;

    const titleText = timeSlotsTitle
      ? timeSlotsTitle
      : `Available times for ${dateLabel}`;

    // Divider
    elements.push(
      React.createElement(SDKView, {
        key: 'slot-divider',
        style: {
          height: 1,
          backgroundColor: colors.border ?? '#E5E7EB',
          marginTop: 12,
          marginBottom: 12,
          marginHorizontal: 4,
        },
      }),
    );

    // Title
    elements.push(
      React.createElement(SDKText, {
        key: 'slot-title',
        style: {
          fontSize: 15,
          fontWeight: '600' as const,
          color: colors.text,
          marginBottom: 10,
          paddingHorizontal: 4,
        },
      }, titleText),
    );

    if (slots.length === 0) {
      // Empty message
      elements.push(
        React.createElement(
          SDKView,
          {
            key: 'slot-empty',
            style: {
              paddingVertical: 24,
              alignItems: 'center' as const,
            },
          },
          React.createElement(SDKText, {
            style: {
              fontSize: 14,
              color: colors.textSecondary ?? '#9CA3AF',
              fontStyle: 'italic' as const,
            },
          }, slotEmptyMessage),
        ),
      );
    } else {
      // Slot grid
      const slotRows: React.ReactElement[][] = [];
      let currentRow: React.ReactElement[] = [];
      for (let si = 0; si < slots.length; si++) {
        const slot = slots[si];
        const isSlotSelected = selectedTime === slot.time;
        const isAvail = slot.available && (slot.remaining === undefined || slot.remaining > 0);

        // Capacity coloring
        let chipBg = slotAvailableColor;
        let chipText = slotAvailableTextColor ?? colors.text ?? '#374151';
        if (isSlotSelected) {
          chipBg = slotSelectedColor;
          chipText = slotSelectedTextColor;
        } else if (!isAvail) {
          chipBg = slotUnavailableColor;
          chipText = slotUnavailableTextColor;
        } else if (slot.remaining !== undefined) {
          if (slot.remaining > 2) {
            chipBg = slotAvailableColor;
            chipText = slotAvailableTextColor ?? colors.text ?? '#374151';
          } else if (slot.remaining >= 1) {
            chipBg = fewLeftColor;
            chipText = '#FFFFFF';
          }
        }

        const chipChildren: React.ReactElement[] = [];

        // Label
        chipChildren.push(
          React.createElement(SDKText, {
            key: 'label',
            style: {
              fontSize: slotFontSize,
              fontWeight: isSlotSelected ? '600' as const : '500' as const,
              color: chipText,
              textAlign: 'center' as const,
            },
          }, slot.label),
        );

        // Remaining text
        if (slot.remaining !== undefined && isAvail) {
          chipChildren.push(
            React.createElement(SDKText, {
              key: 'remain',
              style: {
                fontSize: 10,
                color: isSlotSelected ? hexAlpha(chipText ?? '#FFFFFF', 0.8) : (colors.textSecondary ?? '#9CA3AF'),
                textAlign: 'center' as const,
                marginTop: 1,
              },
            }, slot.remaining === 0 ? 'Full' : `${slot.remaining} left`),
          );
        }

        // Price
        if (slot.price) {
          chipChildren.push(
            React.createElement(SDKText, {
              key: 'price',
              style: {
                fontSize: 10,
                fontWeight: '600' as const,
                color: isSlotSelected ? hexAlpha(chipText ?? '#FFFFFF', 0.9) : (colors.textSecondary ?? '#6B7280'),
                textAlign: 'center' as const,
                marginTop: 1,
              },
            }, slot.price),
          );
        }

        // Reason (unavailable)
        if (!isAvail && slot.reason) {
          chipChildren.push(
            React.createElement(SDKText, {
              key: 'reason',
              numberOfLines: 1,
              style: {
                fontSize: 9,
                color: slotUnavailableTextColor,
                textAlign: 'center' as const,
                marginTop: 1,
              },
            }, slot.reason),
          );
        }

        const chipStyle: Record<string, unknown> = {
          flex: 1,
          minHeight: slotHeight,
          borderRadius: slotBorderRadius,
          backgroundColor: chipBg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 6,
          paddingHorizontal: 4,
        };
        if (!isAvail && !isSlotSelected) {
          chipStyle.opacity = 0.6;
        }

        const chipEl = isAvail
          ? React.createElement(
              SDKTouchableOpacity,
              {
                key: `slot-${si}`,
                onPress: () => handleSlotPress(slot),
                activeOpacity: 0.7,
                style: chipStyle,
                accessibilityLabel: `${slot.label}${slot.price ? ', ' + slot.price : ''}`,
                accessibilityRole: 'button' as const,
              },
              ...chipChildren,
            )
          : React.createElement(
              SDKView,
              { key: `slot-${si}`, style: chipStyle },
              ...chipChildren,
            );

        currentRow.push(chipEl);

        if (currentRow.length === slotColumns || si === slots.length - 1) {
          // Pad incomplete rows with spacers
          while (currentRow.length < slotColumns) {
            currentRow.push(
              React.createElement(SDKView, { key: `pad-${currentRow.length}`, style: { flex: 1 } }),
            );
          }
          slotRows.push(currentRow);
          currentRow = [];
        }
      }

      for (let ri = 0; ri < slotRows.length; ri++) {
        elements.push(
          React.createElement(
            SDKView,
            {
              key: `srow-${ri}`,
              style: {
                flexDirection: 'row' as const,
                gap: slotGap,
                marginBottom: slotGap,
                paddingHorizontal: 4,
              },
            },
            ...slotRows[ri],
          ),
        );
      }
    }
  }

  // ── Outer wrapper ─────────────────────────────────────────────────────────
  const containerStyle: Record<string, unknown> = {
    backgroundColor: colors.surface ?? '#FFFFFF',
    borderRadius: tokenRadius?.lg ?? 12,
    padding: spacing?.md ?? 16,
    ...(node.style ?? {}),
  };

  return React.createElement(SDKView, {
    style: containerStyle,
    accessibilityRole: 'none' as const,
    accessibilityLabel: 'Calendar',
  }, ...elements);
};

CalendarComponent.displayName = 'CalendarComponent';
