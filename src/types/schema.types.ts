/**
 * Schema Types - Screen schemas, component tree, data sources, actions, validation
 * @module types/schema
 */

/** Screen schema - one JSON file per screen */
export interface ScreenSchema {
  id: string;
  title: string;
  body: SchemaNode;
  dataSources?: Record<string, DataSourceConfig>;
  actions?: Record<string, ActionConfig[]>;
  validation?: Record<string, ValidationRule[]>;
  onLoad?: ActionConfig[];
  /** Per-screen header configuration (overrides module-level navigation settings) */
  header?: ScreenHeaderConfig;
}

/** Per-screen header configuration */
export interface ScreenHeaderConfig {
  /** Override header visibility for this screen */
  visible?: boolean;
  /** Override header title (supports $t() expressions) */
  title?: string;
  /** Whether back button is visible (default true, set false on entry screens) */
  backVisible?: boolean;
}

/** A single node in the component tree */
export interface SchemaNode {
  type: string;
  id?: string;
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  children?: SchemaNode[];
  visible?: string;

  // Event handlers
  onPress?: ActionConfig;
  onChange?: ActionConfig;
  onBlur?: ActionConfig;
  onFocus?: ActionConfig;
  onLoad?: ActionConfig;
  onError?: ActionConfig;
  onScroll?: ActionConfig;
  onToggle?: ActionConfig;

  // Accessibility overrides
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';

  // Data components (repeater)
  dataSource?: string;
  template?: SchemaNode;
  emptyMessage?: string;

  // Input/display components
  value?: string;
  placeholder?: string;
  label?: string;
  numberOfLines?: number;

  // Image component
  source?: string;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  alt?: string;
  width?: number | string;
  height?: number | string;

  // Layout components
  gap?: number;
  padding?: number;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  wrap?: boolean;
  direction?: 'vertical' | 'horizontal' | 'down' | 'up' | 'bounce';
  showIndicator?: boolean;
  maxHeight?: number;
  borderRadius?: number;
  edges?: string[];

  // Action components
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'filled' | 'outlined' | 'default' | 'bordered' | 'separated' | 'pills' | 'underline';
  disabled?: string;
  loading?: string;
  fullWidth?: boolean;

  // Badge component (enhanced)
  icon?: string;
  iconPosition?: 'left' | 'right';
  selectable?: boolean;
  groupId?: string;
  activeColor?: string;
  activeVariant?: 'filled' | 'outlined';

  // Accordion components
  title?: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  allowMultiple?: boolean;

  // Tab navigator components
  activeTab?: string | number;
  scrollable?: boolean;
  badge?: string | number;
  onTabChange?: ActionConfig;

  // Loading component (enhanced)
  loadingVariant?: 'spinner' | 'progress' | 'overlay' | 'skeleton';
  loadingText?: string;
  progress?: string | number;
  loadingDirection?: 'vertical' | 'horizontal';
  indeterminate?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  showPercent?: boolean;
  skeletonPreset?: 'list-item' | 'card' | 'profile' | 'paragraph' | 'custom';
  skeletonRows?: number;
  skeletonAvatar?: boolean;
  skeletonAvatarSize?: number;
  skeletonGap?: number;
  skeletonLayout?: SkeletonShape[];

  // Visual components
  color?: string;
  size?: number | 'sm' | 'md' | 'lg';
  thickness?: number;
  elevation?: number;
  name?: string;

  // Table component (TableColumn[]) / Grid overlay (number)
  columns?: TableColumn[] | number;
  data?: Record<string, unknown>[] | string;
  maxRows?: number;

  // Select component
  options?: SelectOption[];

  // Chart component
  chartType?: 'bar' | 'line' | 'pie' | 'donut' | 'gauge';
  chartData?: unknown[] | string;
  chartLabel?: string;
  chartValue?: string;

