/**
 * StepperComponent - Multi-step wizard with indicator bar and navigation
 * @module schema/components/StepperComponent
 *
 * Manages step state, renders step indicators (circles + connectors),
 * active step content, and optional navigation buttons.
 *
 * State managed via context.onStateChange, same pattern as TabNavigatorComponent.
 */

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { SDKView, SDKText, SDKTouchableOpacity } from '../../adapters';
import { iconRegistry } from '../icons';
import type { SchemaComponentProps, SchemaNode } from '../../types';

/** Circle dimension lookup by indicatorSize */
const INDICATOR_SIZES: Record<string, number> = {
  small: 24,
  default: 32,
  large: 40,
};

export const StepperComponent: React.FC<SchemaComponentProps> = ({ node, context, children }) => {
  const nodeId = node.id ?? 'stepper';
  const stateKey = `__stepper_${nodeId}`;
  const completedKey = `__stepper_completed_${nodeId}`;

  // ── Props with defaults ──
  const variant = (node.variant as string) ?? 'horizontal';
  const isVertical = variant === 'vertical';
  const showStepNumbers = node.showStepNumbers ?? true;
  const allowSkip = node.allowSkip ?? false;
  const showNavButtons = node.showNavButtons ?? true;
  const nextLabel = node.nextLabel ?? 'Next';
  const prevLabel = node.prevLabel ?? 'Back';
  const submitLabel = node.submitLabel ?? 'Submit';
  const linear = node.linear ?? true;
  const completedIcon = node.completedIcon ?? 'check';
  const indicatorSizeKey = (node.indicatorSize as string) ?? 'default';
  const connectorStyle = (node.connectorStyle as string) ?? 'solid';
  const indicatorColor = (node.indicatorColor as string) ?? undefined;
  const connectorColor = (node.connectorColor as string) ?? undefined;
  const buttonVariant = (node.buttonVariant as string) ?? 'primary';

  const circleSize = INDICATOR_SIZES[indicatorSizeKey] ?? 32;
  const fontSize = circleSize <= 24 ? 11 : circleSize <= 32 ? 13 : 15;
  const titleFontSize = circleSize <= 24 ? 10 : circleSize <= 32 ? 11 : 13;

  const primaryColor = indicatorColor ?? context?.designTokens?.colors?.primary ?? '#3B82F6';
  const connColor = connectorColor ?? '#D1D5DB';

  // ── Step pane metadata ──
  const stepPanes: SchemaNode[] = useMemo(() => {
    if (!node.children) return [];
    return (node.children as SchemaNode[]).filter(
      (child) => child.type === 'step',
    );
  }, [node.children]);

  // ── Active step index ──
  const activeStepIndex = useMemo(() => {
    if (!context) return 0;
    const stateVal = context.state[stateKey];
    if (stateVal !== undefined) return Number(stateVal);
    const propVal = node.activeStep;
    if (propVal !== undefined) return Number(propVal);
    return 0;
  }, [context, stateKey, node.activeStep]);

  // Clamp to valid range
  const safeIndex = useMemo(() => {
    if (stepPanes.length === 0) return 0;
    if (activeStepIndex < 0 || activeStepIndex >= stepPanes.length) return 0;
    return activeStepIndex;
  }, [activeStepIndex, stepPanes.length]);

  // ── Completed steps set ──
  const completedSteps: Set<number> = useMemo(() => {
    if (!context) return new Set<number>();
    const raw = context.state[completedKey];
    if (!raw) return new Set<number>();
    try {
      const arr = JSON.parse(String(raw));
      return new Set<number>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set<number>();
    }
  }, [context, completedKey]);

  // ── Initialize on first render ──
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !context) return;
    initialized.current = true;
    if (context.state[stateKey] === undefined) {
      const initial = node.activeStep !== undefined ? Number(node.activeStep) : 0;
      context.onStateChange(stateKey, initial);
    }
    if (context.state[completedKey] === undefined) {
      context.onStateChange(completedKey, '[]');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ──
  const markCompleted = useCallback((stepIdx: number) => {
    if (!context) return;
    const next = new Set(completedSteps);
    next.add(stepIdx);
    context.onStateChange(completedKey, JSON.stringify(Array.from(next)));
  }, [context, completedKey, completedSteps]);

  const fireStepChange = useCallback((idx: number) => {
    if (!context || !node.onStepChange) return;
    const pane = stepPanes[idx];
    context.onAction({
      ...node.onStepChange,
      stepIndex: idx,
      stepTitle: pane?.title ?? '',
    } as Parameters<typeof context.onAction>[0]);
  }, [context, node.onStepChange, stepPanes]);

  const goToStep = useCallback((idx: number) => {
    if (!context || idx === safeIndex) return;
    // Mark current step as completed when moving forward
    if (idx > safeIndex) {
      markCompleted(safeIndex);
    }
    context.onStateChange(stateKey, idx);
    fireStepChange(idx);
  }, [context, stateKey, safeIndex, markCompleted, fireStepChange]);

  const handleNext = useCallback(() => {
    if (safeIndex >= stepPanes.length - 1) return;
    const step = stepPanes[safeIndex];
    // If step has validateFields, fire validate action first then advance
    if (step?.validateFields && context) {
      const fields = typeof step.validateFields === 'string'
        ? (step.validateFields as string).split(',').map((s: string) => s.trim())
        : (step.validateFields as string[]);
      context.onAction({
        action: 'validate',
        fields,
        onValid: {
          action: 'update_state',
          key: stateKey,
          value: safeIndex + 1,
        },
      } as Parameters<typeof context.onAction>[0]);
      markCompleted(safeIndex);
      fireStepChange(safeIndex + 1);
      return;
    }
    goToStep(safeIndex + 1);
  }, [safeIndex, stepPanes, context, stateKey, markCompleted, fireStepChange, goToStep]);

  const handlePrev = useCallback(() => {
    if (safeIndex <= 0) return;
    goToStep(safeIndex - 1);
  }, [safeIndex, goToStep]);

  const handleSubmit = useCallback(() => {
    if (!context) return;
    markCompleted(safeIndex);
    if (node.onComplete) {
      context.onAction(node.onComplete);
    }
  }, [context, safeIndex, markCompleted, node.onComplete]);

  const handleIndicatorPress = useCallback((idx: number) => {
    if (idx === safeIndex) return;
    if (!allowSkip && linear) {
      // In linear mode without skip, only allow going to completed steps or adjacent next
      if (!completedSteps.has(idx) && idx !== safeIndex + 1) return;
    }
    goToStep(idx);
  }, [safeIndex, allowSkip, linear, completedSteps, goToStep]);

  // ── Render helpers ──

  const renderCircle = (idx: number) => {
    const isActive = idx === safeIndex;
    const isCompleted = completedSteps.has(idx);
    const pane = stepPanes[idx];
    const stepIcon = pane?.icon as string | undefined;

    const circleBg = isActive || isCompleted ? primaryColor : '#FFFFFF';
    const circleBorder = isActive || isCompleted ? primaryColor : '#D1D5DB';
    const textColor = isActive || isCompleted ? '#FFFFFF' : '#9CA3AF';

    // Circle content
    let content: React.ReactElement;
    if (isCompleted) {
      const checkEl = iconRegistry.resolve(completedIcon, circleSize * 0.5, '#FFFFFF');
      content = checkEl ?? React.createElement(SDKText, {
        style: { fontSize, fontWeight: '700' as const, color: '#FFFFFF', textAlign: 'center' as const },
      }, '\u2713');
    } else if (stepIcon) {
      const iconEl = iconRegistry.resolve(stepIcon, circleSize * 0.5, textColor);
      content = iconEl ?? React.createElement(SDKText, {
        style: { fontSize, fontWeight: '600' as const, color: textColor, textAlign: 'center' as const },
      }, String(idx + 1));
    } else if (showStepNumbers) {
      content = React.createElement(SDKText, {
        style: { fontSize, fontWeight: '600' as const, color: textColor, textAlign: 'center' as const },
      }, String(idx + 1));
    } else {
      // Dot indicator
      content = React.createElement(SDKView, {
        style: {
          width: circleSize * 0.3,
          height: circleSize * 0.3,
          borderRadius: circleSize * 0.15,
          backgroundColor: textColor,
        },
      });
    }

    const canPress = allowSkip || !linear || completedSteps.has(idx) || idx === safeIndex + 1 || idx < safeIndex;

    return React.createElement(
      SDKTouchableOpacity,
      {
        key: `circle-${idx}`,
        onPress: () => handleIndicatorPress(idx),
        activeOpacity: canPress ? 0.7 : 1,
        disabled: !canPress,
        style: {
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: circleBg,
          borderWidth: 2,
          borderColor: circleBorder,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          // Subtle shadow for active step
          ...(isActive ? {
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 4,
          } : {}),
        },
      },
      content,
    );
  };

  const renderConnector = (idx: number, isHoriz: boolean) => {
    const isCompletedConnector = completedSteps.has(idx);
    const color = isCompletedConnector ? primaryColor : connColor;
    const borderStyle: Record<string, unknown> = connectorStyle === 'dashed'
      ? { borderStyle: 'dashed' as const }
      : connectorStyle === 'dotted'
        ? { borderStyle: 'dotted' as const }
        : { borderStyle: 'solid' as const };

    if (isHoriz) {
      return React.createElement(SDKView, {
        key: `conn-${idx}`,
        style: {
          flex: 1,
          height: 0,
          borderTopWidth: 2,
          borderTopColor: color,
          ...borderStyle,
          marginHorizontal: 4,
          alignSelf: 'center' as const,
        },
      });
    }
    // Vertical connector
    return React.createElement(SDKView, {
      key: `conn-${idx}`,
      style: {
        width: 0,
        height: 20,
        borderLeftWidth: 2,
        borderLeftColor: color,
        ...borderStyle,
        marginLeft: circleSize / 2 - 1,
        marginVertical: 2,
      },
    });
  };

  // ── Horizontal indicator bar ──
  const renderHorizontalIndicator = () => {
    const items: React.ReactElement[] = [];
    for (let i = 0; i < stepPanes.length; i++) {
      items.push(
        React.createElement(SDKView, {
          key: `step-col-${i}`,
          style: {
            alignItems: 'center' as const,
            minWidth: circleSize + 8,
          },
        },
          renderCircle(i),
          // Title below circle
          React.createElement(SDKText, {
            key: `title-${i}`,
            numberOfLines: 1,
            style: {
              fontSize: titleFontSize,
              fontWeight: i === safeIndex ? '600' as const : '400' as const,
              color: i === safeIndex ? primaryColor : completedSteps.has(i) ? '#374151' : '#9CA3AF',
              marginTop: 6,
              textAlign: 'center' as const,
              maxWidth: 72,
            },
          }, stepPanes[i]?.title ?? `Step ${i + 1}`),
          // Optional subtitle
          stepPanes[i]?.subtitle
            ? React.createElement(SDKText, {
                key: `subtitle-${i}`,
                numberOfLines: 1,
                style: {
                  fontSize: titleFontSize - 1,
                  color: '#9CA3AF',
                  marginTop: 1,
                  textAlign: 'center' as const,
                  maxWidth: 72,
                },
              }, stepPanes[i].subtitle as string)
            : null,
          // Optional badge
          stepPanes[i]?.optional
            ? React.createElement(SDKText, {
                key: `opt-${i}`,
                style: {
                  fontSize: 9,
                  color: '#9CA3AF',
                  fontStyle: 'italic' as const,
                  marginTop: 1,
                },
              }, 'Optional')
            : null,
        ),
      );
      // Connector between circles (not after last)
      if (i < stepPanes.length - 1) {
        items.push(renderConnector(i, true));
      }
    }

    return React.createElement(SDKView, {
      style: {
        flexDirection: 'row' as const,
        alignItems: 'flex-start' as const,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
      },
    }, ...items);
  };

  // ── Vertical indicator bar ──
  const renderVerticalIndicator = () => {
    const items: React.ReactElement[] = [];
    for (let i = 0; i < stepPanes.length; i++) {
      // Row: circle + title
      items.push(
        React.createElement(SDKView, {
          key: `step-row-${i}`,
          style: {
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
          },
        },
          renderCircle(i),
          React.createElement(SDKView, {
            key: `labels-${i}`,
            style: { marginLeft: 12, flex: 1 },
          },
            React.createElement(SDKText, {
              style: {
                fontSize: titleFontSize + 2,
                fontWeight: i === safeIndex ? '600' as const : '400' as const,
                color: i === safeIndex ? primaryColor : completedSteps.has(i) ? '#374151' : '#9CA3AF',
              },
            }, stepPanes[i]?.title ?? `Step ${i + 1}`),
            stepPanes[i]?.subtitle
              ? React.createElement(SDKText, {
                  key: `sub-${i}`,
                  style: { fontSize: titleFontSize, color: '#9CA3AF', marginTop: 1 },
                }, stepPanes[i].subtitle as string)
              : null,
            stepPanes[i]?.optional
              ? React.createElement(SDKText, {
                  key: `opt-${i}`,
                  style: { fontSize: 9, color: '#9CA3AF', fontStyle: 'italic' as const, marginTop: 1 },
                }, 'Optional')
              : null,
          ),
          completedSteps.has(i)
            ? (iconRegistry.resolve('check', 14, primaryColor) ?? React.createElement(SDKText, {
                key: `chk-${i}`,
                style: { fontSize: 12, color: primaryColor },
              }, '\u2713'))
            : null,
        ),
      );

      // Vertical connector (not after last)
      if (i < stepPanes.length - 1) {
        items.push(renderConnector(i, false));
      }
    }

    return React.createElement(SDKView, {
      style: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
      },
    }, ...items);
  };

  // ── Navigation buttons ──
  const renderNavButtons = () => {
    if (!showNavButtons) return null;

    const isFirst = safeIndex === 0;
    const isLast = safeIndex === stepPanes.length - 1;

    // Button style helper
    const btnStyle = (isPrimary: boolean): Record<string, unknown> => {
      if (buttonVariant === 'text') {
        return {
          paddingVertical: 10,
          paddingHorizontal: 20,
        };
      }
      if (buttonVariant === 'outline' || !isPrimary) {
        return {
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: primaryColor,
          backgroundColor: '#FFFFFF',
        };
      }
      // Primary filled
      return {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        backgroundColor: primaryColor,
        shadowColor: primaryColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
      };
    };

    const btnTextColor = (isPrimary: boolean): string => {
      if (buttonVariant === 'text') return primaryColor;
      if (buttonVariant === 'outline' || !isPrimary) return primaryColor;
      return '#FFFFFF';
    };

    const backButton = !isFirst
      ? React.createElement(
          SDKTouchableOpacity,
          {
            key: 'back-btn',
            onPress: handlePrev,
            activeOpacity: 0.7,
            style: btnStyle(false),
          },
          React.createElement(SDKText, {
            style: {
              fontSize: 14,
              fontWeight: '600' as const,
              color: btnTextColor(false),
            },
          }, prevLabel as string),
        )
      : React.createElement(SDKView, { key: 'back-spacer' });

    const forwardButton = isLast
      ? React.createElement(
          SDKTouchableOpacity,
          {
            key: 'submit-btn',
            onPress: handleSubmit,
            activeOpacity: 0.7,
            style: btnStyle(true),
          },
          React.createElement(SDKText, {
            style: {
              fontSize: 14,
              fontWeight: '600' as const,
              color: btnTextColor(true),
            },
          }, submitLabel as string),
        )
      : React.createElement(
          SDKTouchableOpacity,
          {
            key: 'next-btn',
            onPress: handleNext,
            activeOpacity: 0.7,
            style: btnStyle(true),
          },
          React.createElement(SDKText, {
            style: {
              fontSize: 14,
              fontWeight: '600' as const,
              color: btnTextColor(true),
            },
          }, nextLabel as string),
        );

    return React.createElement(SDKView, {
      style: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
      },
    }, backButton, forwardButton);
  };

  // ── Content area ──
  const childrenArray = React.Children.toArray(children);
  const activeContent = safeIndex < childrenArray.length
    ? childrenArray[safeIndex]
    : null;

  const contentArea = React.createElement(
    SDKView,
    { style: { flex: 1, paddingHorizontal: 16, paddingTop: 8 } },
    activeContent,
  );

  // ── Indicator divider ──
  const divider = React.createElement(SDKView, {
    style: {
      height: 1,
      backgroundColor: '#F3F4F6',
      marginHorizontal: 16,
    },
  });

  // ── Assemble layout ──
  return React.createElement(
    SDKView,
    {
      style: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        ...(node.style ?? {}),
      },
    },
    isVertical ? renderVerticalIndicator() : renderHorizontalIndicator(),
    divider,
    contentArea,
    renderNavButtons(),
  );
};

StepperComponent.displayName = 'StepperComponent';
