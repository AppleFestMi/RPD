import { describe, expect, it } from "vitest";
import { canSeePolicy, validatePolicyTransition } from "@/lib/policies/policy";

describe("canSeePolicy", () => {
  const officer = { permissionKeys: ["policies.read"] };
  const manager = { permissionKeys: ["policies.read", "policies.manage"] };

  it("hides drafts from non-managers", () => {
    expect(canSeePolicy(officer, { status: "draft" })).toBe(false);
  });

  it("shows drafts to managers", () => {
    expect(canSeePolicy(manager, { status: "draft" })).toBe(true);
  });

  it("hides archived from non-managers", () => {
    expect(
      canSeePolicy(officer, { status: "archived", archivedAt: new Date() }),
    ).toBe(false);
    // even if status was "published" but archivedAt set, hide
    expect(
      canSeePolicy(officer, { status: "published", archivedAt: new Date() }),
    ).toBe(false);
  });

  it("shows archived to managers", () => {
    expect(
      canSeePolicy(manager, { status: "archived", archivedAt: new Date() }),
    ).toBe(true);
  });

  it("shows published to non-managers", () => {
    expect(canSeePolicy(officer, { status: "published" })).toBe(true);
  });
});

describe("validatePolicyTransition", () => {
  it("allows draft → published", () => {
    expect(validatePolicyTransition("draft", "published")).toEqual({
      ok: true,
      next: "published",
    });
  });
  it("allows published → draft (unpublish)", () => {
    expect(validatePolicyTransition("published", "draft")).toEqual({
      ok: true,
      next: "draft",
    });
  });
  it("allows draft/published → archived", () => {
    expect(validatePolicyTransition("draft", "archived").ok).toBe(true);
    expect(validatePolicyTransition("published", "archived").ok).toBe(true);
  });
  it("rejects archived → anything", () => {
    for (const to of ["draft", "published", "archived"] as const) {
      expect(validatePolicyTransition("archived", to).ok).toBe(false);
    }
  });
  it("rejects same-state no-ops", () => {
    expect(validatePolicyTransition("draft", "draft").ok).toBe(false);
    expect(validatePolicyTransition("published", "published").ok).toBe(false);
  });
});
