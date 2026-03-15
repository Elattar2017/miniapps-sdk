/**
 * SDK Validate Command - Validates module schemas
 * @module cli/commands/validate
 *
 * Validates the module manifest and all declared screen schemas
 * against the Enterprise Module SDK specification.
 *
 * Checks performed:
 * - Manifest exists and is valid JSON
 * - Required fields are present (id, name, version, entryScreen, screens)
 * - Module ID follows reverse domain notation
 * - Version follows semantic versioning
 * - All declared screens have corresponding .screen.json files
 * - Each screen JSON has required fields (id, title, body)
 */

import * as fs from 'fs';
import * as path from 'path';
import { COMPONENT_SPECS } from '../../../src/schema/ComponentSpecs';
import { ExpressionEngine } from '../../../src/schema/ExpressionEngine';
import { DEFAULT_DESIGN_TOKENS } from '../../../src/constants/defaults';

/** Validation result for a single check */
interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

/** Overall validation result */
interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Regex for reverse domain notation: e.g., com.vendor.my-module */
const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/;

/** Regex for semantic versioning: major.minor.patch with optional prerelease */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

/** Required top-level fields in manifest.json */
const REQUIRED_MANIFEST_FIELDS = ['id', 'name', 'version', 'entryScreen', 'screens'] as const;

/** Required fields in each screen JSON */
const REQUIRED_SCREEN_FIELDS = ['id', 'title', 'body'] as const;

/**
 * Validates a module's manifest and screen schemas.
 *
 * @param dir - Optional path to the module directory. Defaults to current working directory.
 * @throws Exits process with code 1 on validation failure
 */
