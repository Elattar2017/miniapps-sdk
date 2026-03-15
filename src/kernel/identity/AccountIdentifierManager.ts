/**
 * Account Identifier Manager - Switchable account identifier management
 * @module kernel/identity/AccountIdentifierManager
 */

import { logger } from '../../utils/logger';
import { applyResponseMapping, applyResponseMappingToArray } from '../../utils/responseMapping';
import type { ICryptoAdapter } from '../../types';
import type { APIProxy } from '../network/APIProxy';
import type { DataBus } from '../communication/DataBus';
import type { AccountIdentifierInfo, AccountIdentifierValidationResult } from '../../types';

const STORAGE_KEY = '__sdk_account_identifier__';

export class AccountIdentifierManager {
  private readonly log = logger.child({ component: 'AccountIdentifierManager' });
  private readonly cryptoAdapter: ICryptoAdapter;
  private readonly apiProxy: APIProxy;
  private readonly dataBus: DataBus | undefined;
  private readonly validateApiPath: string;
  private readonly listApiPath: string;
  private readonly responseMapping: Record<string, string> | undefined;
  private readonly validationPattern: RegExp | undefined;
  private activeIdentifier: string | null = null;

  constructor(
    cryptoAdapter: ICryptoAdapter,
    apiProxy: APIProxy,
    dataBus?: DataBus,
    config?: {
      validateApiPath?: string;
      listApiPath?: string;
      responseMapping?: Record<string, string>;
      validationPattern?: RegExp;
    },
  ) {
    this.cryptoAdapter = cryptoAdapter;
    this.apiProxy = apiProxy;
    this.dataBus = dataBus;
    this.validateApiPath = config?.validateApiPath ?? '/api/accounts/validate';
    this.listApiPath = config?.listApiPath ?? '/api/accounts/identifiers';
    this.responseMapping = config?.responseMapping;
    this.validationPattern = config?.validationPattern;
  }

  async getActiveIdentifier(): Promise<string> {
    if (this.activeIdentifier) return this.activeIdentifier;

    const stored = await this.cryptoAdapter.secureRetrieve(STORAGE_KEY);
    if (!stored) {
      throw new Error('No active account identifier configured');
    }
    this.activeIdentifier = stored;
    return stored;
  }

  async updateIdentifier(newId: string): Promise<void> {
    if (this.validationPattern && !this.isValidFormat(newId)) {
      throw new Error(`Invalid identifier format: ${this.maskIdentifier(newId)}`);
    }

    const validation = await this.validateIdentifier(newId);
    if (!validation.valid) {
      throw new Error(validation.error?.message ?? 'Identifier validation failed');
    }

    await this.cryptoAdapter.secureStore(STORAGE_KEY, newId);
    const oldId = this.activeIdentifier;
    this.activeIdentifier = newId;

    this.log.info('Account identifier updated', {
      old: oldId ? this.maskIdentifier(oldId) : 'none',
      new: this.maskIdentifier(newId),
    });

    this.dataBus?.publish('sdk:account:identifier:changed', {
      oldIdentifier: oldId ? this.maskIdentifier(oldId) : null,
      newIdentifier: this.maskIdentifier(newId),
    });
  }

  async validateIdentifier(id: string): Promise<AccountIdentifierValidationResult> {
    try {
      const response = await this.apiProxy.request(this.validateApiPath, {
        method: 'POST',
        body: { identifier: id },
      });

      if (response.ok && response.data) {
        return applyResponseMapping<AccountIdentifierValidationResult>(
          response.data as Record<string, unknown>,
          this.responseMapping,
        );
      }

      return {
        valid: false,
        active: false,
        isPrimary: false,
        error: { code: 'VALIDATION_FAILED', message: 'Backend validation failed' },
      };
    } catch (err) {
      this.log.error('Identifier validation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getAllIdentifiers(): Promise<AccountIdentifierInfo[]> {
    try {
      const response = await this.apiProxy.request(this.listApiPath, {
        method: 'GET',
      });

      if (response.ok && Array.isArray(response.data)) {
        return applyResponseMappingToArray<AccountIdentifierInfo>(
          response.data as Record<string, unknown>[],
          this.responseMapping,
        );
      }
      return [];
    } catch (err) {
      this.log.error('Failed to fetch identifiers', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  maskIdentifier(id: string): string {
    const digits = id.replace(/[^0-9]/g, '');
    if (digits.length <= 4) return id;

    const chars = id.split('');
    let digitIndex = 0;
    for (let i = 0; i < chars.length; i++) {
      if (/\d/.test(chars[i])) {
        digitIndex++;
        if (digitIndex > 3 && digitIndex <= digits.length - 3) {
          chars[i] = '*';
        }
      }
    }
    return chars.join('');
  }

  isValidFormat(id: string): boolean {
    if (!this.validationPattern) return true;
    const cleaned = id.replace(/[-\s()]/g, '');
    return this.validationPattern.test(cleaned);
  }
}
