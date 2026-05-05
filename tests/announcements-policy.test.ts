import { describe, expect, it } from "vitest";
import {
  audienceMatches,
  canSeeAnnouncement,
  validateTransition,
} from "@/lib/announcements/policy";

const baseAnnouncement = {
  status: "published" as const,
  audience: "all" as const,
  publishedAt: new Date("2026-05-01T00:00:00Z"),
  expiresAt: null,
  archivedAt: null,
};

describe("audienceMatches", () => {
  it("'all' matches every actor", () => {
    expect(audienceMatches("all", [])).toBe(true);
    expect(audienceMatches("all", ["officer"])).toBe(true);
  });
  it("'reserves' only matches reserveOfficer", () => {
    expect(audienceMatches("reserves", ["officer"])).toBe(false);
    expect(audienceMatches("reserves", ["reserveOfficer"])).toBe(true);
    expect(audienceMatches("reserves", ["officer", "reserveOfficer"])).toBe(true);
  });
  it("'sworn' matches officers / reserves / supervisors / dispatch", () => {
    for (const r of ["officer", "reserveOfficer", "supervisor", "commandStaff", "dispatcher"]) {
      expect(audienceMatches("sworn", [r])).toBe(true);
    }
    expect(audienceMatches("sworn", ["admin"])).toBe(false);
  });
  it("'supervisorsOnly' matches supervisor / command / admin / systemAdmin", () => {
    for (const r of ["supervisor", "commandStaff", "admin", "systemAdmin"]) {
      expect(audienceMatches("supervisorsOnly", [r])).toBe(true);
    }
    expect(audienceMatches("supervisorsOnly", ["officer"])).toBe(false);
  });
});

describe("canSeeAnnouncement", () => {
  const officerActor = { permissionKeys: [], roleKeys: ["officer"] };
  const managerActor = {
    permissionKeys: ["announcements.manage"],
    roleKeys: ["admin", "systemAdmin"],
  };

  it("rejects drafts for non-managers", () => {
    expect(
      canSeeAnnouncement(officerActor, { ...baseAnnouncement, status: "draft" }),
    ).toBe(false);
  });

  it("allows drafts for managers", () => {
    expect(
      canSeeAnnouncement(managerActor, { ...baseAnnouncement, status: "draft" }),
    ).toBe(true);
  });

  it("rejects archived for non-managers", () => {
    expect(
      canSeeAnnouncement(officerActor, {
        ...baseAnnouncement,
        archivedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("rejects expired for non-managers", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(
      canSeeAnnouncement(
        officerActor,
        { ...baseAnnouncement, expiresAt: new Date("2026-05-15T00:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("allows expired for managers", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(
      canSeeAnnouncement(
        managerActor,
        { ...baseAnnouncement, expiresAt: new Date("2026-05-15T00:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("respects audience scoping", () => {
    expect(
      canSeeAnnouncement(officerActor, { ...baseAnnouncement, audience: "reserves" }),
    ).toBe(false);
    expect(
      canSeeAnnouncement(
        { permissionKeys: [], roleKeys: ["reserveOfficer"] },
        { ...baseAnnouncement, audience: "reserves" },
      ),
    ).toBe(true);
  });

  it("rejects published with no publishedAt timestamp (defensive)", () => {
    expect(
      canSeeAnnouncement(officerActor, { ...baseAnnouncement, publishedAt: null }),
    ).toBe(false);
  });
});

describe("validateTransition", () => {
  it("draft → published is allowed", () => {
    expect(validateTransition("draft", "published")).toEqual({
      ok: true,
      next: "published",
    });
  });
  it("published → draft is allowed (unpublish)", () => {
    expect(validateTransition("published", "draft")).toEqual({ ok: true, next: "draft" });
  });
  it("draft → archived and published → archived are allowed", () => {
    expect(validateTransition("draft", "archived").ok).toBe(true);
    expect(validateTransition("published", "archived").ok).toBe(true);
  });
  it("archived is terminal", () => {
    for (const to of ["draft", "published", "archived"] as const) {
      expect(validateTransition("archived", to).ok).toBe(false);
    }
  });
  it("draft → draft and published → published are no-ops (rejected)", () => {
    expect(validateTransition("draft", "draft").ok).toBe(false);
    expect(validateTransition("published", "published").ok).toBe(false);
  });
});
