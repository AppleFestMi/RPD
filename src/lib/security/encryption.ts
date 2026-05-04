/**
 * AES-256-GCM envelope encryption for application-level secrets.
 *
 * Used for MFA TOTP secrets stored in `User.mfaSecretEncrypted`. The key
 * comes from `MFA_ENCRYPTION_KEY` (base64-encoded, 32 bytes). Rotation of
 * this key requires a re-encrypt step over all MFA secrets — see
 * docs/DEPLOYMENT_HARDENING.md §6.
 *
 * Wire format (base64url):  v1.<nonce>.<ciphertext+authtag>
 *   - prefix v1 lets us version the format if we change algorithms later
 *   - nonce is 12 random bytes (96 bits, GCM-recommended)
 *   - ciphertext+authtag is the GCM output with the 16-byte tag appended
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const NONCE_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "MFA_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw new Error(
      `MFA_ENCRYPTION_KEY must decode to 32 bytes (got ${decoded.length}). ` +
        "Regenerate with: openssl rand -base64 32",
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key(), nonce);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, b64u(nonce), b64u(Buffer.concat([enc, tag]))].join(".");
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("Unknown ciphertext format");
  }
  const nonce = b64uDecode(parts[1]!);
  const body = b64uDecode(parts[2]!);
  if (nonce.length !== NONCE_LEN || body.length < TAG_LEN) {
    throw new Error("Malformed ciphertext");
  }
  const ct = body.subarray(0, body.length - TAG_LEN);
  const tag = body.subarray(body.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key(), nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}

function b64u(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64uDecode(s: string): Buffer {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64");
}