export async function validateCommand(dir?: string): Promise<void> {
  const moduleDir = dir ? path.resolve(process.cwd(), dir) : process.cwd();
  const manifestPath = path.join(moduleDir, 'manifest.json');

  console.log(`Validating module at: ${moduleDir}`);
  console.log('');

  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // -------------------------------------------------------------------
  // 1. Check manifest.json exists
  // -------------------------------------------------------------------
  if (!fs.existsSync(manifestPath)) {
    result.errors.push({
      level: 'error',
      message: 'manifest.json not found. Run "sdk init <name>" to create a module.',
    });
    reportResults(result);
    return;
  }

  // -------------------------------------------------------------------
  // 2. Parse manifest.json
  // -------------------------------------------------------------------
  let manifest: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    result.errors.push({
      level: 'error',
      message: 'manifest.json is not valid JSON. Check for syntax errors.',
    });
    reportResults(result);
    return;
  }

  // -------------------------------------------------------------------
  // 3. Required fields
  // -------------------------------------------------------------------
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in manifest) || manifest[field] === undefined || manifest[field] === null) {
      result.errors.push({
        level: 'error',
        message: `Missing required field "${field}" in manifest.json.`,
      });
    }
  }

  // -------------------------------------------------------------------
  // 4. Module ID format (reverse domain notation)
  // -------------------------------------------------------------------
  if (typeof manifest.id === 'string') {
    if (!MODULE_ID_PATTERN.test(manifest.id)) {
      result.errors.push({
        level: 'error',
        message: `Module ID "${manifest.id}" does not follow reverse domain notation (e.g., com.vendor.module-name).`,
      });
    }
  }

  // -------------------------------------------------------------------
  // 5. Semver version
  // -------------------------------------------------------------------
  if (typeof manifest.version === 'string') {
    if (!SEMVER_PATTERN.test(manifest.version)) {
      result.errors.push({
        level: 'error',
        message: `Version "${manifest.version}" is not valid semver (expected: major.minor.patch).`,
      });
    }
  }

  // -------------------------------------------------------------------
  // 6. Screens array validation
  // -------------------------------------------------------------------
  const screens = manifest.screens;
  if (Array.isArray(screens)) {
    if (screens.length === 0) {
      result.warnings.push({
        level: 'warning',
        message: 'Module declares no screens. At least one screen is recommended.',
      });
    }

    // 6a. Check entryScreen is in screens list
    if (typeof manifest.entryScreen === 'string' && !screens.includes(manifest.entryScreen)) {
      result.errors.push({
        level: 'error',
        message: `Entry screen "${manifest.entryScreen}" is not listed in the screens array.`,
      });
    }

    // 6b. Validate each declared screen file
    const screensDir = path.join(moduleDir, 'screens');

    for (const screenName of screens) {
      if (typeof screenName !== 'string') {
        result.errors.push({
          level: 'error',
          message: `Screen entry must be a string, got ${typeof screenName}.`,
        });
        continue;
      }

      const screenFilePath = path.join(screensDir, `${screenName}.screen.json`);

      if (!fs.existsSync(screenFilePath)) {
        result.errors.push({
          level: 'error',
          message: `Screen file not found: screens/${screenName}.screen.json`,
        });
        continue;
      }

      // Parse and validate screen JSON
      try {
        const screenRaw = fs.readFileSync(screenFilePath, 'utf-8');
        const screenData = JSON.parse(screenRaw) as Record<string, unknown>;

        for (const field of REQUIRED_SCREEN_FIELDS) {
          if (
            !(field in screenData) ||
            screenData[field] === undefined ||
            screenData[field] === null
          ) {
            result.errors.push({
              level: 'error',
              message: `Screen "${screenName}": missing required field "${field}".`,
            });
          }
        }

        // Check screen ID matches filename
        if (typeof screenData.id === 'string' && screenData.id !== screenName) {
          result.warnings.push({
            level: 'warning',
            message: `Screen "${screenName}": id field "${screenData.id}" does not match filename. Expected "${screenName}".`,
          });
        }

        // Deep validation: check component props against COMPONENT_SPECS
        if (screenData.body && typeof screenData.body === 'object') {
          validateComponentProps(
            screenData.body as Record<string, unknown>,
            `Screen "${screenName}" > body`,
            result,
          );
        }

        // Expression syntax validation (Fix 8)
        validateExpressions(screenData, `Screen "${screenName}"`, result);

        // Action config validation (Fix 9)
        const screenScreens = manifest.screens as string[];
        validateActions(screenData, `Screen "${screenName}"`, result, screenScreens);

        // Prop type/enum validation (Fix 17)
        if (screenData.body && typeof screenData.body === 'object') {
          validatePropTypes(
            screenData.body as Record<string, unknown>,
            `Screen "${screenName}" > body`,
            result,
          );
        }

        // $theme.* path validation (Fix 18)
        if (screenData.body && typeof screenData.body === 'object') {
          validateThemePaths(
            screenData.body as Record<string, unknown>,
            `Screen "${screenName}" > body`,
            result,
          );
        }
      } catch {
        result.errors.push({
          level: 'error',
          message: `Screen "${screenName}": file is not valid JSON.`,
        });
      }
    }
  } else if (screens !== undefined) {
    result.errors.push({
      level: 'error',
      message: '"screens" field must be an array of screen names.',
    });
  }

  // -------------------------------------------------------------------
  // 7. Optional field warnings
  // -------------------------------------------------------------------
  if (!manifest.description || (typeof manifest.description === 'string' && manifest.description.trim() === '')) {
    result.warnings.push({
      level: 'warning',
      message: 'Module has no description. Consider adding one for the marketplace.',
    });
  }

  if (!manifest.signature || (typeof manifest.signature === 'string' && manifest.signature.trim() === '')) {
    result.warnings.push({
      level: 'warning',
      message: 'Module is not signed. A valid PKI signature is required for production.',
    });
  }

  // -------------------------------------------------------------------
  // 8. deviceCapabilities validation
  // -------------------------------------------------------------------
  const permissions = manifest.permissions as Record<string, unknown> | undefined;
  if (permissions && typeof permissions === 'object') {
    const deviceCaps = permissions.deviceCapabilities;
    if (deviceCaps !== undefined) {
      if (!Array.isArray(deviceCaps)) {
        result.errors.push({
          level: 'error',
          message: 'permissions.deviceCapabilities must be an array.',
        });
      } else {
        for (const cap of deviceCaps) {
          if (typeof cap !== 'string' || !VALID_DEVICE_CAPABILITIES.has(cap)) {
            result.errors.push({
              level: 'error',
              message: `permissions.deviceCapabilities contains invalid value "${String(cap)}". Valid values: ${Array.from(VALID_DEVICE_CAPABILITIES).join(', ')}.`,
            });
          }
        }
      }
    }

    // Warn if media actions are used but deviceCapabilities doesn't declare them
    if (Array.isArray(screens)) {
      const declaredCaps = new Set(Array.isArray(deviceCaps) ? deviceCaps as string[] : []);
      const screensDir = path.join(moduleDir, 'screens');
      const usesCamera = hasMediaAction(screensDir, screens as string[], 'capture_camera');
      const usesMediaPick = hasMediaAction(screensDir, screens as string[], 'media_pick');

      if (usesCamera && !declaredCaps.has('camera')) {
        result.warnings.push({
          level: 'warning',
          message: 'Module uses capture_camera action but does not declare "camera" in permissions.deviceCapabilities.',
        });
      }
      if (usesMediaPick && !declaredCaps.has('camera') && !declaredCaps.has('photo_library')) {
        result.warnings.push({
          level: 'warning',
          message: 'Module uses media_pick action but does not declare "camera" or "photo_library" in permissions.deviceCapabilities.',
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // Report results
  // -------------------------------------------------------------------
  reportResults(result);
}

/**
 * Recursively validates a schema node and its children against COMPONENT_SPECS.
 *
 * For each node, checks:
 * - Whether the component type exists in COMPONENT_SPECS
 * - Whether all required props (per the spec) are present on the node
 *
 * Props are checked both in the node's `props` object and as direct
 * properties on the node (the SchemaNode type uses both conventions).
 *
 * @param node   The schema node object to validate
 * @param path   Human-readable path for error messages
 * @param result The ValidationResult to append issues to
 */
function validateComponentProps(
  node: Record<string, unknown>,
  nodePath: string,
  result: ValidationResult,
): void {
  const nodeType = node['type'];
  if (!nodeType || typeof nodeType !== 'string') {
    return;
  }

  const spec = COMPONENT_SPECS[nodeType];

  if (!spec) {
    // Unknown component type - report as error
    result.errors.push({
      level: 'error',
      message: `${nodePath}: unknown component type "${nodeType}". Valid types: ${Object.keys(COMPONENT_SPECS).join(', ')}`,
    });
  } else {
    // Check required props
    const nodeProps = (node['props'] ?? {}) as Record<string, unknown>;

    for (const [propName, propSpec] of Object.entries(spec.props)) {
      if (!propSpec.required) continue;

      const fromProps = nodeProps[propName];
      const fromNode = node[propName];

      const hasValue =
        (fromProps !== undefined && fromProps !== null) ||
        (fromNode !== undefined && fromNode !== null);

      if (!hasValue) {
        result.errors.push({
          level: 'error',
          message: `${nodePath}: component "${nodeType}" is missing required prop "${propName}".`,
        });
      }
    }
  }

  // Recurse into children
  if (Array.isArray(node['children'])) {
    const children = node['children'] as Record<string, unknown>[];
    for (let i = 0; i < children.length; i++) {
      if (children[i] && typeof children[i] === 'object') {
        validateComponentProps(
          children[i],
          `${nodePath} > ${nodeType}[${i}]`,
          result,
        );
      }
    }
  }

  // Recurse into repeater template
  if (node['template'] && typeof node['template'] === 'object') {
    validateComponentProps(
      node['template'] as Record<string, unknown>,
      `${nodePath} > ${nodeType}.template`,
      result,
    );
  }
}

/** Valid action types for action config validation */
const VALID_ACTION_TYPES = new Set([
  'navigate', 'go_back', 'api_call', 'api_submit', 'update_state',
  'emit_intent', 'validate', 'analytics', 'track_screen_view',
  'track_interaction', 'show_loading', 'hide_loading', 'show_toast', 'run_action',
  'media_pick', 'capture_camera',
]);

/** Valid device capabilities for manifest permissions.deviceCapabilities */
const VALID_DEVICE_CAPABILITIES = new Set(['camera', 'photo_library']);

/**
 * Validate ${...} expressions in a screen schema for syntax correctness.
 * (Fix 8)
 */
function validateExpressions(
  obj: unknown,
  pathPrefix: string,
  result: ValidationResult,
  currentPath: string = '',
): void {
  if (typeof obj === 'string') {
    const expressionPattern = /\$\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = expressionPattern.exec(obj)) !== null) {
      const engine = new ExpressionEngine();
      const validation = engine.validate(match[1]);
      if (!validation.valid) {
        result.errors.push({
          level: 'error',
          message: `${pathPrefix}${currentPath}: expression "\${${match[1]}}" has syntax error: ${validation.error}`,
        });
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      validateExpressions(obj[i], pathPrefix, result, `${currentPath}[${i}]`);
    }
    return;
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      validateExpressions(value, pathPrefix, result, currentPath ? `${currentPath}.${key}` : `.${key}`);
    }
  }
}

/**
 * Validate action configs in a screen schema.
 * Checks: action type is valid, navigate targets exist, api_submit has api.
 * (Fix 9)
 */
function validateActions(
  obj: unknown,
  pathPrefix: string,
  result: ValidationResult,
  declaredScreens: string[],
  currentPath: string = '',
): void {
  if (!obj || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;

  // Check if this object is an action config
  if (typeof record['action'] === 'string') {
    const actionType = record['action'] as string;
    const fullPath = `${pathPrefix}${currentPath}`;

    if (!VALID_ACTION_TYPES.has(actionType)) {
      result.errors.push({
        level: 'error',
        message: `${fullPath}: unknown action type "${actionType}".`,
      });
    }

    if (actionType === 'navigate' && typeof record['screen'] === 'string') {
      if (!declaredScreens.includes(record['screen'] as string)) {
        result.warnings.push({
          level: 'warning',
          message: `${fullPath}: navigate targets screen "${record['screen']}" which is not in the manifest screens array.`,
        });
      }
    }

    if (actionType === 'api_submit' && !record['api']) {
      result.errors.push({
        level: 'error',
        message: `${fullPath}: api_submit action requires an "api" field.`,
      });
    }

    // Validate transition enum on navigate actions
    if (actionType === 'navigate' && record['transition'] !== undefined) {
      const validTransitions = new Set(['slide', 'fade', 'none', 'modal']);
      if (!validTransitions.has(record['transition'] as string)) {
        result.errors.push({
          level: 'error',
          message: `${fullPath}: invalid transition "${record['transition']}". Must be one of: slide, fade, none, modal.`,
        });
      }
    }
  }

  // Recurse
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        validateActions(value[i], pathPrefix, result, declaredScreens, `${currentPath}.${key}[${i}]`);
      }
    } else if (value && typeof value === 'object') {
      validateActions(value, pathPrefix, result, declaredScreens, `${currentPath}.${key}`);
    }
  }
}

