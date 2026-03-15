/**
 * SDK Preview Command - Launches dev server for module preview
 * @module cli/commands/preview
 *
 * Starts a Fastify dev server, reads the module from the current directory,
 * auto-publishes it to the server, and keeps the process running until Ctrl+C.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { createDevServer } from '../../dev-server/index';

/** Default port for the preview server */
const DEFAULT_PREVIEW_PORT = 3456;

/**
 * Launches the dev server for module preview.
 *
 * Reads the module manifest and screen files from the current directory,
 * starts the Fastify dev server, publishes the module bundle, and keeps
 * the process running until the user presses Ctrl+C.
 *
 * @param port - Optional port number (default: 3456)
 */
export async function previewCommand(port?: number): Promise<void> {
  const serverPort = port ?? DEFAULT_PREVIEW_PORT;
  const moduleDir = process.cwd();
  const manifestPath = path.join(moduleDir, 'manifest.json');

  // Verify we are inside a module directory
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: No manifest.json found in the current directory.');
    console.error('Make sure you are inside a module project directory.');
    console.error('');
    console.error('To create a new module, run:');
    console.error('  sdk init <module-name>');
    process.exit(1);
  }

  // -------------------------------------------------------------------
  // 1. Read the manifest
  // -------------------------------------------------------------------
  let manifest: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to read manifest.json: ${message}`);
    process.exit(1);
  }

  const moduleName = typeof manifest.name === 'string' ? manifest.name : 'module';
  const moduleId = typeof manifest.id === 'string' ? manifest.id : 'unknown';

  // -------------------------------------------------------------------
  // 2. Read all screen files
  // -------------------------------------------------------------------
  const screens: Record<string, unknown> = {};
  const screensDir = path.join(moduleDir, 'screens');
  const screensList = Array.isArray(manifest.screens) ? (manifest.screens as string[]) : [];

  for (const screenName of screensList) {
    const screenFilePath = path.join(screensDir, `${screenName}.screen.json`);

    if (!fs.existsSync(screenFilePath)) {
      console.warn(`Warning: Screen file not found: screens/${screenName}.screen.json`);
      continue;
    }

    try {
      const screenRaw = fs.readFileSync(screenFilePath, 'utf-8');
      screens[screenName] = JSON.parse(screenRaw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Failed to parse screen "${screenName}": ${message}`);
    }
  }

  // -------------------------------------------------------------------
  // 3. Start the dev server
  // -------------------------------------------------------------------
  console.log('Enterprise Module SDK - Preview Server');
  console.log(`Module: ${moduleName} (${moduleId})`);
  console.log('');

  const server = createDevServer();

  try {
    await server.listen({ port: serverPort, host: '0.0.0.0' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Failed to start dev server on port ${serverPort}: ${message}`);
    process.exit(1);
  }

  const serverUrl = `http://localhost:${serverPort}`;
  console.log(`Dev server started at: ${serverUrl}`);

  // Wire up hot reload file watcher
  const hotReload = (server as any).hotReload;
  if (hotReload && typeof hotReload.setupFileWatcher === 'function') {
    hotReload.setupFileWatcher(moduleDir);
    console.log('Hot reload: watching for file changes...');
  }

  console.log('');

  // -------------------------------------------------------------------
  // 4. Auto-publish the module to the dev server
  // -------------------------------------------------------------------
  const bundle = {
    manifest,
    screens,
  };

  try {
    const publishResult = await postJson(`${serverUrl}/api/modules/publish`, bundle);

    if (publishResult.ok) {
      console.log(`Module "${moduleName}" published successfully.`);
      console.log(`  ID:      ${moduleId}`);
      console.log(`  Version: ${manifest.version ?? 'unknown'}`);
      console.log(`  Screens: ${screensList.length}`);
    } else {
      console.warn(`Warning: Module publish returned status ${publishResult.status}.`);
      if (publishResult.body) {
        const parsed = JSON.parse(publishResult.body) as Record<string, unknown>;
        if (Array.isArray(parsed.errors)) {
          for (const error of parsed.errors) {
            console.warn(`  - ${error}`);
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Failed to auto-publish module: ${message}`);
  }

  // -------------------------------------------------------------------
  // 5. Print useful information
  // -------------------------------------------------------------------
  console.log('');
  console.log('Available endpoints:');
  console.log(`  Module list:  GET  ${serverUrl}/api/modules`);
  console.log(`  Manifest:     GET  ${serverUrl}/api/modules/${moduleId}/manifest`);
  for (const screenName of screensList) {
    console.log(`  Screen:       GET  ${serverUrl}/api/modules/${moduleId}/screens/${screenName}`);
  }
  console.log(`  Health:       GET  ${serverUrl}/api/health`);
  console.log('');
  console.log('Press Ctrl+C to stop the server.');

  // -------------------------------------------------------------------
  // 6. Keep the process running until Ctrl+C
  // -------------------------------------------------------------------
  await new Promise<void>((resolve) => {
    const shutdown = async () => {
      console.log('\nShutting down preview server...');
      await server.close();
      resolve();
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  });
}

/**
 * POST JSON data to a URL using Node.js built-in http module.
 *
 * @param url  The URL to POST to
 * @param data The JSON data to send
 * @returns An object with the HTTP status, ok boolean, and response body
 */
function postJson(
  url: string,
  data: unknown,
): Promise<{ status: number; ok: boolean; body: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        const status = res.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          body: responseBody,
        });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
