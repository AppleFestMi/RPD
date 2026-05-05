/**
 * SHA-256 checksum helpers.
 *
 * Deliberately a separate module from `storage.ts` so a future change
 * (streaming hash, tee'd write+hash) doesn't cascade across the file
 * pipeline. For the MVP both upload and "verify" paths just hash a
 * Buffer; the data is < 10 MB by validation policy.
 */
import { createHash } from "node:crypto";

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Convert a stored hex checksum into the short prefix safe for audit
 * metadata. Storing the full hash in audit is harmless but verbose;
 * the prefix is enough to confirm a downloaded file matches its
 * recorded metadata during a manual review.
 */
export function checksumPrefix(hex: string, length = 12): string {
  return hex.slice(0, length);
}
