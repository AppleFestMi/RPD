/**
 * MFA primitives — TOTP enrollment + verification, backup code generation
 * + verification.
 *
 * Design notes:
 *   - TOTP secrets are encrypted at rest with `encryptSecret`. We never
 *     return the plaintext secret to the client after the initial enrollment.
 *   - Backup codes are stored as Argon2id hashes, one row per code, with
 *     `usedAt` so the audit log can identify which code burned.
 *   - Verifier accepts either a 6-digit TOTP or a backup code in the same
 *     field (the UI exposes a single field). We disambiguate by length and
 *     character set; ambiguous inputs fail closed.
 */
import "server-only";
import { randomBytes } from "crypto";
import * as OTPAuth from "otpauth";
import argon2 from "argon2";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { prisma } from "@/lib/db";

const ISSUER = "RPD Internal Ops";
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30;
const TOTP_ALGORITHM = "SHA1"; // Authenticator app default
// Allow ±1 step (30s) clock drift on each side. Keep this tight — going
// wider increases the brute-force window.
const TOTP_VERIFY_WINDOW = 1;

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_GROUPS = 3;
const BACKUP_CODE_GROUP_LEN = 4;
// Crockford-ish base32 sans confusables (no 0/O, 1/I/L).
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ── TOTP ─────────────────────────────────────────────────────────────

/**
 * Generate a fresh TOTP secret and the otpauth URI for QR rendering.
 * The plaintext secret is returned ONCE so the UI can render it for
 * manual entry; persist `encrypted` on the user row and discard `plain`.
 */
export function newTotpSetup(userEmail: string): {
  secretBase32: string;
  encrypted: string;
  otpauthUri: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 }); // 160 bits
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: userEmail,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret,
  });
  return {
    secretBase32: secret.base32,
    encrypted: encryptSecret(secret.base32),
    otpauthUri: totp.toString(),
  };
}

export function verifyTotpAgainstSecret(secretBase32: string, token: string): boolean {
  const cleaned = token.trim();
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: ISSUER,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  // validate returns the time-step delta (0 means current step) or null.
  const delta = totp.validate({ token: cleaned, window: TOTP_VERIFY_WINDOW });
  return delta !== null;
}

export function verifyTotpForUser(
  encryptedSecret: string,
  token: string,
): boolean {
  let secret: string;
  try {
    secret = decryptSecret(encryptedSecret);
  } catch {
    return false;
  }
  return verifyTotpAgainstSecret(secret, token);
}

// ── Backup codes ─────────────────────────────────────────────────────

export type GeneratedBackupCodes = {
  plaintext: string[];
  hashes: string[];
};

export async function generateBackupCodes(): Promise<GeneratedBackupCodes> {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomCode();
    plaintext.push(code);
    hashes.push(await argon2.hash(code, { type: argon2.argon2id }));
  }
  return { plaintext, hashes };
}

function randomCode(): string {
  const bytes = randomBytes(BACKUP_CODE_GROUPS * BACKUP_CODE_GROUP_LEN);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % BACKUP_CODE_GROUP_LEN === 0) out += "-";
    out += BACKUP_ALPHABET[bytes[i]! % BACKUP_ALPHABET.length];
  }
  return out;
}

/**
 * Heuristic to recognize a backup code so we know not to attempt TOTP.
 * Format: 3 groups of 4 base32-ish chars separated by hyphens.
 */
export function looksLikeBackupCode(s: string): boolean {
  return /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(s.trim().toUpperCase());
}

/**
 * Verify a candidate backup code against the user's stored hashes.
 * Marks the matching row as used. Returns the consumed code's id, or null.
 *
 * SECURITY NOTE: Iterates over unused codes in arbitrary order and stops
 * at first match. Argon2 verification is constant-ish; the timing
 * difference between "first vs last code matched" is bounded by N hashes
 * regardless. Acceptable for N=10.
 */
export async function consumeBackupCode(
  userId: string,
  candidate: string,
  ip: string | null,
): Promise<string | null> {
  const rows = await prisma.backupCode.findMany({
    where: { userId, usedAt: null },
  });
  const cleaned = candidate.trim().toUpperCase();
  for (const row of rows) {
    if (await argon2.verify(row.codeHash, cleaned).catch(() => false)) {
      const updated = await prisma.backupCode.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date(), usedIp: ip ?? null },
      });
      if (updated.count === 1) return row.id;
      // Race lost — another request consumed it. Treat as failure.
      return null;
    }
  }
  return null;
}
