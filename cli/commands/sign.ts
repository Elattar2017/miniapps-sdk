/**
 * CLI Sign Command - Sign module manifests with PKI key
 * @module cli/commands/sign
 *
 * Computes an RSA-SHA256 signature over the module's core fields
 * (id, version, screens) and writes the signature back into the
 * manifest file.
 *
 * Usage:
 *   sdk sign --key <path-to-pem>
 *   sdk sign --manifest ./path/to/manifest.json --key ./key.pem
 *   SDK_SIGN_KEY=./key.pem sdk sign
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface SignOptions {
  key?: string;
  manifest?: string;
}

/**
 * Sign a module manifest with a private key.
 *
 * 1. Reads the manifest JSON (from --manifest or ./manifest.json)
 * 2. Reads the PEM private key (from --key or SDK_SIGN_KEY env var)
 * 3. Computes RSA-SHA256 signature over { id, version, screens }
 * 4. Writes the signature field back into the manifest file
 * 5. Prints a fingerprint (first 16 hex chars of SHA-256 of signature)
 *
 * @param options - key and manifest path overrides
 */
export function signCommand(options: SignOptions): void {
  const manifestPath = options.manifest ?? path.join(process.cwd(), 'manifest.json');

  // 1. Read manifest
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: Manifest not found at ${manifestPath}`);
    console.error('Run "sdk init" first or specify --manifest path');
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(manifestContent) as Record<string, unknown>;
  } catch {
    console.error('Error: Invalid JSON in manifest file');
    process.exit(1);
  }

  // 2. Get private key
  const keyPath = options.key ?? process.env['SDK_SIGN_KEY'];
  if (!keyPath) {
    console.error('Error: No signing key provided');
    console.error('Use --key <path> or set SDK_SIGN_KEY environment variable');
    process.exit(1);
  }

  let privateKey: string;
  try {
    privateKey = fs.readFileSync(keyPath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read key file at ${keyPath}`);
    process.exit(1);
  }

  // 3. Compute content hash over core fields (including permissions, entryScreen, minSDKVersion)
  const contentToSign = JSON.stringify({
    id: manifest['id'],
    version: manifest['version'],
    screens: manifest['screens'],
    permissions: manifest['permissions'],
    entryScreen: manifest['entryScreen'],
    minSDKVersion: manifest['minSDKVersion'],
  });

  // 4. Sign with RSA-SHA256
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(contentToSign);
    const signature = signer.sign(privateKey, 'base64');

    // Write signature to manifest
    manifest['signature'] = signature;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    const fingerprint = crypto
      .createHash('sha256')
      .update(signature)
      .digest('hex')
      .substring(0, 16);

    console.log('Module signed successfully');
    console.log(`  Manifest: ${manifestPath}`);
    console.log(`  Fingerprint: ${fingerprint}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: Signing failed - ${message}`);
    process.exit(1);
  }
}
