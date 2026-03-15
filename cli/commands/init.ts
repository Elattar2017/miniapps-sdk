/**
 * SDK Init Command - Scaffolds a new module project
 * @module cli/commands/init
 *
 * Creates the directory structure and template files for a new SDK module.
 * Generated structure:
 *   <name>/
 *     manifest.json
 *     screens/
 *       home.screen.json
 *     assets/
 *       icon.png
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Scaffolds a new module project with the given name.
 *
 * Creates the following directory structure:
 * - `<name>/manifest.json` - Module manifest populated from template
 * - `<name>/screens/home.screen.json` - Default home screen schema
 * - `<name>/assets/icon.png` - Placeholder icon file
 *
 * @param name - The module name (used for directory and module ID generation)
 * @throws If the target directory already exists or file operations fail
 */
export async function initCommand(name: string, vendor?: string): Promise<void> {
  const projectDir = path.resolve(process.cwd(), name);

  // Check if directory already exists
  if (fs.existsSync(projectDir)) {
    throw new Error(
      `Directory "${name}" already exists. Choose a different name or remove the existing directory.`
    );
  }

  // Derive display name from module name (kebab-case to Title Case)
  const displayName = name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const vendorPrefix = vendor ?? 'com.vendor';
  const moduleId = `${vendorPrefix}.${name}`;

  console.log(`Creating module "${displayName}" (${moduleId})...`);

  // Create directory structure
  const screensDir = path.join(projectDir, 'screens');
  const assetsDir = path.join(projectDir, 'assets');

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(screensDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  // Read and populate manifest template
  const manifestTemplatePath = path.resolve(__dirname, '..', 'templates', 'manifest.template.json');
  let manifestContent: string;

  if (fs.existsSync(manifestTemplatePath)) {
    manifestContent = fs.readFileSync(manifestTemplatePath, 'utf-8');
  } else {
    // Fallback inline template if template file is not found
    manifestContent = JSON.stringify(
      {
        id: '{{MODULE_VENDOR}}.{{MODULE_NAME}}',
        name: '{{MODULE_DISPLAY_NAME}}',
        version: '1.0.0',
        description: 'A new SDK module',
        icon: 'assets/icon.png',
        category: 'utilities',
        entryScreen: 'home',
        screens: ['home'],
        permissions: {
          apis: [],
          storage: false,
        },
        minSDKVersion: '1.0.0',
        signature: '',
      },
      null,
      2
    );
  }

  manifestContent = manifestContent
    .replace(/\{\{MODULE_VENDOR\}\}/g, vendorPrefix)
    .replace(/\{\{MODULE_NAME\}\}/g, name)
    .replace(/\{\{MODULE_DISPLAY_NAME\}\}/g, displayName);

  fs.writeFileSync(path.join(projectDir, 'manifest.json'), manifestContent, 'utf-8');

  // Read and populate screen template
  const screenTemplatePath = path.resolve(__dirname, '..', 'templates', 'screen.template.json');
  let screenContent: string;

  if (fs.existsSync(screenTemplatePath)) {
    screenContent = fs.readFileSync(screenTemplatePath, 'utf-8');
  } else {
    // Fallback inline template if template file is not found
    screenContent = JSON.stringify(
      {
        id: 'home',
        title: '{{MODULE_DISPLAY_NAME}}',
        body: {
          type: 'column',
          gap: 16,
          children: [
            {
              type: 'text',
              value: 'Welcome to {{MODULE_DISPLAY_NAME}}',
              style: {
                fontSize: 24,
                fontWeight: 'bold',
                color: '$theme.colors.primary',
                textAlign: 'center',
                marginTop: 32,
              },
            },
            {
              type: 'text',
              value: 'Edit screens/home.screen.json to get started',
              style: {
                fontSize: 14,
                color: '$theme.colors.textSecondary',
                textAlign: 'center',
              },
            },
            {
              type: 'button',
              label: 'Get Started',
              variant: 'primary',
              onPress: {
                action: 'navigate',
                screen: 'home',
              },
              style: {
                marginTop: 24,
              },
            },
          ],
        },
      },
      null,
      2
    );
  }

  screenContent = screenContent.replace(/\{\{MODULE_DISPLAY_NAME\}\}/g, displayName);

  fs.writeFileSync(path.join(screensDir, 'home.screen.json'), screenContent, 'utf-8');

  // Create placeholder icon file
  fs.writeFileSync(
    path.join(assetsDir, 'icon.png'),
    '/* Placeholder: Replace with a 512x512 PNG icon for your module */',
    'utf-8'
  );

  // Log success
  console.log('');
  console.log(`Module "${displayName}" created successfully!`);
  console.log('');
  console.log('Project structure:');
  console.log(`  ${name}/`);
  console.log(`  ${name}/manifest.json`);
  console.log(`  ${name}/screens/`);
  console.log(`  ${name}/screens/home.screen.json`);
  console.log(`  ${name}/assets/`);
  console.log(`  ${name}/assets/icon.png`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. cd ${name}`);
  console.log('  2. Edit manifest.json to configure your module');
  console.log('  3. Edit screens/home.screen.json to build your UI');
  console.log('  4. Run "sdk validate" to check your module');
  console.log('  5. Run "sdk preview" to preview your module');
}
