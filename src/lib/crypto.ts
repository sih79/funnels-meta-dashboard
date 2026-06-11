import "server-only";

// AES-256-GCM helpers for encrypting per-BM Meta access tokens (and any other
// at-rest secret we need to store in Supabase).
//
// Payload format: base64( 12-byte IV || ciphertext || 16-byte authTag ).
// The key is read lazily from TOKEN_ENCRYPTION_KEY (base64, must decode to
// exactly 32 bytes). Lazy so `npm run build` keeps working offline.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12; // GCM standard nonce length
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing TOKEN_ENCRYPTION_KEY. Generate a 32-byte base64 key " +
        "(e.g. `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`) " +
        "and add it to .env.local.",
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not valid base64. Re-generate with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`.",
    );
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes ` +
        `(got ${key.length}). Re-generate with ` +
        `\`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\`.`,
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext secret. Returns base64(iv || ciphertext || authTag).
 * Throws if TOKEN_ENCRYPTION_KEY is missing or malformed.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt a payload produced by encryptSecret. Throws if the key is missing,
 * the payload is malformed, or the auth tag fails to verify (tampered data).
 */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Encrypted payload is too short to be valid.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
