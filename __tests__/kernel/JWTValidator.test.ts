/**
 * JWTValidator Test Suite
 * Tests JWT decoding, validation, expiry checking, and required claim enforcement.
 */

import { JWTValidator } from '../../src/kernel/identity/JWTValidator';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Create a mock JWT token with the given claims */
function createMockJWT(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

/** Standard valid claims for convenience */
function validClaims(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    sub: 'user-1',
    iss: 'test-issuer',
    aud: 'sdk',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    tenantId: 'tenant-1',
    ...overrides,
  };
}

describe('JWTValidator', () => {
  let validator: JWTValidator;

  beforeEach(() => {
    validator = new JWTValidator();
  });

  describe('decode', () => {
    it('should decode a valid JWT', () => {
      const token = createMockJWT(validClaims());
      const decoded = validator.decode(token);

      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.header.typ).toBe('JWT');
      expect(decoded.payload.sub).toBe('user-1');
      expect(decoded.payload.tenantId).toBe('tenant-1');
      expect(decoded.signature).toBe('mock-signature');
    });

    it('should reject invalid format (wrong number of segments)', () => {
      expect(() => validator.decode('only-one-part')).toThrow('expected 3 parts');
      expect(() => validator.decode('two.parts')).toThrow('expected 3 parts');
      expect(() => validator.decode('a.b.c.d')).toThrow('expected 3 parts');
    });

    it('should reject empty or non-string token', () => {
      expect(() => validator.decode('')).toThrow('non-empty string');
    });
  });

  describe('validate', () => {
    it('should validate a valid JWT', () => {
      const token = createMockJWT(validClaims());
      const result = validator.validate(token);

      expect(result.valid).toBe(true);
      expect(result.claims).toBeDefined();
      expect(result.claims?.sub).toBe('user-1');
      expect(result.error).toBeUndefined();
    });

    it('should reject an expired token', () => {
      const token = createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 3600 }),
      );
      const result = validator.validate(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject missing required claims', () => {
      // Missing "sub"
      const token = createMockJWT({
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenantId: 'tenant-1',
      });
      const result = validator.validate(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required claim');
    });

    it('should reject missing tenantId claim', () => {
      const token = createMockJWT({
        sub: 'user-1',
        iss: 'test',
        aud: 'sdk',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        // tenantId intentionally omitted
      });
      const result = validator.validate(token);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('tenantId');
    });

    it('should reject malformed token', () => {
      const result = validator.validate('not.a.jwt');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('isExpired', () => {
    it('should return false for a valid non-expired token', () => {
      const token = createMockJWT(validClaims());
      expect(validator.isExpired(token)).toBe(false);
    });

    it('should return true for an expired token', () => {
      const token = createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 100 }),
      );
      expect(validator.isExpired(token)).toBe(true);
    });

    it('should return true for a malformed token', () => {
      expect(validator.isExpired('garbage')).toBe(true);
    });
  });

  describe('getTimeToExpiry', () => {
    it('should report time to expiry in milliseconds', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockJWT(validClaims({ exp: futureExp }));

      const ttl = validator.getTimeToExpiry(token);

      // Should be roughly 3600 seconds in ms (allow 5s tolerance for test execution)
      expect(ttl).toBeGreaterThan(3595 * 1000);
      expect(ttl).toBeLessThanOrEqual(3600 * 1000);
    });

    it('should return 0 for an expired token', () => {
      const token = createMockJWT(
        validClaims({ exp: Math.floor(Date.now() / 1000) - 100 }),
      );
      expect(validator.getTimeToExpiry(token)).toBe(0);
    });

    it('should return 0 for a malformed token', () => {
      expect(validator.getTimeToExpiry('garbage')).toBe(0);
    });
  });
});
