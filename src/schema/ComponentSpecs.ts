/**
 * Component Specifications - Single source of truth for all component types
 * Used by: SchemaInterpreter, ComponentRegistry, ModuleValidator, CLI templates
 * @module schema/ComponentSpecs
 */

import type { ComponentSpec } from '../types';

/**
 * Complete specification map for all 15 built-in component types.
 * This is the canonical reference used by the registry, validator, and CLI.
 */
export const COMPONENT_SPECS: Record<string, ComponentSpec> = {
  // ---------------------------------------------------------------------------
  // Display Components
  // ---------------------------------------------------------------------------
  text: {
    type: 'text',
    category: 'display',
    description: 'Displays text content with optional expression binding',
    props: {
      value: {
        type: 'string',
        required: true,
        description: 'Text content or expression',
      },
      numberOfLines: {
        type: 'number',
        required: false,
        description: 'Maximum number of visible lines',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: true,
    styles: [
      'fontSize', 'fontWeight', 'fontStyle', 'color', 'textAlign',
      'textDecorationLine', 'lineHeight', 'letterSpacing',
      'padding', 'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'opacity', 'width', 'maxWidth', 'alignSelf',
    ],
  },

  image: {
    type: 'image',
    category: 'display',
    description: 'Displays an image from a URL or asset reference',
    props: {
      source: {
        type: 'string',
        required: true,
        description: 'Image URL or asset reference',
      },
      resizeMode: {
        type: 'string',
        required: false,
        defaultValue: 'cover',
        enum: ['cover', 'contain', 'stretch', 'center'],
        description: 'How the image should fit its container',
      },
      alt: {
        type: 'string',
        required: false,
        description: 'Accessibility description for the image',
      },
    },
    children: false,
    events: ['onPress', 'onLoad', 'onError'],
    dataBindable: true,
    styles: [
      'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
      'borderRadius', 'margin', 'marginTop', 'marginBottom',
      'opacity', 'alignSelf', 'overflow',
    ],
  },

  divider: {
    type: 'divider',
    category: 'display',
    description: 'Horizontal divider line',
    props: {
      color: {
        type: 'string',
        required: false,
        defaultValue: '#E5E7EB',
        description: 'Divider color',
      },
      thickness: {
        type: 'number',
        required: false,
        defaultValue: 1,
        description: 'Divider thickness in pixels',
      },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['margin', 'marginTop', 'marginBottom', 'marginHorizontal', 'marginVertical', 'opacity'],
  },

  badge: {
    type: 'badge',
    category: 'display',
    description: 'Interactive badge with icon, selectable filter, and active state',
    props: {
      value: {
        type: 'string',
        required: true,
        description: 'Badge text content',
      },
      color: {
        type: 'string',
        required: false,
        defaultValue: 'primary',
        description: 'Badge color theme or hex value',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'filled',
        enum: ['filled', 'outlined'],
        description: 'Badge visual variant',
      },
      icon: {
        type: 'string',
        required: false,
        description: 'Icon name to display alongside text',
      },
      iconPosition: {
        type: 'string',
        required: false,
        defaultValue: 'left',
        enum: ['left', 'right'],
        description: 'Icon placement relative to text',
      },
      selectable: {
        type: 'boolean',
        required: false,
        description: 'Enable click-to-select filter behavior',
      },
      groupId: {
        type: 'string',
        required: false,
        description: 'State key for the selected value (e.g., $state.category)',
      },
      activeColor: {
        type: 'string',
        required: false,
        description: 'Color when badge is selected/active',
      },
      activeVariant: {
        type: 'string',
        required: false,
        enum: ['filled', 'outlined'],
        description: 'Visual variant when badge is selected/active',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: true,
    styles: ['margin', 'padding', 'opacity', 'alignSelf'],
  },

  icon: {
    type: 'icon',
    category: 'display',
    description: 'Displays an icon by name from the icon set',
    props: {
      name: {
        type: 'string',
        required: true,
        description: 'Icon name identifier',
      },
      size: {
        type: 'number',
        required: false,
        defaultValue: 24,
        description: 'Icon size in pixels',
      },
      color: {
        type: 'string',
        required: false,
        description: 'Icon color (hex or theme token)',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: false,
    styles: ['margin', 'marginTop', 'marginBottom', 'opacity', 'alignSelf'],
  },

  loading: {
    type: 'loading',
    category: 'display',
    description: 'Loading indicator with spinner, progress bar, overlay, and skeleton variants',
    props: {
      size: {
        type: 'string',
        required: false,
        defaultValue: 'md',
        enum: ['sm', 'md', 'lg'],
        description: 'Spinner size (applies to spinner and overlay variants)',
      },
      color: {
        type: 'string',
        required: false,
        description: 'Primary color for spinner or progress bar',
      },
      loadingVariant: {
        type: 'string',
        required: false,
        defaultValue: 'spinner',
        enum: ['spinner', 'progress', 'overlay', 'skeleton'],
        description: 'Loading display variant',
      },
      loadingText: {
        type: 'string',
        required: false,
        description: 'Text label displayed with the loader (supports expressions)',
      },
      progress: {
        type: 'string',
        required: false,
        description: 'Progress value 0-100 for determinate progress bar (expression)',
      },
      loadingDirection: {
        type: 'string',
        required: false,
        defaultValue: 'vertical',
        enum: ['vertical', 'horizontal'],
        description: 'Layout direction for spinner + text arrangement',
      },
      indeterminate: {
        type: 'boolean',
        required: false,
        description: 'When true, progress bar animates infinitely instead of showing a fixed value',
      },
      textAlign: {
        type: 'string',
        required: false,
        defaultValue: 'left',
        enum: ['left', 'center', 'right'],
        description: 'Text alignment for progress label and percentage',
      },
      showPercent: {
        type: 'boolean',
        required: false,
        description: 'Whether to show the percentage value (auto-hidden in indeterminate mode)',
      },
      skeletonPreset: {
        type: 'string',
        required: false,
        defaultValue: 'list-item',
        enum: ['list-item', 'card', 'profile', 'paragraph', 'custom'],
        description: 'Preset skeleton layout pattern',
      },
      skeletonRows: {
        type: 'number',
        required: false,
        description: 'Number of text lines in skeleton preset',
      },
      skeletonAvatar: {
        type: 'boolean',
        required: false,
        description: 'Show avatar circle in skeleton preset',
      },
      skeletonAvatarSize: {
        type: 'number',
        required: false,
        description: 'Avatar circle diameter in pixels',
      },
      skeletonGap: {
        type: 'number',
        required: false,
        description: 'Gap between skeleton items in pixels',
      },
      skeletonLayout: {
        type: 'array',
        required: false,
        description: 'Array of skeleton placeholder shapes (for custom preset)',
      },
    },
    children: false,
    events: [],
    dataBindable: true,
    styles: ['padding', 'margin', 'backgroundColor', 'borderRadius', 'width', 'height', 'alignSelf', 'opacity'],
  },

  // ---------------------------------------------------------------------------
  // Input Components
  // ---------------------------------------------------------------------------
  input: {
    type: 'input',
    category: 'input',
    description: 'Text input field with validation support',
    props: {
      placeholder: {
        type: 'string',
        required: false,
        description: 'Placeholder text shown when empty',
      },
      value: {
        type: 'expression',
        required: false,
        description: 'Bound value expression (e.g., $state.fieldName)',
      },
      keyboardType: {
        type: 'string',
        required: false,
        enum: ['default', 'numeric', 'email-address', 'phone-pad'],
        description: 'Keyboard type for mobile input',
      },
      secureEntry: {
        type: 'boolean',
        required: false,
        description: 'Mask input for passwords',
      },
      label: {
        type: 'string',
        required: false,
        description: 'Label displayed above the input',
      },
    },
    children: false,
    events: ['onChange', 'onBlur', 'onFocus'],
    dataBindable: true,
    styles: [
      'fontSize', 'color', 'backgroundColor',
      'borderColor', 'borderWidth', 'borderRadius', 'borderStyle',
      'padding', 'margin', 'marginTop', 'marginBottom', 'opacity',
      'width', 'minWidth', 'maxWidth', 'alignSelf', 'flex',
    ],
  },

  // ---------------------------------------------------------------------------
  // Action Components
  // ---------------------------------------------------------------------------
  button: {
    type: 'button',
    category: 'action',
    description: 'Touchable button with label and optional loading/disabled state',
    props: {
      label: {
        type: 'string',
        required: true,
        description: 'Button text label',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'primary',
        enum: ['primary', 'secondary', 'outline', 'text'],
        description: 'Button visual variant',
      },
      disabled: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for disabled state',
      },
      loading: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for loading state',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: false,
    styles: [
      'backgroundColor', 'color', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle',
      'padding', 'margin', 'marginTop', 'marginBottom', 'opacity',
      'width', 'minWidth', 'maxWidth', 'height', 'alignSelf',
    ],
  },

  // ---------------------------------------------------------------------------
  // Layout Components
  // ---------------------------------------------------------------------------
  row: {
    type: 'row',
    category: 'layout',
    description: 'Horizontal flex container for side-by-side children',
    props: {
      gap: {
        type: 'number',
        required: false,
        description: 'Spacing between children in pixels',
      },
      alignItems: {
        type: 'string',
        required: false,
        enum: ['flex-start', 'center', 'flex-end', 'stretch'],
        description: 'Cross-axis alignment',
      },
      justifyContent: {
        type: 'string',
        required: false,
        enum: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
        description: 'Main-axis alignment',
      },
      wrap: {
        type: 'boolean',
        required: false,
        description: 'Whether children wrap to the next line',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: [
      'padding', 'paddingHorizontal', 'paddingVertical',
      'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle',
      'gap', 'flex', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
      'opacity', 'overflow', 'alignSelf',
    ],
  },

  column: {
    type: 'column',
    category: 'layout',
    description: 'Vertical flex container for stacked children',
    props: {
      gap: {
        type: 'number',
        required: false,
        description: 'Spacing between children in pixels',
      },
      alignItems: {
        type: 'string',
        required: false,
        enum: ['flex-start', 'center', 'flex-end', 'stretch'],
        description: 'Cross-axis alignment',
      },
      justifyContent: {
        type: 'string',
        required: false,
        enum: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
        description: 'Main-axis alignment',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: [
      'padding', 'paddingHorizontal', 'paddingVertical',
      'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle',
      'gap', 'flex', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
      'opacity', 'overflow', 'alignSelf',
    ],
  },

  card: {
    type: 'card',
    category: 'layout',
    description: 'Elevated container with shadow and rounded corners',
    props: {
      elevation: {
        type: 'number',
        required: false,
        defaultValue: 2,
        description: 'Shadow elevation level',
      },
      borderRadius: {
        type: 'number',
        required: false,
        defaultValue: 8,
        description: 'Corner radius in pixels',
      },
    },
    children: true,
    events: ['onPress'],
    dataBindable: false,
    styles: [
      'padding', 'paddingHorizontal', 'paddingVertical',
      'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle',
      'opacity', 'elevation', 'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius',
      'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
      'overflow', 'alignSelf',
    ],
  },

  scroll: {
    type: 'scroll',
    category: 'layout',
    description: 'Scrollable container for overflow content',
    props: {
      direction: {
        type: 'string',
        required: false,
        defaultValue: 'vertical',
        enum: ['vertical', 'horizontal'],
        description: 'Scroll direction',
      },
      showIndicator: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Whether to show the scroll indicator',
      },
      maxHeight: {
        type: 'number',
        required: false,
        description: 'Maximum height in pixels before scrolling',
      },
    },
    children: true,
    events: ['onScroll'],
    dataBindable: false,
    styles: ['height', 'maxHeight', 'padding', 'backgroundColor', 'flex', 'width', 'alignSelf'],
  },

  safe_area_view: {
    type: 'safe_area_view',
    category: 'layout',
    description: 'Wrapper that adds padding for device safe areas (notch, Dynamic Island, home indicator)',
    props: {
      edges: {
        type: 'array',
        required: false,
        description: 'Which edges to pad: top, bottom, left, right. Defaults to all.',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: ['padding', 'margin', 'flex', 'width', 'height', 'backgroundColor'],
  },

  spacer: {
    type: 'spacer',
    category: 'layout',
    description: 'Empty spacing element',
    props: {
      size: {
        type: 'number',
        required: false,
        defaultValue: 16,
        description: 'Spacer size in pixels',
      },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: [],
  },

  // ---------------------------------------------------------------------------
  // Data Components
  // ---------------------------------------------------------------------------
  repeater: {
    type: 'repeater',
    category: 'data',
    description: 'Iterates over a data source and renders a template for each item',
    props: {
      dataSource: {
        type: 'string',
        required: true,
        description: 'Data binding expression for the array (e.g., $data.items)',
      },
      emptyMessage: {
        type: 'string',
        required: false,
        defaultValue: 'No items',
        description: 'Message displayed when the data source is empty',
      },
    },
    children: true,
    events: [],
    dataBindable: true,
    styles: ['gap', 'padding', 'margin', 'marginTop', 'marginBottom', 'alignSelf'],
  },

  conditional: {
    type: 'conditional',
    category: 'data',
    description: 'Conditionally renders children based on an expression',
    props: {
      visible: {
        type: 'expression',
        required: true,
        description: 'Expression that evaluates to boolean',
      },
    },
    children: true,
    events: [],
    dataBindable: true,
    styles: [],
  },

  // ---------------------------------------------------------------------------
  // Advanced Components (Phase 4)
  // ---------------------------------------------------------------------------
  table: {
    type: 'table',
    category: 'data',
    description: 'Data table with column headers and scrollable rows',
    props: {
      columns: {
        type: 'array',
        required: true,
        description: 'Column definitions with key, label, and optional width',
      },
      data: {
        type: 'array',
        required: true,
        description: 'Array of row data objects',
      },
      maxRows: {
        type: 'number',
        required: false,
        description: 'Maximum number of rows to display',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: true,
    styles: [
      'padding', 'margin', 'marginTop', 'marginBottom', 'backgroundColor',
      'borderRadius', 'borderWidth', 'borderColor', 'borderStyle',
      'width', 'maxWidth', 'maxHeight', 'overflow', 'alignSelf', 'opacity',
    ],
  },

  select: {
    type: 'select',
    category: 'input',
    description: 'Dropdown select input with options list',
    props: {
      options: {
        type: 'array',
        required: true,
        description: 'Array of option objects with label and value',
      },
      placeholder: {
        type: 'string',
        required: false,
        description: 'Placeholder text when no option is selected',
      },
      disabled: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for disabled state',
      },
    },
    children: false,
    events: ['onChange'],
    dataBindable: true,
    styles: [
      'fontSize', 'color', 'backgroundColor',
      'borderColor', 'borderWidth', 'borderRadius', 'borderStyle',
      'padding', 'margin', 'marginTop', 'marginBottom', 'opacity',
      'width', 'minWidth', 'maxWidth', 'alignSelf', 'flex',
    ],
  },

  checkbox: {
    type: 'checkbox',
    category: 'input',
    description: 'Toggle checkbox with label',
    props: {
      label: {
        type: 'string',
        required: false,
        description: 'Label text displayed next to the checkbox',
      },
      disabled: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for disabled state',
      },
    },
    children: false,
    events: ['onChange'],
    dataBindable: true,
    styles: ['padding', 'margin', 'marginTop', 'marginBottom', 'opacity', 'alignSelf'],
  },

  camera_view: {
    type: 'camera_view',
    category: 'input',
    description: 'Live camera viewfinder — children render as overlays on top of feed',
    props: {
      cameraFacing: {
        type: 'string',
        required: false,
        defaultValue: 'back',
        enum: ['front', 'back'],
        description: 'Camera direction (supports $state expressions)',
      },
      shape: {
        type: 'string',
        required: false,
        defaultValue: 'rounded',
        enum: ['circle', 'square', 'rounded'],
        description: 'Viewfinder mask shape',
      },
      mirror: {
        type: 'boolean',
        required: false,
        description: 'Mirror the camera feed (auto-enabled for front camera if not set)',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: [
      'width', 'height', 'borderRadius', 'borderWidth', 'borderColor',
      'margin', 'marginTop', 'marginBottom', 'padding', 'alignSelf',
      'aspectRatio', 'overflow', 'opacity',
    ],
  },

  file_upload: {
    type: 'file_upload',
    category: 'input',
    description: 'Declarative file selection button that fires file_select intent',
    props: {
      label: {
        type: 'string',
        required: false,
        description: 'Button label text (defaults to i18n fileUpload.label)',
      },
      accept: {
        type: 'array',
        required: false,
        description: 'MIME type filter array (e.g. ["image/*", "application/pdf"])',
      },
      maxSize: {
        type: 'number',
        required: false,
        description: 'Maximum file size in bytes',
      },
    },
    children: false,
    events: ['onPress'],
    dataBindable: false,
    styles: ['margin', 'marginTop', 'marginBottom', 'padding', 'opacity', 'width', 'alignSelf'],
  },

  chart: {
    type: 'chart',
    category: 'display',
    description: 'Chart visualization (bar, line, pie, donut, gauge)',
    props: {
      chartType: {
        type: 'string',
        required: true,
        enum: ['bar', 'line', 'pie', 'donut', 'gauge'],
        description: 'Type of chart to render',
      },
      chartData: {
        type: 'array',
        required: true,
        description: 'Array of data points for the chart',
      },
      chartSeries: {
        type: 'array',
        required: false,
        description: 'Multi-series configuration array',
      },
      chartLabel: {
        type: 'string',
        required: false,
        description: 'Label key in data items',
      },
      chartValue: {
        type: 'string',
        required: false,
        description: 'Value key in data items',
      },
      chartYAxis: {
        type: 'object',
        required: false,
        description: 'Y-axis configuration',
      },
      chartAnnotations: {
        type: 'array',
        required: false,
        description: 'Data point annotations',
      },
      chartShowLegend: {
        type: 'boolean',
        required: false,
        description: 'Show chart legend',
      },
      chartShowGrid: {
        type: 'boolean',
        required: false,
        description: 'Show grid lines',
      },
      chartTitle: {
        type: 'string',
        required: false,
        description: 'Chart title override',
      },
    },
    children: false,
    events: [],
    dataBindable: true,
    styles: [
      'width', 'height', 'minHeight', 'maxHeight', 'padding', 'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'alignSelf', 'opacity',
    ],
  },

  accordion: {
    type: 'accordion',
    category: 'layout',
    description: 'Container that groups collapsible accordion items',
    props: {
      allowMultiple: {
        type: 'boolean',
        required: false,
        description: 'Whether multiple items can be expanded simultaneously',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'default',
        enum: ['default', 'bordered', 'separated'],
        description: 'Visual style: default (flush), bordered (outlined box), separated (gap between items)',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: [
      'padding', 'margin', 'marginTop', 'marginBottom', 'backgroundColor', 'borderRadius',
      'borderWidth', 'borderColor', 'overflow', 'alignSelf', 'opacity',
    ],
  },

  accordion_item: {
    type: 'accordion_item',
    category: 'layout',
    description: 'Collapsible section with header and expandable content area',
    props: {
      title: {
        type: 'string',
        required: true,
        description: 'Header title text',
      },
      subtitle: {
        type: 'string',
        required: false,
        description: 'Secondary text below the title',
      },
      icon: {
        type: 'string',
        required: false,
        description: 'Icon name displayed in the header',
      },
      iconPosition: {
        type: 'string',
        required: false,
        defaultValue: 'left',
        enum: ['left', 'right'],
        description: 'Icon placement relative to the title',
      },
      defaultExpanded: {
        type: 'boolean',
        required: false,
        description: 'Whether this item starts in the expanded state',
      },
      disabled: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for disabled state',
      },
      groupId: {
        type: 'string',
        required: false,
        description: 'State key for single-open behavior (only one item with same groupId open at a time)',
      },
    },
    children: true,
    events: ['onToggle'],
    dataBindable: false,
    styles: ['padding', 'margin', 'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'opacity'],
  },
  bottom_sheet: {
    type: 'bottom_sheet',
    category: 'layout',
    description: 'Overlay sheet that slides up from the bottom, controlled by isOpen expression',
    props: {
      isOpen: {
        type: 'expression',
        required: true,
        description: 'Expression controlling sheet visibility (e.g., $state.showSheet)',
      },
      title: {
        type: 'string',
        required: false,
        description: 'Optional title displayed in the sheet header',
      },
      sheetHeight: {
        type: 'string',
        required: false,
        defaultValue: '50%',
        enum: ['auto', '25%', '33%', '50%', '60%', '75%', '90%'],
        description: 'Height of the sheet as a percentage of screen height',
      },
      showHandle: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Whether to show the drag handle bar at the top',
      },
      dismissable: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Whether tapping the backdrop dismisses the sheet',
      },
    },
    children: true,
    events: ['onDismiss'],
    dataBindable: false,
    styles: [
      'backgroundColor', 'borderRadius',
      'borderTopLeftRadius', 'borderTopRightRadius',
      'padding', 'paddingHorizontal', 'paddingVertical',
      'maxHeight', 'minHeight',
    ],
  },

  // ── Overlay Components ──────────────────────────
  scan_frame: {
    type: 'scan_frame',
    category: 'overlay',
    description: 'Rectangular frame guide for document scanning, positioned as overlay',
    props: {
      borderStyle: { type: 'string', required: false, defaultValue: 'dashed', enum: ['solid', 'dashed', 'dotted'], description: 'Border line style' },
      borderColor: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Border color' },
      borderWidth: { type: 'number', required: false, defaultValue: 2, description: 'Border thickness' },
      cornerRadius: { type: 'number', required: false, defaultValue: 8, description: 'Frame corner radius' },
      inset: { type: 'number', required: false, defaultValue: 20, description: 'Margin from parent edges' },
      aspectRatio: { type: 'string', required: false, description: 'Constrain frame ratio (e.g. 3:2 for ID cards)' },
      label: { type: 'string', required: false, description: 'Optional instruction text below frame' },
      labelColor: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Label text color' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  corner_brackets: {
    type: 'corner_brackets',
    category: 'overlay',
    description: 'Four L-shaped corner markers for scan region, modern banking/QR style',
    props: {
      bracketSize: { type: 'number', required: false, defaultValue: 24, description: 'Length of each L arm' },
      bracketThickness: { type: 'number', required: false, defaultValue: 3, description: 'Line thickness' },
      bracketColor: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Bracket color' },
      inset: { type: 'number', required: false, defaultValue: 20, description: 'Margin from parent edges' },
      aspectRatio: { type: 'string', required: false, description: 'Constrain region ratio' },
      animated: { type: 'boolean', required: false, description: 'Subtle pulse animation' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  face_guide: {
    type: 'face_guide',
    category: 'overlay',
    description: 'Centered oval or circle guide for selfie/face positioning',
    props: {
      shape: { type: 'string', required: false, defaultValue: 'oval', enum: ['oval', 'circle'], description: 'Guide shape' },
      guideColor: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Border color' },
      guideWidth: { type: 'number', required: false, defaultValue: 2, description: 'Border thickness' },
      size: { type: 'number', required: false, defaultValue: 70, description: 'Size as % of parent smaller dimension' },
      label: { type: 'string', required: false, description: 'Instruction text (e.g. Position your face)' },
      labelPosition: { type: 'string', required: false, defaultValue: 'bottom', enum: ['top', 'bottom'], description: 'Label placement' },
      labelColor: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Label text color' },
      animated: { type: 'boolean', required: false, description: 'Gentle pulse animation' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  grid_overlay: {
    type: 'grid_overlay',
    category: 'overlay',
    description: 'Rule-of-thirds or custom grid for composition/alignment',
    props: {
      rows: { type: 'number', required: false, defaultValue: 3, description: 'Number of horizontal divisions' },
      columns: { type: 'number', required: false, defaultValue: 3, description: 'Number of vertical divisions' },
      gridColor: { type: 'string', required: false, defaultValue: 'rgba(255,255,255,0.3)', description: 'Line color' },
      gridWidth: { type: 'number', required: false, defaultValue: 1, description: 'Line thickness' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  crosshair: {
    type: 'crosshair',
    category: 'overlay',
    description: 'Center marker with optional circle ring for targeting/positioning',
    props: {
      size: { type: 'number', required: false, defaultValue: 40, description: 'Total crosshair size' },
      thickness: { type: 'number', required: false, defaultValue: 2, description: 'Line thickness' },
      color: { type: 'string', required: false, defaultValue: '#FFFFFF', description: 'Crosshair color' },
      showCircle: { type: 'boolean', required: false, description: 'Show ring around center' },
      circleRadius: { type: 'number', required: false, defaultValue: 20, description: 'Ring radius' },
      gap: { type: 'number', required: false, defaultValue: 6, description: 'Gap between center and line start' },
      animated: { type: 'boolean', required: false, description: 'Pulse animation' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  scan_line: {
    type: 'scan_line',
    category: 'overlay',
    description: 'Animated horizontal line that sweeps vertically for scanning effect',
    props: {
      lineColor: { type: 'string', required: false, defaultValue: '#00FF00', description: 'Line color' },
      lineWidth: { type: 'number', required: false, defaultValue: 2, description: 'Line thickness' },
      speed: { type: 'string', required: false, defaultValue: 'medium', enum: ['slow', 'medium', 'fast'], description: 'Animation speed' },
      glowEffect: { type: 'boolean', required: false, defaultValue: true, description: 'Gradient glow trail behind line' },
      direction: { type: 'string', required: false, defaultValue: 'bounce', enum: ['down', 'up', 'bounce'], description: 'Sweep direction' },
    },
    children: false,
    events: [],
    dataBindable: false,
    styles: ['opacity'],
  },

  bottom_tab_navigator: {
    type: 'bottom_tab_navigator',
    category: 'layout',
    description: 'Tab bar at bottom with content above, containing tab_pane children',
    props: {
      activeTab: {
        type: 'expression',
        required: false,
        description: 'Active tab index (bind to $state for external control, defaults to 0)',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'default',
        enum: ['default', 'pills', 'underline'],
        description: 'Tab bar visual style',
      },
      scrollable: {
        type: 'boolean',
        required: false,
        description: 'Enable horizontal scrolling for many tabs',
      },
    },
    children: true,
    events: ['onTabChange'],
    dataBindable: false,
    styles: ['padding', 'margin', 'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'flex', 'height', 'opacity'],
  },

  top_tab_navigator: {
    type: 'top_tab_navigator',
    category: 'layout',
    description: 'Tab bar at top with content below, containing tab_pane children',
    props: {
      activeTab: {
        type: 'expression',
        required: false,
        description: 'Active tab index (bind to $state for external control, defaults to 0)',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'default',
        enum: ['default', 'pills', 'underline'],
        description: 'Tab bar visual style',
      },
      scrollable: {
        type: 'boolean',
        required: false,
        description: 'Enable horizontal scrolling for many tabs',
      },
    },
    children: true,
    events: ['onTabChange'],
    dataBindable: false,
    styles: ['padding', 'margin', 'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'flex', 'height', 'opacity'],
  },

  stepper: {
    type: 'stepper',
    category: 'layout',
    description: 'Multi-step wizard with indicator bar and navigation buttons',
    props: {
      activeStep: {
        type: 'expression',
        required: false,
        description: 'Active step index (defaults to 0)',
      },
      variant: {
        type: 'string',
        required: false,
        defaultValue: 'horizontal',
        enum: ['horizontal', 'vertical'],
        description: 'Indicator layout direction',
      },
      indicatorSize: {
        type: 'string',
        required: false,
        defaultValue: 'default',
        enum: ['small', 'default', 'large'],
        description: 'Step indicator circle size',
      },
      connectorStyle: {
        type: 'string',
        required: false,
        defaultValue: 'solid',
        enum: ['solid', 'dashed', 'dotted'],
        description: 'Line style between step indicators',
      },
      showStepNumbers: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Show step numbers inside indicators',
      },
      completedIcon: {
        type: 'string',
        required: false,
        defaultValue: 'check',
        description: 'Icon name for completed steps',
      },
      showNavButtons: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Show Back/Next/Submit navigation buttons',
      },
      nextLabel: {
        type: 'string',
        required: false,
        defaultValue: 'Next',
        description: 'Next button label text',
      },
      prevLabel: {
        type: 'string',
        required: false,
        defaultValue: 'Back',
        description: 'Back button label text',
      },
      submitLabel: {
        type: 'string',
        required: false,
        defaultValue: 'Submit',
        description: 'Submit button label text (shown on last step)',
      },
      linear: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Enforce sequential step progression',
      },
      allowSkip: {
        type: 'boolean',
        required: false,
        description: 'Allow clicking any step indicator to jump to it',
      },
      indicatorColor: {
        type: 'string',
        required: false,
        description: 'Color for active/completed step indicators',
      },
      connectorColor: {
        type: 'string',
        required: false,
        description: 'Color for connector lines between indicators',
      },
      buttonVariant: {
        type: 'string',
        required: false,
        defaultValue: 'primary',
        enum: ['primary', 'outline', 'text'],
        description: 'Navigation button visual style',
      },
    },
    children: true,
    events: ['onStepChange', 'onComplete'],
    dataBindable: false,
    styles: [
      'padding', 'margin', 'marginTop', 'marginBottom', 'backgroundColor', 'borderRadius',
      'borderWidth', 'borderColor', 'flex', 'height', 'opacity',
    ],
  },

  step: {
    type: 'step',
    category: 'layout',
    description: 'Individual step content panel (child of stepper)',
    props: {
      title: {
        type: 'string',
        required: true,
        description: 'Step title displayed in the indicator bar',
      },
      subtitle: {
        type: 'string',
        required: false,
        description: 'Secondary text below the step title',
      },
      icon: {
        type: 'string',
        required: false,
        description: 'Icon name displayed in the step indicator circle',
      },
      optional: {
        type: 'boolean',
        required: false,
        description: 'Mark step as optional (shows "Optional" label)',
      },
      disabled: {
        type: 'expression',
        required: false,
        description: 'Expression that evaluates to boolean for disabled state',
      },
      validateFields: {
        type: 'string',
        required: false,
        description: 'Comma-separated field IDs to validate before advancing',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: ['padding', 'margin', 'backgroundColor', 'flex', 'opacity'],
  },

  calendar: {
    type: 'calendar',
    category: 'input',
    description: 'Inline calendar month grid with optional time slots and availability indicators',
    props: {
      value: {
        type: 'expression',
        required: false,
        description: 'Bound value expression for selected date (e.g., $state.selectedDate)',
      },
      selectionMode: {
        type: 'string',
        required: false,
        defaultValue: 'single',
        enum: ['single', 'range', 'multiple'],
        description: 'Date selection behavior',
      },
      minDate: {
        type: 'string',
        required: false,
        description: 'Earliest selectable date (ISO 8601)',
      },
      maxDate: {
        type: 'string',
        required: false,
        description: 'Latest selectable date (ISO 8601)',
      },
      firstDayOfWeek: {
        type: 'number',
        required: false,
        defaultValue: 0,
        description: 'First day of week (0=Sunday, 1=Monday, ...)',
      },
      showHeader: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Show month/year header with navigation arrows',
      },
      showToday: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Highlight today\'s date',
      },
      showWeekNumbers: {
        type: 'boolean',
        required: false,
        description: 'Show ISO week numbers in left column',
      },
      selectedColor: {
        type: 'string',
        required: false,
        description: 'Background color for selected date circle',
      },
      todayColor: {
        type: 'string',
        required: false,
        description: 'Background color for today highlight',
      },
      headerColor: {
        type: 'string',
        required: false,
        description: 'Text color for month/year header',
      },
      dayNameColor: {
        type: 'string',
        required: false,
        description: 'Text color for day name headers (Sun, Mon, ...)',
      },
      markedDates: {
        type: 'expression',
        required: false,
        description: 'Expression resolving to array of ISO date strings to mark with a dot',
      },
      disabledDates: {
        type: 'expression',
        required: false,
        description: 'Expression resolving to array of ISO date strings to disable',
      },
      markedColor: {
        type: 'string',
        required: false,
        defaultValue: '#F59E0B',
        description: 'Dot color for marked dates',
      },
      showAvailability: {
        type: 'boolean',
        required: false,
        description: 'Enable availability dot indicators on date cells',
      },
      availabilityData: {
        type: 'expression',
        required: false,
        description: 'Expression resolving to availability object keyed by ISO date (showWhen: showAvailability=true)',
      },
      availableColor: {
        type: 'string',
        required: false,
        defaultValue: '#10B981',
        description: 'Dot color for available dates (showWhen: showAvailability=true)',
      },
      fewLeftColor: {
        type: 'string',
        required: false,
        defaultValue: '#F59E0B',
        description: 'Dot color for few-left dates (showWhen: showAvailability=true)',
      },
      bookedColor: {
        type: 'string',
        required: false,
        defaultValue: '#EF4444',
        description: 'Dot color for booked dates (showWhen: showAvailability=true)',
      },
      showTimeSlots: {
        type: 'boolean',
        required: false,
        description: 'Show time slot picker below calendar when a date is selected',
      },
      timeSlots: {
        type: 'expression',
        required: false,
        description: 'Expression resolving to array of time slot objects (showWhen: showTimeSlots=true)',
      },
      timeSlotsTitle: {
        type: 'string',
        required: false,
        defaultValue: 'Available times',
        description: 'Title text for time slots section (showWhen: showTimeSlots=true)',
      },
      slotColumns: {
        type: 'number',
        required: false,
        defaultValue: 3,
        description: 'Number of columns in time slot grid (showWhen: showTimeSlots=true)',
      },
      slotHeight: {
        type: 'number',
        required: false,
        defaultValue: 40,
        description: 'Height of each slot chip in pixels (showWhen: showTimeSlots=true)',
      },
      slotGap: {
        type: 'number',
        required: false,
        defaultValue: 8,
        description: 'Gap between slot chips in pixels (showWhen: showTimeSlots=true)',
      },
      slotFontSize: {
        type: 'number',
        required: false,
        defaultValue: 13,
        description: 'Font size for slot label text (showWhen: showTimeSlots=true)',
      },
      slotSelectedColor: {
        type: 'string',
        required: false,
        description: 'Background color for selected time slot (showWhen: showTimeSlots=true)',
      },
      slotSelectedTextColor: {
        type: 'string',
        required: false,
        defaultValue: '#FFFFFF',
        description: 'Text color for selected time slot (showWhen: showTimeSlots=true)',
      },
      slotAvailableColor: {
        type: 'string',
        required: false,
        defaultValue: '#F3F4F6',
        description: 'Background color for available time slot (showWhen: showTimeSlots=true)',
      },
      slotAvailableTextColor: {
        type: 'string',
        required: false,
        description: 'Text color for available time slot (showWhen: showTimeSlots=true)',
      },
      slotUnavailableColor: {
        type: 'string',
        required: false,
        defaultValue: '#E5E7EB',
        description: 'Background color for unavailable time slot (showWhen: showTimeSlots=true)',
      },
      slotUnavailableTextColor: {
        type: 'string',
        required: false,
        defaultValue: '#9CA3AF',
        description: 'Text color for unavailable time slot (showWhen: showTimeSlots=true)',
      },
      slotBorderRadius: {
        type: 'number',
        required: false,
        defaultValue: 8,
        description: 'Border radius for slot chips (showWhen: showTimeSlots=true)',
      },
      slotEmptyMessage: {
        type: 'string',
        required: false,
        defaultValue: 'No slots available',
        description: 'Message when no time slots are available (showWhen: showTimeSlots=true)',
      },
    },
    children: false,
    events: ['onChange', 'onMonthChange', 'onSlotSelect'],
    dataBindable: true,
    styles: [
      'padding', 'margin', 'marginTop', 'marginBottom',
      'backgroundColor', 'borderRadius', 'borderWidth', 'borderColor',
      'width', 'maxWidth', 'alignSelf', 'opacity',
    ],
  },

  tab_pane: {
    type: 'tab_pane',
    category: 'layout',
    description: 'Individual tab content panel (child of bottom_tab_navigator or top_tab_navigator)',
    props: {
      label: {
        type: 'string',
        required: true,
        description: 'Tab title text displayed in the tab bar',
      },
      icon: {
        type: 'string',
        required: false,
        description: 'Icon name from icon registry',
      },
      badge: {
        type: 'string',
        required: false,
        description: 'Badge count displayed on the tab (supports expressions)',
      },
    },
    children: true,
    events: [],
    dataBindable: false,
    styles: ['padding', 'margin', 'backgroundColor', 'flex', 'opacity'],
  },
};

/**
 * Retrieve the specification for a single component type.
 * Returns undefined if the type is not registered.
 */
export function getComponentSpec(type: string): ComponentSpec | undefined {
  return COMPONENT_SPECS[type];
}

/**
 * Retrieve all component specifications as an array.
 */
export function getAllComponentSpecs(): ComponentSpec[] {
  return Object.values(COMPONENT_SPECS);
}
