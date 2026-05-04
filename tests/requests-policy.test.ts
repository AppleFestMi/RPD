import { describe, expect, it } from "vitest";
import { canActorDecide, canCancelOwn, canViewRequest } from "@/lib/requests/policy";

describe("canViewRequest", () => {
  it("allows the owner regardless of permissions", () => {
    expect(
      canViewRequest({ userId: "u1", permissionKeys: [] }, { userId: "u1" }),
    ).toBe(true);
  });

  it("allows anyone with requests.read.all", () => {
    expect(
      canViewRequest(
        { userId: "u2", permissionKeys: ["requests.read.all"] },
        { userId: "u1" },
      ),
    ).toBe(true);
  });

  it("rejects non-owners without requests.read.all", () => {
    expect(
      canViewRequest({ userId: "u2", permissionKeys: ["requests.create"] }, { userId: "u1" }),
    ).toBe(false);
  });
});

describe("canActorDecide", () => {
  it("blocks self-approval even with permission", () => {
    const r = canActorDecide({
      actorId: "u1",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.supervisor"],
      decision: "approve",
      currentStatus: "submitted",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/your own/i);
  });

  it("blocks deciders without approval permission", () => {
    const r = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.create"],
      decision: "deny",
      currentStatus: "submitted",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permission/i);
  });

  it("supervisor can approve a request at supervisorReview", () => {
    const r = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.supervisor"],
      decision: "approve",
      currentStatus: "supervisorReview",
    });
    expect(r).toEqual({ ok: true, next: "approved" });
  });

  it("supervisor cannot approve a commandReview request", () => {
    const r = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.supervisor"],
      decision: "approve",
      currentStatus: "commandReview",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/command/i);
  });

  it("command staff can approve a commandReview request", () => {
    const r = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.command"],
      decision: "approve",
      currentStatus: "commandReview",
    });
    expect(r).toEqual({ ok: true, next: "approved" });
  });

  it("rejects decisions on already-decided requests", () => {
    for (const status of ["approved", "denied", "cancelled"] as const) {
      const r = canActorDecide({
        actorId: "u2",
        ownerUserId: "u1",
        permissionKeys: ["requests.approve.command"],
        decision: "deny",
        currentStatus: status,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("complete is only allowed from approved", () => {
    const ok = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.supervisor"],
      decision: "complete",
      currentStatus: "approved",
    });
    expect(ok.ok).toBe(true);

    const bad = canActorDecide({
      actorId: "u2",
      ownerUserId: "u1",
      permissionKeys: ["requests.approve.supervisor"],
      decision: "complete",
      currentStatus: "submitted",
    });
    expect(bad.ok).toBe(false);
  });
});

describe("canCancelOwn", () => {
  it("owner may cancel from any open status", () => {
    for (const status of [
      "submitted",
      "supervisorReview",
      "commandReview",
      "needsMoreInfo",
    ] as const) {
      expect(
        canCancelOwn({ actorId: "u1", ownerUserId: "u1", currentStatus: status }),
      ).toBe(true);
    }
  });

  it("non-owner may not cancel even own-shaped statuses", () => {
    expect(
      canCancelOwn({ actorId: "u2", ownerUserId: "u1", currentStatus: "submitted" }),
    ).toBe(false);
  });

  it("decided requests cannot be cancelled", () => {
    for (const status of ["approved", "denied", "cancelled"] as const) {
      expect(
        canCancelOwn({ actorId: "u1", ownerUserId: "u1", currentStatus: status }),
      ).toBe(false);
    }
  });
});
