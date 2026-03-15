/**
 * Security Types - JWT, PKI, encryption, crypto adapter
 * @module types/security
 */

/** JWT token claims */
export interface JWTClaims {
  sub: string;
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  tenantId: string;
  roles?: string[];
  permissions?: string[];
  msisdn?: string;
  plan?: string;
  operatorId?: string;
}

/** JWT header */
export interface JWTHeader {
  alg: string;
  typ: string;
}

/** Decoded JWT token */
export interface DecodedJWT {
  header: JWTHeader;
  payload: JWTClaims;
  signature: string;
}

/** PKI signature verification result */
export interface SignatureVerification {
  valid: boolean;
  signer?: string;
  algorithm?: 'RSA-4096' | 'Ed25519';
  timestamp?: number;
  error?: string;
  manifestHash?: string;
}

/** Encryption key types */
export interface EncryptionKey {
  id: string;
  type: 'DEK' | 'KEK';
  algorithm: 'AES-256-GCM';
  createdAt: number;
  expiresAt?: number;
}

/** Crypto adapter interface (platform-agnostic) */
export interface ICryptoAdapter {
  hash(data: string, algorithm: 'SHA-256' | 'SHA-384' | 'SHA-512'): Promise<string>;
  encrypt(data: string, key: string): Promise<string>;
  decrypt(ciphertext: string, key: string): Promise<string>;
  generateKey(): Promise<string>;
  verifySignature(data: string, signature: string, publicKey: string): Promise<boolean>;
  secureStore(key: string, value: string): Promise<void>;
  secureRetrieve(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<void>;
}
