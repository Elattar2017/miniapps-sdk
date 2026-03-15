#!/usr/bin/env node
/**
 * Enterprise Module SDK CLI
 * @module cli
 *
 * Commands:
 * - sdk init <name>     Scaffold a new module project
 * - sdk validate        Validate module manifest and screens
 * - sdk preview         Launch dev server for module preview
 * - sdk sign            Sign a module manifest with a private key
 */

import { initCommand } from './commands/init';
import { validateCommand } from './commands/validate';
import { previewCommand } from './commands/preview';
import { signCommand } from './commands/sign';

const HELP_TEXT = `
Enterprise Module SDK CLI

Usage:
  sdk <command> [options]

Commands:
  init <name> [--vendor]  Scaffold a new module project
  validate [dir]    Validate module manifest and screens
  preview [--port N] Launch dev server for module preview
  sign              Sign a module manifest with a private key

Options:
  --help, -h        Show this help message
  --version, -v     Show CLI version

Examples:
  sdk init my-module
  sdk validate ./my-module
  sdk preview
  sdk sign --key ./private.pem
  sdk sign --key ./private.pem --manifest ./my-module/manifest.json
`;

const VERSION = '1.0.0';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(`Enterprise Module SDK CLI v${VERSION}`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init': {
        const name = args[1];
        if (!name) {
          console.error('Error: Module name is required.');
          console.error('Usage: sdk init <name> [--vendor com.mycompany]');
          process.exit(1);
        }
        let initVendor: string | undefined;
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--vendor' && args[i + 1]) {
            initVendor = args[++i];
          }
        }
        await initCommand(name, initVendor);
        break;
      }

      case 'validate': {
        const dir = args[1];
        await validateCommand(dir);
        break;
      }

      case 'preview': {
        let previewPort: number | undefined;
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--port' && args[i + 1]) {
            previewPort = parseInt(args[++i], 10);
          }
        }
        await previewCommand(previewPort);
        break;
      }

      case 'sign': {
        const signOpts: { key?: string; manifest?: string } = {};
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--key' && args[i + 1]) {
            signOpts.key = args[++i];
          } else if (args[i] === '--manifest' && args[i + 1]) {
            signOpts.manifest = args[++i];
          }
        }
        signCommand(signOpts);
        break;
      }

      default:
        console.error(`Error: Unknown command "${command}".`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CLI Error: ${message}`);
    process.exit(1);
  }
}

main();