/**
 * Validate prop values against COMPONENT_SPECS type and enum constraints.
 * (Fix 17)
 */
function validatePropTypes(
  node: Record<string, unknown>,
  nodePath: string,
  result: ValidationResult,
): void {
  const nodeType = node['type'];
  if (!nodeType || typeof nodeType !== 'string') return;

  const spec = COMPONENT_SPECS[nodeType];
  if (!spec) return;

  const nodeProps = (node['props'] ?? {}) as Record<string, unknown>;

  for (const [propName, propSpec] of Object.entries(spec.props)) {
    const value = nodeProps[propName] ?? node[propName];
    if (value === undefined || value === null) continue;

    // Type check (skip for expressions)
    if (typeof value === 'string' && value.includes('${')) continue;

    if (propSpec.type === 'string' && typeof value !== 'string') {
      result.warnings.push({
        level: 'warning',
        message: `${nodePath}: prop "${propName}" on "${nodeType}" expects string, got ${typeof value}.`,
      });
    }
    if (propSpec.type === 'number' && typeof value !== 'number') {
      result.warnings.push({
        level: 'warning',
        message: `${nodePath}: prop "${propName}" on "${nodeType}" expects number, got ${typeof value}.`,
      });
    }
    if (propSpec.type === 'boolean' && typeof value !== 'boolean') {
      result.warnings.push({
        level: 'warning',
        message: `${nodePath}: prop "${propName}" on "${nodeType}" expects boolean, got ${typeof value}.`,
      });
    }

    // Enum check
    if (propSpec.enum && typeof value === 'string') {
      if (!propSpec.enum.includes(value)) {
        result.errors.push({
          level: 'error',
          message: `${nodePath}: prop "${propName}" on "${nodeType}" has invalid value "${value}". Allowed: ${propSpec.enum.join(', ')}.`,
        });
      }
    }
  }

  // Recurse
  if (Array.isArray(node['children'])) {
    const children = node['children'] as Record<string, unknown>[];
    for (let i = 0; i < children.length; i++) {
      if (children[i] && typeof children[i] === 'object') {
        validatePropTypes(children[i], `${nodePath} > ${nodeType}[${i}]`, result);
      }
    }
  }
  if (node['template'] && typeof node['template'] === 'object') {
    validatePropTypes(node['template'] as Record<string, unknown>, `${nodePath} > ${nodeType}.template`, result);
  }
}

