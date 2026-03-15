/**
 * CryptoAdapter Hash Algorithm Test Suite
 *
 * Tests SHA-256, SHA-384, SHA-512 produce distinct correct-length hashes.
 */

import { CryptoAdapter } from '../../../src/kernel/identity/CryptoAdapter';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CryptoAdapter hash algorithms', () => {
  const adapter = new CryptoAdapter();

  it('SHA-256 returns 64-char hex string', async () => {
    const hash = await adapter.hash('hello', 'SHA-256');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('SHA-384 returns 96-char hex string', async () => {
    const hash = await adapter.hash('hello', 'SHA-384');
    expect(hash).toMatch(/^[0-9a-f]{96}$/);
  });

  it('SHA-512 returns 128-char hex string', async () => {
    const hash = await adapter.hash('hello', 'SHA-512');
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it('SHA-256 and SHA-384 produce different hashes', async () => {
    const h256 = await adapter.hash('hello', 'SHA-256');
    const h384 = await adapter.hash('hello', 'SHA-384');
    expect(h256).not.toBe(h384);
  });

  it('SHA-256 and SHA-512 produce different hashes', async () => {
    const h256 = await adapter.hash('hello', 'SHA-256');
    const h512 = await adapter.hash('hello', 'SHA-512');
    expect(h256).not.toBe(h512);
  });

  it('hash with single char returns valid hash', async () => {
    const hash = await adapter.hash('a', 'SHA-256');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
