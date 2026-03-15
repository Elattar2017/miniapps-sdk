/**
 * CertificatePinConfig Type Tests
 *
 * Validates the CertificatePinConfig type interface and its integration
 * with APIProxyConfig for Phase 8 certificate pinning support.
 */

import type { CertificatePinConfig, APIProxyConfig } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CertificatePinConfig', () => {
  it('has required fields (domain, pins)', () => {
    const config: CertificatePinConfig = {
      domain: 'api.example.com',
      pins: ['sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
    };
    expect(config.domain).toBe('api.example.com');
    expect(config.pins).toHaveLength(1);
  });

  it('accepts empty pins array', () => {
    const config: CertificatePinConfig = {
      domain: 'api.example.com',
      pins: [],
    };
    expect(config.pins).toHaveLength(0);
  });

  it('accepts all optional fields', () => {
    const config: CertificatePinConfig = {
      domain: 'api.example.com',
      pins: ['sha256/pin1=', 'sha256/pin2='],
      includeSubdomains: true,
      expirationDate: '2027-01-01T00:00:00Z',
      reportUri: 'https://report.example.com/pin-violation',
    };
    expect(config.includeSubdomains).toBe(true);
    expect(config.expirationDate).toBe('2027-01-01T00:00:00Z');
    expect(config.reportUri).toBe('https://report.example.com/pin-violation');
  });

  it('APIProxyConfig accepts certificatePins array', () => {
    const proxyConfig: APIProxyConfig = {
      baseUrl: 'https://api.example.com',
      authToken: 'test-token',
      certificatePins: [
        {
          domain: 'api.example.com',
          pins: ['sha256/AAAA=', 'sha256/BBBB='],
          includeSubdomains: true,
        },
        {
          domain: 'cdn.example.com',
          pins: ['sha256/CCCC='],
        },
      ],
    };
    expect(proxyConfig.certificatePins).toHaveLength(2);
    expect(proxyConfig.certificatePins![0].domain).toBe('api.example.com');
    expect(proxyConfig.certificatePins![1].pins).toEqual(['sha256/CCCC=']);
  });
});
