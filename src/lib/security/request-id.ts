/**
 * Per-request correlation ID.
 *
 * The middleware writes `x-request-id` on the inbound request (creating
 * one if absent) and the response (so downstream / logs can correlate).
 *
 * Server-side helpers can call `getRequestId(headers())` to attach the ID
 * to audit rows.
 */
import { randomUUID } from "crypto";

export function newRequestId(): string {
  return randomUUID();
}

export function getRequestId(h: { get(name: string): string | null }): string | null {
  return h.get("x-request-id");
}
