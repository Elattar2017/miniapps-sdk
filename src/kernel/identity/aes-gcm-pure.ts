/**
 * Pure JavaScript AES-256-GCM Implementation
 * @module kernel/identity/aes-gcm-pure
 *
 * Self-contained implementation with zero external dependencies.
 * Used as the ultimate fallback when no native crypto or WebCrypto is available.
 *
 * Implements:
 * - SHA-256 (FIPS 180-4)
 * - HMAC-SHA256 (RFC 2104)
 * - PBKDF2-HMAC-SHA256 (RFC 2898)
 * - AES-256 block cipher (FIPS 197)
 * - GCM mode (NIST SP 800-38D)
 */

// =============================================================================
// SHA-256
// =============================================================================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Compress(state: Uint32Array, block: Uint8Array): void {
  const W = new Uint32Array(64);

  // Parse block into 16 big-endian 32-bit words
  for (let i = 0; i < 16; i++) {
    W[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
  }

  // Extend to 64 words
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
    const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }

  let a = state[0], b = state[1], c = state[2], d = state[3];
  let e = state[4], f = state[5], g = state[6], h = state[7];

  for (let i = 0; i < 64; i++) {
    const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) | 0;
    const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) | 0;

    h = g; g = f; f = e; e = (d + temp1) | 0;
    d = c; c = b; b = a; a = (temp1 + temp2) | 0;
  }

  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
}

function sha256Hash(data: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = data.length * 8;

  // Pad: append 1 bit, zeros, then 64-bit big-endian length
  const padLen = 64 - ((data.length + 9) % 64);
  const totalLen = data.length + 1 + (padLen === 64 ? 0 : padLen) + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(data, 0);
  padded[data.length] = 0x80;

  // Write bit length as big-endian 64-bit (we only use low 32 bits for messages < 512MB)
  const lenOffset = totalLen - 8;
  padded[lenOffset + 4] = (bitLen >>> 24) & 0xff;
  padded[lenOffset + 5] = (bitLen >>> 16) & 0xff;
  padded[lenOffset + 6] = (bitLen >>> 8) & 0xff;
  padded[lenOffset + 7] = bitLen & 0xff;
  // High 32 bits of length — needed for messages > 512MB
  const bitLenHigh = Math.floor(data.length / 0x20000000);
  padded[lenOffset] = (bitLenHigh >>> 24) & 0xff;
  padded[lenOffset + 1] = (bitLenHigh >>> 16) & 0xff;
  padded[lenOffset + 2] = (bitLenHigh >>> 8) & 0xff;
  padded[lenOffset + 3] = bitLenHigh & 0xff;

  // Process each 64-byte block
  for (let offset = 0; offset < totalLen; offset += 64) {
    sha256Compress(state, padded.subarray(offset, offset + 64));
  }

  // Convert state to bytes (big-endian)
  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    result[i * 4] = (state[i] >>> 24) & 0xff;
    result[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    result[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    result[i * 4 + 3] = state[i] & 0xff;
  }
  return result;
}

// =============================================================================
// HMAC-SHA256
// =============================================================================

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;

  // If key is longer than block size, hash it
  let k = key;
  if (k.length > blockSize) {
    k = sha256Hash(k);
  }

  // Pad key to block size
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(k, 0);

  // ipad = key XOR 0x36, opad = key XOR 0x5c
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36;
    opad[i] = paddedKey[i] ^ 0x5c;
  }

  // inner = SHA256(ipad || message)
  const inner = new Uint8Array(blockSize + message.length);
  inner.set(ipad, 0);
  inner.set(message, blockSize);
  const innerHash = sha256Hash(inner);

  // outer = SHA256(opad || inner)
  const outer = new Uint8Array(blockSize + 32);
  outer.set(opad, 0);
  outer.set(innerHash, blockSize);
  return sha256Hash(outer);
}

// =============================================================================
// PBKDF2-HMAC-SHA256
// =============================================================================

