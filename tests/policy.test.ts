import { describe, expect, it } from "vitest";
import {
  actorMfaRequired,
  evaluateSetupGate,
  roleRequiresMfa,
} from "@/lib/auth/policy";

describe("MFA-required role policy", () => {
  it("requires MFA for systemAdmin/admin/commandStaff/auditorReadOnly", () => {
    expect(roleRequiresMfa("systemAdmin")).toBe(true);
    expect(roleRequiresMfa("admin")).toBe(true);
    expect(roleRequiresMfa("commandStaff")).toBe(true);
    expect(roleRequiresMfa("auditorReadOnly")).toBe(true);
  });

  it("does not require MFA for general operational roles", () => {
    expect(roleRequiresMfa("officer")).toBe(false);
    expect(roleRequiresMfa("reserveOfficer")).toBe(false);
    expect(roleRequiresMfa("dispatcher")).toBe(false);
    expect(roleRequiresMfa("supervisor")).toBe(false);
  });

  it("aggregates over an actor's roles", () => {
    expect(actorMfaRequired({ roleKeys: ["officer", "supervisor"] })).toBe(false);
    expect(actorMfaRequired({ roleKeys: ["officer", "admin"] })).toBe(true);
  });
});

describe("setup gate evaluation", () => {
  it("force-password-reset takes precedence over MFA", () => {
    expect(
      evaluateSetupGate({
        forcePasswordReset: true,
        mfaEnabled: false,
        roleKeys: ["admin"],
      }),
    ).toEqual({ kind: "force-password-reset" });
  });

  it("requires MFA setup when role demands it and not yet enrolled", () => {
    expect(
      evaluateSetupGate({
        forcePasswordReset: false,
        mfaEnabled: false,
        roleKeys: ["admin"],
      }),
    ).toEqual({ kind: "mfa-required" });
  });

  it("clears the gate when MFA is enabled", () => {
    expect(
      evaluateSetupGate({
        forcePasswordReset: false,
        mfaEnabled: true,
        roleKeys: ["admin"],
      }),
    ).toEqual({ kind: "ok" });
  });

  it("does not require MFA for roles that don't demand it", () => {
    expect(
      evaluateSetupGate({
        forcePasswordReset: false,
        mfaEnabled: false,
        roleKeys: ["officer"],
      }),
    ).toEqual({ kind: "ok" });
  });
});
