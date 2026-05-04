/**
 * Test environment defaults.
 *
 * - Provide a 32-byte MFA encryption key so encryption.ts can initialise.
 * - Mark NODE_ENV=test so any `if (production)` branches stay off.
 * - Stub `server-only` so modules that defensively import it
 *   (encryption.ts, mfa.ts, audit.ts, etc.) can be loaded under vitest,
 *   which does not satisfy the React Server Components `react-server`
 *   export condition that the published `server-only` package relies on.
 *
 * The stub is purely a no-op. The Next.js server build still enforces
 * the contract via the real `server-only` package — this file only
 * affects vitest.
 *
 * These values are not secrets — they exist purely so unit tests don't
 * have to hit a real environment file.
 */
import { Buffer } from "buffer";
import { vi } from "vitest";

if (!process.env.MFA_ENCRYPTION_KEY) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString("base64");
}

// Prisma's client constructor requires DATABASE_URL at module load. We
// never connect during unit tests; this placeholder just satisfies the
// validator. Tests that need real DB access would use a separate suite.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
}
process.env.NODE_ENV = "test";

vi.mock("server-only", () => ({}));