export function pbkdf2Sha256(password: string, salt: string, iterations: number, keyLen: number): Uint8Array {
  const passwordBytes = stringToBytes(password);
  const saltBytes = stringToBytes(salt);
  const numBlocks = Math.ceil(keyLen / 32);
  const result = new Uint8Array(numBlocks * 32);

  for (let block = 1; block <= numBlocks; block++) {
    // U1 = HMAC(password, salt || INT32_BE(block))
    const saltBlock = new Uint8Array(saltBytes.length + 4);
    saltBlock.set(saltBytes, 0);
    saltBlock[saltBytes.length] = (block >>> 24) & 0xff;
    saltBlock[saltBytes.length + 1] = (block >>> 16) & 0xff;
    saltBlock[saltBytes.length + 2] = (block >>> 8) & 0xff;
    saltBlock[saltBytes.length + 3] = block & 0xff;

    let u = hmacSha256(passwordBytes, saltBlock);
    const t = new Uint8Array(u);

    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(passwordBytes, u);
      for (let j = 0; j < 32; j++) {
        t[j] ^= u[j];
      }
    }

    result.set(t, (block - 1) * 32);
  }

  return result.subarray(0, keyLen);
}

// =============================================================================
// AES-256 Block Cipher
// =============================================================================

// AES S-Box
const SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

// Round constants
const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

// Galois field multiplication tables for MixColumns
const GF2 = new Uint8Array(256);
const GF3 = new Uint8Array(256);

// Precompute GF multiplication tables
(function initGF() {
  for (let i = 0; i < 256; i++) {
    // Multiply by 2 in GF(2^8) with irreducible polynomial 0x11b
    GF2[i] = (i << 1) ^ ((i & 0x80) ? 0x1b : 0);
    // Multiply by 3 = multiply by 2 then XOR original
    GF3[i] = GF2[i] ^ i;
  }
})();

function aesKeyExpansion(key: Uint8Array): Uint8Array {
  // AES-256: 14 rounds, 60 words (240 bytes) of expanded key
  const expanded = new Uint8Array(240);
  expanded.set(key, 0);

  let rconIdx = 0;
  for (let i = 32; i < 240; i += 4) {
    let t0 = expanded[i - 4], t1 = expanded[i - 3], t2 = expanded[i - 2], t3 = expanded[i - 1];

    if (i % 32 === 0) {
      // RotWord + SubWord + Rcon
      const tmp = t0;
      t0 = SBOX[t1] ^ RCON[rconIdx++];
      t1 = SBOX[t2];
      t2 = SBOX[t3];
      t3 = SBOX[tmp];
    } else if (i % 32 === 16) {
      // SubWord only (AES-256 extra step)
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3];
    }

    expanded[i] = expanded[i - 32] ^ t0;
    expanded[i + 1] = expanded[i - 31] ^ t1;
    expanded[i + 2] = expanded[i - 30] ^ t2;
    expanded[i + 3] = expanded[i - 29] ^ t3;
  }

  return expanded;
}

function aesEncryptBlock(block: Uint8Array, expandedKey: Uint8Array): Uint8Array {
  // State is column-major: state[row][col] stored as state[row + 4*col]
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = block[i];

  // AddRoundKey (round 0)
  for (let i = 0; i < 16; i++) s[i] ^= expandedKey[i];

  // Rounds 1..13
  for (let round = 1; round <= 13; round++) {
    const rkOff = round * 16;

    // SubBytes
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];

    // ShiftRows
    // Row 0: no shift
    // Row 1: shift left 1
    let tmp = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = tmp;
    // Row 2: shift left 2
    tmp = s[2]; s[2] = s[10]; s[10] = tmp;
    tmp = s[6]; s[6] = s[14]; s[14] = tmp;
    // Row 3: shift left 3
    tmp = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = tmp;

    // MixColumns
    for (let col = 0; col < 4; col++) {
      const i = col * 4;
      const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      s[i]     = GF2[a0] ^ GF3[a1] ^ a2 ^ a3;
      s[i + 1] = a0 ^ GF2[a1] ^ GF3[a2] ^ a3;
      s[i + 2] = a0 ^ a1 ^ GF2[a2] ^ GF3[a3];
      s[i + 3] = GF3[a0] ^ a1 ^ a2 ^ GF2[a3];
    }

    // AddRoundKey
    for (let i = 0; i < 16; i++) s[i] ^= expandedKey[rkOff + i];
  }

  // Final round (14): SubBytes, ShiftRows, AddRoundKey (no MixColumns)
  for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
  let tmp = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = tmp;
  tmp = s[2]; s[2] = s[10]; s[10] = tmp;
  tmp = s[6]; s[6] = s[14]; s[14] = tmp;
  tmp = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = tmp;
  for (let i = 0; i < 16; i++) s[i] ^= expandedKey[224 + i];

  return s;
}

