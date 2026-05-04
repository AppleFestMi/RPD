/**
 * Test environment defaults.
 *
 * - Provide a 32-byte MFA encryption key so encryption.ts can initialise.
 * - Mark NODE_ENV=test so any `if (production)` branches stay off.
 *
 * These values are not secrets — they exist purely so unit tests don't have
 * to hit a real environment file.
 */
import { Buffer } from "buffer";

if (!process.env.MFA_ENCRYPTION_KEY) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 0x42).toString("base64");
}
process.env.NODE_ENV = "test";