/**
 * Validate $theme.* paths against DEFAULT_DESIGN_TOKENS structure.
 * (Fix 18)
 */
function validateThemePaths(
  node: Record<string, unknown>,
  nodePath: string,
  result: ValidationResult,
): void {
  const nodeType = node['type'] ?? '';

  // Check style values
  const style = node['style'] as Record<string, unknown> | undefined;
  if (style && typeof style === 'object') {
    for (const [key, value] of Object.entries(style)) {
      if (typeof value === 'string' && value.startsWith('$theme.')) {
        const path = value.slice('$theme.'.length);
        if (!walkTokenPath(DEFAULT_DESIGN_TOKENS, path)) {
          result.warnings.push({
            level: 'warning',
            message: `${nodePath}: style "${key}" references "${value}" which does not exist in design tokens.`,
          });
        }
      }
    }
  }

  // Recurse
  if (Array.isArray(node['children'])) {
    const children = node['children'] as Record<string, unknown>[];
    for (let i = 0; i < children.length; i++) {
      if (children[i] && typeof children[i] === 'object') {
        validateThemePaths(children[i], `${nodePath} > ${nodeType}[${i}]`, result);
      }
    }
  }
  if (node['template'] && typeof node['template'] === 'object') {
    validateThemePaths(node['template'] as Record<string, unknown>, `${nodePath} > ${nodeType}.template`, result);
  }
}

