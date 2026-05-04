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
  });

  it("rejects blocklisted passwords (case-insensitive)", () => {
    expect(validatePasswordPolicy("Password123")).toEqual({ kind: "blocked" });
    expect(validatePasswordPolicy("changeme123")).toEqual({ kind: "blocked" });
  });
});
