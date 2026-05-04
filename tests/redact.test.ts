import { describe, expect, it } from "vitest";
import { redact } from "@/lib/security/redact";

describe("redact", () => {
  it("redacts known sensitive keys at any depth", () => {
    const out = redact({
      email: "user@example.gov",
      password: "p@ssw0rd",
      details: { mfaSecret: "ABCD", apiKey: "x" },
      list: [{ token: "t1" }, { ok: true }],
    });
    expect(out).toEqual({
      email: "user@example.gov",
      password: "[REDACTED]",
      details: { mfaSecret: "[REDACTED]", apiKey: "[REDACTED]" },
      list: [{ token: "[REDACTED]" }, { ok: true }],
    });
  });

  it("redacts JWT-shaped string values", () => {
    const fake =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.4VsX8pYY1tZcAQ5LwabcdefGhijklmnopqr";
    expect(redact({ x: fake }).x).toBe("[REDACTED:JWT]");
  });

  it("does not touch non-sensitive primitives", () => {
    expect(redact({ count: 5, ok: true })).toEqual({ count: 5, ok: true });
  });
});
