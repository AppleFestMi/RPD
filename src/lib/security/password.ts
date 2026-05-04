/**
 * Password hashing and policy.
 *
 * - Argon2id with sane parameters. Adjust as hardware improves.
 * - Policy: minimum length 12, reject the most common breached passwords.
 *   The blocklist is loaded lazily from a static file so we don't pull in
 *   any external service at runtime.
 */
import "server-only";
import argon2 from "argon2";

const ARGON2_OPTS: argon2.Options & { raw: false } = {
  type: argon2.argon2id,
  memoryCost: 1 << 16, // 64 MB
  timeCost: 3,
  parallelism: 1,
  raw: false,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

const MIN_LEN = 12;

export type PasswordPolicyError =
  | { kind: "tooShort"; min: number }
  | { kind: "blocked" };

/**
 * Validate a candidate password.
 *
 * Returns `null` on accept, or a structured error. The blocklist check is
 * intentionally a hash-set lookup of common passwords — not a HIBP API
 * call (we do not want runtime network dependencies on the auth path).
 *
 * Plumb a real blocklist in via a generated module; for now this is a
 * minimal seed list.
 */
export function validatePasswordPolicy(plain: string): PasswordPolicyError | null {
  if (plain.length < MIN_LEN) return { kind: "tooShort", min: MIN_LEN };
  if (BLOCKED_PASSWORDS.has(plain.toLowerCase())) return { kind: "blocked" };
  return null;
}

// Minimal seed. Replace with a generated module of ~10k common breached
// passwords before going live. The lookup is O(1) in a Set.
const BLOCKED_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password123",
  "letmein",
  "qwerty",
  "qwerty123",
  "111111111111",
  "123456789012",
  "passw0rd!",
  "welcome1",
  "iloveyou",
  "admin1234567",
  "changeme123",
  "rpd123456789",
  "richmond1234",
]);