  // Chart component (multi-series)
  chartSeries?: ChartSeriesConfig[];
  chartYAxis?: ChartAxisConfig;
  chartXAxis?: ChartAxisConfig;
  chartAnnotations?: ChartAnnotation[];
  chartShowLegend?: boolean;
  chartShowGrid?: boolean;
  chartTitle?: string;

  // Chart component (enhanced)
  chartHeight?: number;
  chartFill?: boolean;
  chartSmooth?: boolean;
  chartStacked?: boolean;
  chartShowValues?: boolean;
  chartOrientation?: 'horizontal' | 'vertical';

  // Gauge chart
  gaugeValue?: number | string;
  gaugeMax?: number | string;
  gaugeUnit?: string;
  gaugeThresholds?: ChartGaugeThreshold[];

  // Chart color
  chartColor?: string;
  chartColorScheme?: 'default' | 'vibrant' | 'pastel' | 'monochrome' | 'warm' | 'cool';

  // Chart entrance animation
  entranceAnimation?: 'none' | 'fade' | 'scale' | 'slide-up';
  animationDuration?: number;
  animationDelay?: number;

  // Chart interactivity
  onChartPress?: Record<string, unknown>;

  // Camera view component
  cameraFacing?: string;      // 'front' | 'back' — supports expressions
  shape?: 'circle' | 'square' | 'rounded';
  mirror?: boolean;           // Mirror the camera feed (auto for front camera)

  // Overlay components (scan_frame, corner_brackets, face_guide, grid_overlay, crosshair, scan_line)
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  inset?: number;
  aspectRatio?: string;       // e.g. '3:2' for ID cards
  labelColor?: string;
  bracketSize?: number;
  bracketThickness?: number;
  bracketColor?: string;
  animated?: boolean;
  guideColor?: string;
  guideWidth?: number;
  labelPosition?: 'top' | 'bottom';
  rows?: number;
  gridColor?: string;
  gridWidth?: number;
  showCircle?: boolean;
  circleRadius?: number;
  lineColor?: string;
  lineWidth?: number;
  speed?: 'slow' | 'medium' | 'fast';
  glowEffect?: boolean;

  // Bottom sheet component
  isOpen?: string;            // Expression → boolean controlling visibility
  sheetHeight?: string;       // '50%', 'auto', etc.
  showHandle?: boolean;       // Drag handle indicator (default: true)
  dismissable?: boolean;      // Backdrop/back dismisses (default: true)
  onDismiss?: ActionConfig;   // Fired on backdrop tap / back button
}

/** Configuration for a single chart data series */
export interface ChartSeriesConfig {
  key: string;
  label: string;
  color?: string;
}

/** Chart axis configuration */
export interface ChartAxisConfig {
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  ticks?: number;
}

/** Data point annotation/callout */
export interface ChartAnnotation {
  seriesIndex: number;
  dataIndex: number;
  label: string;
}

/** Gauge chart threshold color configuration */
export interface ChartGaugeThreshold {
  value: number;
  color: string;
}

/** Skeleton placeholder shape configuration for loading component */
export interface SkeletonShape {
  shape: 'rect' | 'circle' | 'text';
  width?: number | string;
  height?: number;
  size?: number;
  lines?: number;
  spacing?: number;
}

/** Table column configuration */
export interface TableColumn {
  key: string;
  label: string;
  /** Alternative to label — screen builder may use 'header' instead */
  header?: string;
  width?: number;
  sortable?: boolean;
  /** Column cell type: text (default), button, or icon */
  type?: 'text' | 'button' | 'icon';
  /** Action dispatched when a button or icon cell is pressed */
  onPress?: ActionConfig;
  /** Label text for button-type columns */
  buttonLabel?: string;
  /** Icon name for icon-type columns */
  iconName?: string;
  /** Icon color for icon-type columns */
  iconColor?: string;
}

/** Select option configuration */
export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

/** Data source cache policy */
export type DataSourceCachePolicy = 'cache-first' | 'network-first' | 'no-cache';