// =============================================================================
// GCM Mode (GHASH + CTR)
// =============================================================================

/**
 * GF(2^128) multiplication for GHASH.
 * Both X and Y are 16-byte blocks interpreted as elements of GF(2^128).
 */
function ghashMultiply(X: Uint8Array, Y: Uint8Array): Uint8Array<ArrayBuffer> {
  const Z = new Uint8Array(16);
  const V = new Uint8Array(16);
  V.set(Y);

  for (let i = 0; i < 128; i++) {
    // Check bit i of X (MSB first)
    if ((X[Math.floor(i / 8)] >> (7 - (i % 8))) & 1) {
      for (let j = 0; j < 16; j++) Z[j] ^= V[j];
    }

    // Right shift V, reducing by x^128 + x^7 + x^2 + x + 1 if LSB is set
    const lsb = V[15] & 1;
    for (let j = 15; j > 0; j--) {
      V[j] = (V[j] >>> 1) | ((V[j - 1] & 1) << 7);
    }
    V[0] >>>= 1;

    if (lsb) {
      V[0] ^= 0xe1; // Reduction polynomial: x^128 + x^7 + x^2 + x + 1 → 0xe1000000...
    }
  }

  return Z;
}

/**
 * GHASH function: computes the authentication tag over additional data and ciphertext.
 */
function ghash(H: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  let Y = new Uint8Array(16);

  // Process AAD (pad to 16-byte boundary)
  const aadBlocks = Math.ceil(aad.length / 16);
  for (let i = 0; i < aadBlocks; i++) {
    const block = new Uint8Array(16);
    const start = i * 16;
    const end = Math.min(start + 16, aad.length);
    block.set(aad.subarray(start, end), 0);
    for (let j = 0; j < 16; j++) Y[j] ^= block[j];
    Y = ghashMultiply(Y, H);
  }

  // Process ciphertext (pad to 16-byte boundary)
  const ctBlocks = Math.ceil(ciphertext.length / 16);
  for (let i = 0; i < ctBlocks; i++) {
    const block = new Uint8Array(16);
    const start = i * 16;
    const end = Math.min(start + 16, ciphertext.length);
    block.set(ciphertext.subarray(start, end), 0);
    for (let j = 0; j < 16; j++) Y[j] ^= block[j];
    Y = ghashMultiply(Y, H);
  }

  // Final block: [len(AAD) in bits (64-bit) || len(C) in bits (64-bit)]
  const lenBlock = new Uint8Array(16);
  const aadBits = aad.length * 8;
  const ctBits = ciphertext.length * 8;
  // AAD length (big-endian 64-bit) — only low 32 bits for < 512MB
  lenBlock[4] = (aadBits >>> 24) & 0xff;
  lenBlock[5] = (aadBits >>> 16) & 0xff;
  lenBlock[6] = (aadBits >>> 8) & 0xff;
  lenBlock[7] = aadBits & 0xff;
  // Ciphertext length (big-endian 64-bit)
  lenBlock[12] = (ctBits >>> 24) & 0xff;
  lenBlock[13] = (ctBits >>> 16) & 0xff;
  lenBlock[14] = (ctBits >>> 8) & 0xff;
  lenBlock[15] = ctBits & 0xff;

  for (let j = 0; j < 16; j++) Y[j] ^= lenBlock[j];
  Y = ghashMultiply(Y, H);

  return Y;
}

/**
 * Increment the rightmost 32 bits of a 16-byte counter block.
 */
