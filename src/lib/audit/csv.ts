/**
 * CSV helpers for the audit-log export.
 *
 * Pure — no DB, no Node fs. The route handler combines these with
 * Prisma's cursor pagination and a `ReadableStream` to ship arbitrarily
 * large logs without spiking memory.
 *
 * The escaping order is deliberately:
 *   1. coerce to string
 *   2. formula-injection prefix (single quote)
 *   3. RFC-4180 quote-and-double-internal-quotes
 *
 * Step 2 must happen *before* step 3 — otherwise an attacker-controlled
 * value like `=cmd|'/c calc'!A1` whose first char is an `=` would
 * survive when wrapped in quotes (Excel still treats the cell as a
 * formula). The leading `'` defangs that interpretation.
 */

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;
const NEEDS_QUOTING_RE = /[",\n\r]/;

/**
 * Stringify and escape a single CSV cell. Safe against:
 *  - Excel / Sheets / LibreOffice formula injection (=, +, -, @, tab, CR)
 *  - embedded commas / quotes / newlines / carriage returns
 *
 * `null` and `undefined` become an empty cell.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === "object") {
    // Caller is responsible for already JSON-stringifying nested objects;
    // this fallback is just so we never emit "[object Object]".
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  if (FORMULA_TRIGGER_RE.test(s)) s = "'" + s;
  if (NEEDS_QUOTING_RE.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Encode an array of cells as a single CRLF-terminated CSV record. */
export function csvRow(cells: ReadonlyArray<unknown>): string {
  return cells.map(csvEscape).join(",") + "\r\n";
}

const METADATA_MAX_BYTES = 4 * 1024;

/**
 * Stringify the audit-log `metadata` JSON for inclusion in the CSV.
 *
 * - The DB column was already redacted at write time by `redact()` —
 *   passwords, MFA secrets, API tokens, JWT-shaped strings, etc. are
 *   already `[REDACTED]`. We re-stringify here only to bound the size.
 * - If the serialized JSON exceeds `METADATA_MAX_BYTES`, we replace it
 *   with a sentinel object that signals truncation but does not leak
 *   any partial body content (a half-cut JSON could include a token).
 */
export function metadataForCsv(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return "";
  let json: string;
  try {
    json = JSON.stringify(metadata);
  } catch {
    return JSON.stringify({ _serializationError: true });
  }
  if (Buffer.byteLength(json, "utf8") > METADATA_MAX_BYTES) {
    const keys =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? Object.keys(metadata as Record<string, unknown>).slice(0, 16)
        : [];
    return JSON.stringify({
      _truncated: true,
      _approxBytes: Buffer.byteLength(json, "utf8"),
      _sampleKeys: keys,
    });
  }
  return json;
}

/**
 * Build the export filename from a clock instant.
 *
 *   rpd-audit-export-20260504-181527.csv
 *
 * Always UTC so simultaneous downloads from different timezones don't
 * collide if a reviewer drops them into the same folder.
 */
export function exportFilename(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `rpd-audit-export-${y}${mo}${da}-${h}${mi}${s}.csv`;
}

/**
 * Column order for the CSV header / row writer. Centralised so the
 * route handler and tests can't drift out of sync.
 */
export const CSV_COLUMNS = [
  "timestamp",
  "result",
  "eventType",
  "actorEmail",
  "actorName",
  "actorUserId",
  "actorRoleSnapshot",
  "entityType",
  "entityId",
  "action",
  "requestId",
  "ipAddress",
  "userAgent",
  "metadataJson",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];
