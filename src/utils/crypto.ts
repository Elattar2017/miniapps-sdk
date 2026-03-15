/**
 * JS-side Crypto Helpers - Hashing, nonce generation, base64
 * @module utils/crypto
 */

/**
 * SHA-256 hash of a string.
 * Uses crypto.subtle when available, falls back to simple hash.
 */
export async function sha256(data: string): Promise<string> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest === 'function') {
      const encoder = new TextEncoder();
      const buffer = encoder.encode(data);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback below
  }

  // Simple hash fallback for environments without crypto.subtle
  return simpleHash(data);
}

/** Simple non-cryptographic hash for fallback (NOT for security use) */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Generate a cryptographic nonce (UUID v4) */
export function generateNonce(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Base64 encode a string */
export function base64Encode(data: string): string {
  if (typeof btoa === 'function') {
    return btoa(data);
  }
  // Node.js fallback
  return Buffer.from(data, 'utf-8').toString('base64');
}

/** Base64 decode a string */
export function base64Decode(encoded: string): string {
  if (typeof atob === 'function') {
    return atob(encoded);
  }
  // Node.js fallback
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/** Base64URL decode (JWT-compatible) */
export function base64UrlDecode(encoded: string): string {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return base64Decode(base64);
}