function incrementCounter(counter: Uint8Array): Uint8Array {
  const result = new Uint8Array(counter);
  for (let i = 15; i >= 12; i--) {
    result[i]++;
    if (result[i] !== 0) break; // No carry
  }
  return result;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Decrypt AES-256-GCM ciphertext.
 * @param ciphertext - The encrypted data (without IV or auth tag)
 * @param key - 32-byte AES key
 * @param iv - 12-byte initialization vector
 * @param authTag - 16-byte authentication tag
 * @returns Decrypted plaintext
 * @throws Error if authentication tag verification fails
 */
export function aesGcmDecrypt(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
): Uint8Array {
  if (key.length !== 32) throw new Error('AES-256 requires a 32-byte key');
  if (iv.length !== 12) throw new Error('GCM requires a 12-byte IV');
  if (authTag.length !== 16) throw new Error('GCM auth tag must be 16 bytes');

  const expandedKey = aesKeyExpansion(key);

  // H = AES_K(0^128)
  const H = aesEncryptBlock(new Uint8Array(16), expandedKey);

  // J0 = IV || 0^31 || 1 (for 96-bit IV)
  const J0 = new Uint8Array(16);
  J0.set(iv, 0);
  J0[15] = 1;

  // Decrypt using CTR mode starting at J0 + 1
  const plaintext = new Uint8Array(ciphertext.length);
  let counter = incrementCounter(J0);

  for (let offset = 0; offset < ciphertext.length; offset += 16) {
    const keystreamBlock = aesEncryptBlock(counter, expandedKey);
    const blockLen = Math.min(16, ciphertext.length - offset);
    for (let i = 0; i < blockLen; i++) {
      plaintext[offset + i] = ciphertext[offset + i] ^ keystreamBlock[i];
    }
    counter = incrementCounter(counter);
  }

  // Verify auth tag: GHASH(H, AAD="", ciphertext) XOR AES_K(J0)
  const computedTag = ghash(H, new Uint8Array(0), ciphertext);
  const encJ0 = aesEncryptBlock(J0, expandedKey);
  for (let i = 0; i < 16; i++) computedTag[i] ^= encJ0[i];

  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= computedTag[i] ^ authTag[i];
  if (diff !== 0) {
    throw new Error('AES-GCM authentication failed: tag mismatch');
  }

  return plaintext;
}

/**
 * Encrypt with AES-256-GCM.
 * @param plaintext - Data to encrypt
 * @param key - 32-byte AES key
 * @param iv - 12-byte initialization vector
 * @returns Object with ciphertext and authTag
 */
export function aesGcmEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): { ciphertext: Uint8Array; authTag: Uint8Array } {
  if (key.length !== 32) throw new Error('AES-256 requires a 32-byte key');
  if (iv.length !== 12) throw new Error('GCM requires a 12-byte IV');

  const expandedKey = aesKeyExpansion(key);

  // H = AES_K(0^128)
  const H = aesEncryptBlock(new Uint8Array(16), expandedKey);

  // J0 = IV || 0^31 || 1
  const J0 = new Uint8Array(16);
  J0.set(iv, 0);
  J0[15] = 1;

  // Encrypt using CTR mode starting at J0 + 1
  const ciphertext = new Uint8Array(plaintext.length);
  let counter = incrementCounter(J0);

  for (let offset = 0; offset < plaintext.length; offset += 16) {
    const keystreamBlock = aesEncryptBlock(counter, expandedKey);
    const blockLen = Math.min(16, plaintext.length - offset);
    for (let i = 0; i < blockLen; i++) {
      ciphertext[offset + i] = plaintext[offset + i] ^ keystreamBlock[i];
    }
    counter = incrementCounter(counter);
  }

  // Compute auth tag: GHASH(H, AAD="", ciphertext) XOR AES_K(J0)
  const tag = ghash(H, new Uint8Array(0), ciphertext);
  const encJ0 = aesEncryptBlock(J0, expandedKey);
  for (let i = 0; i < 16; i++) tag[i] ^= encJ0[i];

  return { ciphertext, authTag: tag };
}

// =============================================================================
// Helpers
// =============================================================================

function stringToBytes(str: string): Uint8Array {
  // Handle UTF-8 encoding properly
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      // Surrogate pair
      const next = str.charCodeAt(++i);
      const cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}
