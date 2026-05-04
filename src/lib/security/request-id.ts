/**
 * Per-request correlation ID — Edge-safe.
 *
 * This module is in the middleware import chain, so it MUST avoid Node
 * built-ins (`crypto`, `node:crypto`, `fs`, etc.). It uses the Web Crypto
 * API (`globalThis.crypto`), which is present in:
 *   - Next.js Edge runtime
 *   - Node.js 19+ (we require Node 20 — see .nvmrc)
 *   - browsers (incidental — this file is server-only by use, not by import)
 *
 * Fallback path: if a future runtime ships Web Crypto without
 * `randomUUID`, derive a UUIDv4 from `getRandomValues`. On all currently
 * supported runtimes this branch is unreachable; it exists so the helper
 * stays robust.
 */

export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) return uuidV4FromRandom(c);
  // No random source. We deliberately fail loudly rather than emit a
  // predictable ID; the request would otherwise be untraceable.
  throw new Error("No Web Crypto random source available for request IDs.");
}

export function getRequestId(h: { get(name: string): string | null }): string | null {
  return h.get("x-request-id");
}

function uuidV4FromRandom(c: Crypto): string {
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  // RFC 4122 §4.4: version 4, variant 1.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex: string[] = [];
  for (const b of bytes) hex.push(b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}
