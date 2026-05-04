import { describe, expect, it } from "vitest";
import { validatePasswordPolicy } from "@/lib/security/password";

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
