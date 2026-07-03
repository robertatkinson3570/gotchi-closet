import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

let _warnedOnce = false;

function getKey(): Buffer {
  const hex = process.env.SOUL_ENCRYPTION_KEY;
  if (hex && hex.length === 64) {
    return Buffer.from(hex, "hex");
  }
  // In production the dev-constant fallback would mean every "encrypted" secret (incl.
  // steward session keys) is decryptable from a constant that lives in the public repo —
  // refuse to run rather than degrade silently.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[soul/crypto] SOUL_ENCRYPTION_KEY must be set to a 64-hex-char string in production"
    );
  }
  if (!_warnedOnce) {
    console.warn(
      "[soul/crypto] SOUL_ENCRYPTION_KEY is not set (or not a 64-hex-char string). " +
        "Using a stable dev key derived from a constant. " +
        "Set SOUL_ENCRYPTION_KEY in production."
    );
    _warnedOnce = true;
  }
  // Stable dev key — deterministic, predictable, NOT secret.
  return createHash("sha256").update("gotchi-soul-dev-key-constant-v1").digest();
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt  (AES-256-GCM)
// ---------------------------------------------------------------------------

const IV_BYTES = 12;   // 96-bit nonce — GCM standard
const TAG_BYTES = 16;  // 128-bit auth tag

/**
 * Encrypt a plaintext string.
 *
 * Encoding: base64( iv[12] | authTag[16] | ciphertext[...] )
 * The blob is opaque — it does not contain the plaintext.
 */
export function encryptSoul(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, tag, ct]);
  return blob.toString("base64");
}

/**
 * Decrypt a blob produced by {@link encryptSoul}.
 * Throws if the blob is tampered with (GCM authentication failure).
 */
export function decryptSoul(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("soul/crypto: blob too short to be valid ciphertext");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
