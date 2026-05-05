import { describe, expect, it } from "vitest";
import {
  csvEscape,
  csvRow,
  exportFilename,
  metadataForCsv,
  CSV_COLUMNS,
} from "@/lib/audit/csv";

describe("csvEscape", () => {
  it("returns empty string for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("returns plain ASCII unchanged when there's nothing to escape", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(true)).toBe("true");
  });

  it("ISO-8601s Date values", () => {
    const d = new Date("2026-05-04T18:15:27.000Z");
    expect(csvEscape(d)).toBe("2026-05-04T18:15:27.000Z");
  });

  it("JSON-stringifies arbitrary objects so we never emit [object Object]", () => {
    expect(csvEscape({ a: 1 })).toContain("\"a\"");
  });

  it("RFC-4180 quotes embedded commas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("RFC-4180 doubles internal quotes and wraps", () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes embedded newlines and carriage returns", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\rline2")).toBe('"line1\rline2"');
  });

  describe("formula injection", () => {
    it("prefixes leading = with a single quote", () => {
      // No commas / quotes / newlines so RFC-4180 quoting does NOT
      // trigger; the `'` prefix alone is enough to defang Excel/Sheets.
      expect(csvEscape("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    });

    it("prefixes leading +, -, @, tab, and CR triggers", () => {
      expect(csvEscape("+1")).toBe("'+1");
      expect(csvEscape("-2+3")).toBe("'-2+3");
      expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
      expect(csvEscape("\tHIDDEN")).toBe("'\tHIDDEN");
      // CR is in NEEDS_QUOTING_RE, so this one is also quoted.
      expect(csvEscape("\rSNEAK")).toBe(`"'\rSNEAK"`);
    });

    it("does not double-prefix safe values", () => {
      expect(csvEscape("normal")).toBe("normal");
      expect(csvEscape("3.14")).toBe("3.14");
    });

    it("formula prefix is applied BEFORE quoting (otherwise = would survive)", () => {
      // Regression guard: if quoting happened first, the leading `=` would
      // be inside `"..."` and Excel would still parse it as a formula.
      const out = csvEscape('=1+1,"hi"');
      expect(out.startsWith(`"'=`)).toBe(true);
    });
  });
});

describe("csvRow", () => {
  it("joins cells with commas and ends with CRLF", () => {
    expect(csvRow(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("escapes each cell independently", () => {
    expect(csvRow(["safe", "=BAD()", "with,comma"])).toBe(
      `safe,'=BAD(),"with,comma"\r\n`,
    );
  });
});

describe("exportFilename", () => {
  it("formats UTC date as rpd-audit-export-YYYYMMDD-HHmmss.csv", () => {
    const d = new Date(Date.UTC(2026, 4, 4, 18, 15, 27));
    expect(exportFilename(d)).toBe("rpd-audit-export-20260504-181527.csv");
  });

  it("zero-pads single-digit components", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 1, 2, 3));
    expect(exportFilename(d)).toBe("rpd-audit-export-20260101-010203.csv");
  });

  it("contains only filename-safe ASCII", () => {
    const name = exportFilename();
    expect(name).toMatch(/^rpd-audit-export-\d{8}-\d{6}\.csv$/);
  });
});

describe("metadataForCsv", () => {
  it("returns empty for null/undefined", () => {
    expect(metadataForCsv(null)).toBe("");
    expect(metadataForCsv(undefined)).toBe("");
  });

  it("stringifies small objects directly", () => {
    expect(metadataForCsv({ k: "v" })).toBe(`{"k":"v"}`);
  });

  it("replaces large payloads with a sentinel rather than partial JSON", () => {
    // 5 KB string — exceeds the 4 KB metadata cap and must NOT leak any
    // partial body content (even a half-cut JSON could include a token).
    const big = { huge: "x".repeat(5 * 1024), other: 1 };
    const out = JSON.parse(metadataForCsv(big));
    expect(out._truncated).toBe(true);
    expect(typeof out._approxBytes).toBe("number");
    expect(out._approxBytes).toBeGreaterThan(4 * 1024);
    expect(out._sampleKeys).toEqual(expect.arrayContaining(["huge", "other"]));
    // Crucially: no raw "x".repeat(...) survived.
    expect(JSON.stringify(out)).not.toContain("x".repeat(100));
  });

  it("falls back to a serialization-error sentinel on circular refs", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(metadataForCsv(cyclic)).toBe(`{"_serializationError":true}`);
  });
});

describe("CSV_COLUMNS", () => {
  it("matches the documented column order exactly", () => {
    // The route handler and any downstream tooling rely on this order.
    expect([...CSV_COLUMNS]).toEqual([
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
    ]);
  });
});
