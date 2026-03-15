/**
 * Crypto Utilities Test Suite
 *
 * Tests for sha256, generateNonce, base64Encode, base64Decode,
 * and base64UrlDecode helpers, including fallback behaviour when
 * Web Crypto API or browser globals are unavailable.
 */

import {
  sha256,
  generateNonce,
  base64Encode,
  base64Decode,
  base64UrlDecode,
} from '../../src/utils/crypto';

describe('crypto utilities', () => {
  // ---------------------------------------------------------------------------
  // sha256()
  // ---------------------------------------------------------------------------

  describe('sha256()', () => {
    it('with crypto.subtle available produces hex string', async () => {
      const result = await sha256('hello');
      expect(typeof result).toBe('string');
      // Should be hex characters only
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('produces consistent output for same input', async () => {
      const a = await sha256('test-data');
      const b = await sha256('test-data');
      expect(a).toBe(b);
    });

    it('different input produces different output', async () => {
      const a = await sha256('input-a');
      const b = await sha256('input-b');
      expect(a).not.toBe(b);
    });

    it('falls back to simpleHash when crypto.subtle unavailable', async () => {
      const originalCrypto = globalThis.crypto;
      // @ts-ignore - removing crypto for testing fallback
      delete globalThis.crypto;

      try {
        const result = await sha256('fallback-test');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        // Fallback produces hex string padded to at least 8 chars
        expect(result).toMatch(/^[0-9a-f]+$/);
      } finally {
        globalThis.crypto = originalCrypto;
      }
    });

    it('fallback produces consistent output', async () => {
      const originalCrypto = globalThis.crypto;
      // @ts-ignore
      delete globalThis.crypto;

      try {
        const a = await sha256('consistent');
        const b = await sha256('consistent');
        expect(a).toBe(b);
      } finally {
        globalThis.crypto = originalCrypto;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // generateNonce()
  // ---------------------------------------------------------------------------

  describe('generateNonce()', () => {
    it('produces UUID-format string (8-4-4-4-12)', () => {
      const nonce = generateNonce();
      // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
      expect(nonce).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('without crypto.randomUUID uses Math.random fallback', () => {
      const originalCrypto = globalThis.crypto;
      // Provide crypto without randomUUID
      // @ts-ignore
      globalThis.crypto = { subtle: originalCrypto?.subtle };

      try {
        const nonce = generateNonce();
        // Should still match UUID format (the fallback generates 4xxx pattern)
        expect(nonce).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      } finally {
        globalThis.crypto = originalCrypto;
      }
    });

    it('produces unique values across calls', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 50; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // base64Encode()
  // ---------------------------------------------------------------------------

  describe('base64Encode()', () => {
    it('encodes string correctly', () => {
      const result = base64Encode('Hello, World!');
      expect(result).toBe('SGVsbG8sIFdvcmxkIQ==');
    });

    it('without btoa uses Buffer fallback', () => {
      const originalBtoa = globalThis.btoa;
      // @ts-ignore
      delete globalThis.btoa;

      try {
        const result = base64Encode('Hello, World!');
        expect(result).toBe('SGVsbG8sIFdvcmxkIQ==');
      } finally {
        globalThis.btoa = originalBtoa;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // base64Decode()
  // ---------------------------------------------------------------------------

  describe('base64Decode()', () => {
    it('decodes string correctly', () => {
      const result = base64Decode('SGVsbG8sIFdvcmxkIQ==');
      expect(result).toBe('Hello, World!');
    });

    it('without atob uses Buffer fallback', () => {
      const originalAtob = globalThis.atob;
      // @ts-ignore
      delete globalThis.atob;

      try {
        const result = base64Decode('SGVsbG8sIFdvcmxkIQ==');
        expect(result).toBe('Hello, World!');
      } finally {
        globalThis.atob = originalAtob;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // base64UrlDecode()
  // ---------------------------------------------------------------------------

  describe('base64UrlDecode()', () => {
    it('converts URL-safe chars (-_) to standard (+/)', () => {
      // Base64URL encoded "subjects?_d" would use - and _
      // Standard base64 of "i??>" is "aT8/Pg==" while URL-safe is "aT8_Pg"
      const urlSafe = 'aT8_Pg';
      const result = base64UrlDecode(urlSafe);
      // The function converts _ to / and adds padding, then decodes
      const expected = base64Decode('aT8/Pg==');
      expect(result).toBe(expected);
    });

    it('adds correct padding', () => {
      // "Hello" in base64 is "SGVsbG8=" (length 8, padded)
      // In base64URL without padding: "SGVsbG8" (length 7, needs 1 pad char)
      const urlSafe = 'SGVsbG8';
      const result = base64UrlDecode(urlSafe);
      expect(result).toBe('Hello');
    });

    it('round-trips with base64Encode', () => {
      const original = 'test-data-for-roundtrip';
      const encoded = base64Encode(original);
      // Convert to URL-safe format
      const urlSafe = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const decoded = base64UrlDecode(urlSafe);
      expect(decoded).toBe(original);
    });
  });
});