/** Walk a dot-separated path on an object, return true if the leaf exists */
function walkTokenPath(obj: unknown, dotPath: string): boolean {
  const parts = dotPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined;
}

/**
 * Checks if any screen file contains a specific media action type.
 */
function hasMediaAction(screensDir: string, screenNames: string[], actionType: string): boolean {
  for (const name of screenNames) {
    if (typeof name !== 'string') continue;
    const filePath = path.join(screensDir, `${name}.screen.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw.includes(`"${actionType}"`)) return true;
    } catch {
      // File may not exist — already reported elsewhere
    }
  }
  return false;
}

/**
 * Reports validation results to the console and sets the exit code.
 *
 * @param result - The accumulated validation result
 */
function reportResults(result: ValidationResult): void {
  const hasErrors = result.errors.length > 0;

  if (hasErrors) {
    result.valid = false;
  }

  // Print errors
  for (const issue of result.errors) {
    console.error(`  ERROR: ${issue.message}`);
  }

  // Print warnings
  for (const issue of result.warnings) {
    console.warn(`  WARNING: ${issue.message}`);
  }

  console.log('');

  if (result.valid) {
    console.log(
      `Validation passed. ${result.warnings.length} warning(s).`
    );
  } else {
    console.error(
      `Validation failed. ${result.errors.length} error(s), ${result.warnings.length} warning(s).`
    );
    process.exit(1);
  }
}
