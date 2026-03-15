/**
 * AccountIdentifierManager Test Suite
 */

jest.mock('react-native');

import { AccountIdentifierManager } from '../../../src/kernel/identity/AccountIdentifierManager';
import type { ICryptoAdapter } from '../../../src/types';

function createMockCryptoAdapter(stored: Record<string, string> = {}): ICryptoAdapter {
  const storage: Record<string, string> = { ...stored };
  return {
    hash: jest.fn().mockResolvedValue('hashed'),
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('decrypted'),
    generateKey: jest.fn().mockResolvedValue('key'),
    verifySignature: jest.fn().mockResolvedValue(true),
    secureStore: jest.fn(async (key: string, value: string) => { storage[key] = value; }),
    secureRetrieve: jest.fn(async (key: string) => storage[key] ?? null),
    secureDelete: jest.fn(async (key: string) => { delete storage[key]; }),
  };
}

function createMockAPIProxy() {
  return {
    request: jest.fn().mockResolvedValue({
      ok: true, status: 200,
      data: { valid: true, active: true, tier: 'gold', isPrimary: true },
      headers: {}, latencyMs: 50,
    }),
    updateAuthToken: jest.fn(),
  };
}

function createMockDataBus() {
  return {
    publish: jest.fn(),
    subscribe: jest.fn().mockReturnValue(() => {}),
    unsubscribe: jest.fn(),
    getSubscriberCount: jest.fn().mockReturnValue(0),
    getChannels: jest.fn().mockReturnValue([]),
    publishScoped: jest.fn(),
    subscribeScoped: jest.fn(),
    clear: jest.fn(),
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

describe('AccountIdentifierManager', () => {
  describe('getActiveIdentifier', () => {
    it('returns stored identifier from crypto adapter', async () => {
      const crypto = createMockCryptoAdapter({ '__sdk_account_identifier__': '0501234567' });
      const mgr = new AccountIdentifierManager(crypto, createMockAPIProxy() as any);
      const result = await mgr.getActiveIdentifier();
      expect(result).toBe('0501234567');
    });

    it('returns cached value on second call', async () => {
      const crypto = createMockCryptoAdapter({ '__sdk_account_identifier__': '0501234567' });
      const mgr = new AccountIdentifierManager(crypto, createMockAPIProxy() as any);
      await mgr.getActiveIdentifier();
      await mgr.getActiveIdentifier();
      expect(crypto.secureRetrieve).toHaveBeenCalledTimes(1);
    });

    it('throws when no identifier stored', async () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      await expect(mgr.getActiveIdentifier()).rejects.toThrow('No active account identifier configured');
    });
  });

  describe('updateIdentifier', () => {
    it('validates via API, stores securely', async () => {
      const crypto = createMockCryptoAdapter();
      const api = createMockAPIProxy();
      const mgr = new AccountIdentifierManager(crypto, api as any);
      await mgr.updateIdentifier('0501234567');
      expect(api.request).toHaveBeenCalledWith('/api/accounts/validate', expect.objectContaining({
        method: 'POST', body: { identifier: '0501234567' },
      }));
      expect(crypto.secureStore).toHaveBeenCalledWith('__sdk_account_identifier__', '0501234567');
    });

    it('uses custom validateApiPath', async () => {
      const crypto = createMockCryptoAdapter();
      const api = createMockAPIProxy();
      const mgr = new AccountIdentifierManager(crypto, api as any, undefined, {
        validateApiPath: '/api/telecom/validate-number',
      });
      await mgr.updateIdentifier('0501234567');
      expect(api.request).toHaveBeenCalledWith('/api/telecom/validate-number', expect.any(Object));
    });

    it('publishes DataBus event', async () => {
      const dataBus = createMockDataBus();
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any, dataBus as any);
      await mgr.updateIdentifier('0501234567');
      expect(dataBus.publish).toHaveBeenCalledWith('sdk:account:identifier:changed', expect.objectContaining({
        newIdentifier: expect.any(String),
      }));
    });

    it('throws on invalid format when validationPattern is set', async () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any, undefined, {
        validationPattern: /^\+?\d{7,15}$/,
      });
      await expect(mgr.updateIdentifier('abc')).rejects.toThrow('Invalid identifier format');
    });

    it('skips format check when no validationPattern', async () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      // 'abc' would fail phone validation but should pass here (no pattern set)
      // It will still go through backend validation which succeeds in mock
      await expect(mgr.updateIdentifier('abc')).resolves.toBeUndefined();
    });

    it('throws on backend rejection', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: true, status: 200,
        data: { valid: false, active: false, isPrimary: false, error: { code: 'INACTIVE', message: 'Identifier is inactive' } },
        headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any);
      await expect(mgr.updateIdentifier('0501234567')).rejects.toThrow('Identifier is inactive');
    });
  });

  describe('validateIdentifier', () => {
    it('returns result from backend', async () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      const result = await mgr.validateIdentifier('0501234567');
      expect(result.valid).toBe(true);
      expect(result.tier).toBe('gold');
    });

    it('applies responseMapping to result', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: true, status: 200,
        data: { valid: true, active: true, plan: 'gold', isPrimary: true },
        headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any, undefined, {
        responseMapping: { plan: 'tier' },
      });
      const result = await mgr.validateIdentifier('0501234567');
      expect(result.tier).toBe('gold');
    });

    it('returns error result on API failure', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: false, status: 500, data: null, headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any);
      const result = await mgr.validateIdentifier('0501234567');
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('getAllIdentifiers', () => {
    it('returns array from backend', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: true, status: 200, data: [
        { identifier: '0501234567', isPrimary: true, tier: 'gold', active: true },
        { identifier: '0559876543', isPrimary: false, tier: 'prepaid', active: true },
      ], headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any);
      const result = await mgr.getAllIdentifiers();
      expect(result).toHaveLength(2);
      expect(result[0].identifier).toBe('0501234567');
    });

    it('uses custom listApiPath', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: true, status: 200, data: [], headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any, undefined, {
        listApiPath: '/api/telecom/service-numbers',
      });
      await mgr.getAllIdentifiers();
      expect(api.request).toHaveBeenCalledWith('/api/telecom/service-numbers', expect.any(Object));
    });

    it('applies responseMapping to array items', async () => {
      const api = createMockAPIProxy();
      api.request.mockResolvedValue({ ok: true, status: 200, data: [
        { number: '0501234567', isPrimary: true, plan: 'gold', active: true },
      ], headers: {}, latencyMs: 50 });
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any, undefined, {
        responseMapping: { number: 'identifier', plan: 'tier' },
      });
      const result = await mgr.getAllIdentifiers();
      expect(result[0].identifier).toBe('0501234567');
      expect(result[0].tier).toBe('gold');
    });

    it('returns empty array on error', async () => {
      const api = createMockAPIProxy();
      api.request.mockRejectedValue(new Error('Network error'));
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), api as any);
      const result = await mgr.getAllIdentifiers();
      expect(result).toEqual([]);
    });
  });

  describe('maskIdentifier', () => {
    it('masks 050-1234567 correctly', () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      expect(mgr.maskIdentifier('050-1234567')).toBe('050-****567');
    });

    it('masks 0501234567 middle digits', () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      expect(mgr.maskIdentifier('0501234567')).toBe('050****567');
    });

    it('returns original for short identifiers', () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      expect(mgr.maskIdentifier('123')).toBe('123');
    });
  });

  describe('isValidFormat', () => {
    it('returns true when no validationPattern (always valid)', () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any);
      expect(mgr.isValidFormat('anything')).toBe(true);
      expect(mgr.isValidFormat('')).toBe(true);
    });

    it('validates against configured pattern', () => {
      const mgr = new AccountIdentifierManager(createMockCryptoAdapter(), createMockAPIProxy() as any, undefined, {
        validationPattern: /^\+?\d{7,15}$/,
      });
      expect(mgr.isValidFormat('+971501234567')).toBe(true);
      expect(mgr.isValidFormat('050-1234567')).toBe(true);
      expect(mgr.isValidFormat('abc')).toBe(false);
      expect(mgr.isValidFormat('')).toBe(false);
      expect(mgr.isValidFormat('123456')).toBe(false);
    });
  });
});