/** Data source configuration */
export interface DataSourceConfig {
  api: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: Record<string, string>;
  headers?: Record<string, string>;
  transform?: string;
  body?: Record<string, unknown>;
  cache?: {
    ttl: number;
    strategy: 'memory' | 'storage';
  };
  cachePolicy?: DataSourceCachePolicy;
}

/** Screen transition animation types for navigate actions */
export type ScreenTransition = 'slide' | 'fade' | 'none' | 'modal';

/** Action configuration */
export interface ActionConfig {
  action: ActionType;
  screen?: string;
  /** Parameters passed to navigate target screen (merged into module state) */
  params?: Record<string, unknown>;
  /** Screen transition animation (slide, fade, none, modal). Default: slide */
  transition?: ScreenTransition;
  /** Reference to a named action sequence defined in ScreenSchema.actions */
  ref?: string;
  dataSource?: string;
  key?: string;
  value?: unknown;
  channel?: string;
  payload?: Record<string, unknown>;
  event?: string;
  fields?: string[];
  condition?: string;
  api?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  bodyTemplate?: Record<string, unknown>;
  /** Where to store the API response in $data (e.g. "submitResult" → $data.submitResult) */
  responseKey?: string;
  /** Callback(s) on api_submit success */
  onSuccess?: ActionConfig | ActionConfig[];
  /** Callback(s) on api_submit error */
  onError?: ActionConfig | ActionConfig[];
  /** Callback(s) when validate passes — replaces the old screen-only approach */
  onValid?: ActionConfig | ActionConfig[];
  /** Callback(s) when validate fails */
  onInvalid?: ActionConfig | ActionConfig[];
  // Toast fields
  message?: string;
  title?: string;
  toastVariant?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;

  // ── media_pick fields ──
  /** Media source: system camera, photo library, or user choice */
  mediaSource?: 'camera' | 'photo_library' | 'camera_or_library';
  /** MIME filter (default 'image/*') */
  mediaAccept?: string;
  /** Max file size in bytes */
  mediaMaxSize?: number;
  /** Max dimension in px — auto-resize if larger */
  mediaMaxDimension?: number;
  /** JPEG compression quality 0.0-1.0 */
  mediaQuality?: number;
  /** Include base64 string in result */
  mediaIncludeBase64?: boolean;
  /** Allow multi-select (library only) */
  mediaMultiple?: boolean;
  /** Max items when multiple */
  mediaMaxCount?: number;

  // ── capture_camera fields ──
  /** ID of camera_view component to capture from */
  cameraId?: string;

  // ── storage config (media_pick + capture_camera) ──
  mediaStorage?: MediaStorageConfig;
}

/** Media storage configuration — declared per action in schema */
export interface MediaStorageConfig {
  /** 'temp' = cache dir (cleared on restart), 'persistent' = encrypted module storage */
  location: 'temp' | 'persistent';
  /** true = keep until explicitly deleted or maxAge expires */
  persist: boolean;
  /** Auto-cleanup after N seconds (0 = no auto-cleanup) */
  maxAge?: number;
}

/** Result of a media capture or pick operation */
export interface MediaResult {
  uri: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  timestamp: number;
  base64?: string;
}

/** Supported action types */
export type ActionType =
  | 'navigate'
  | 'go_back'
  | 'api_call'
  | 'api_submit'
  | 'update_state'
  | 'emit_intent'
  | 'validate'
  | 'analytics'
  | 'track_screen_view'
  | 'track_interaction'
  | 'show_loading'
  | 'hide_loading'
  | 'show_toast'
  | 'run_action'
  | 'media_pick'
  | 'capture_camera';

/** Validation rule */
export interface ValidationRule {
  rule: ValidationRuleType;
  value?: unknown;
  message?: string;
}

/** Supported validation rule types */
export type ValidationRuleType =
  | 'required'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'email'
  | 'phone'
  | 'numeric'
  | 'custom';
