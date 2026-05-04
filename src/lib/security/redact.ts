/**
 * Strip sensitive fields from arbitrary structured data before logging or
 * persisting to the audit log.
 *
 * Conservative key-name match — false positives are fine; false negatives
 * are not.
 */

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passcode/i,
  /pin\b/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /mfa/i,
  /^pwd$/i,
  /encryption[_-]?key/i,
];

export function redact<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(walk);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "string" && looksLikeJWT(v)) {
      out[k] = "[REDACTED:JWT]";
    } else {
      out[k] = walk(v);
    }
  }
  return out;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

function looksLikeJWT(s: string): boolean {
  // 3 base64url segments separated by dots, each at least a few chars.
  return /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(s);
}
