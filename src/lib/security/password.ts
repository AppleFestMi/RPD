/**
 * Password hashing and policy — server-only entry point.
 *
 * This module exists so the Next.js server build can detect any
 * accidental client-component import of password code via the
 * `server-only` directive. The actual logic lives in `password-core.ts`
 * so it stays importable from runtime-agnostic places (the Prisma seed
 * via `tsx`, and the vitest unit suite).
 *
 * Application server code (Auth.js callbacks, server actions) imports
 * from this file. Seed and tests import from `./password-core`.
 *
 * Argon2id parameters and the policy are defined ONCE in password-core.
 */
import "server-only";

export {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  type PasswordPolicyError,
} from "./password-core";
