import { describe, expect, it } from "vitest";
// Import the runtime-agnostic core directly so the test does not pull in
// the `server-only` directive, which throws when imported outside a
// React Server Components context.
import { validatePasswordPolicy } from "@/lib/security/password-core";

describe("password policy", () => {
  it("accepts a sufficiently long, non-blocked password", () => {
    expect(validatePasswordPolicy("Tr0pical-Sun&Storms")).toBeNull();
  });

  it("rejects too-short passwords", () => {
    expect(validatePasswordPolicy("short")).toEqual({ kind: "tooShort", min: 12 });
    // "Password123" is on the blocklist (lowercased) but it's only 11
    // chars — length check runs first by design, so the user sees the
    // length error and never learns whether their candidate is on the
    // blocklist. Codified here so a future "blocklist before length"
    // refactor breaks the build.
    expect(validatePasswordPolicy("Password123")).toEqual({ kind: "tooShort", min: 12 });
  });

  it("rejects blocklisted passwords that meet the length minimum (case-insensitive)", () => {
    // Entries ≥12 chars straight off the seed blocklist.
    expect(validatePasswordPolicy("rpd123456789")).toEqual({ kind: "blocked" });
    expect(validatePasswordPolicy("RPD123456789")).toEqual({ kind: "blocked" });
    expect(validatePasswordPolicy("Richmond1234")).toEqual({ kind: "blocked" });
    expect(validatePasswordPolicy("admin1234567")).toEqual({ kind: "blocked" });
    expect(validatePasswordPolicy("111111111111")).toEqual({ kind: "blocked" });
  });
});
