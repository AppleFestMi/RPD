/**
 * Pure policy helpers for announcements.
 *
 * `canSeeAnnouncement` decides whether a given actor (by their role
 * keys + permissions) can see a specific announcement. This is the
 * single source of truth used by the list page, the detail page, and
 * the dashboard's "today's briefing" panel.
 *
 * Rules:
 *   - Anyone with `announcements.manage` sees every announcement,
 *     including drafts and archived rows.
 *   - Otherwise the announcement must be `published`, not archived,
 *     not expired, and the actor's roles must intersect the audience
 *     mapping below.
 */
import type { AudienceScope, AnnouncementStatus } from "./types";

/**
 * Map an audience scope to the role keys that satisfy it. Order is not
 * meaningful; we intersect the actor's role set with this list.
 *
 * `sworn` covers any badge-carrying role (officer, reserve, supervisor,
 * command, dispatcher when posted to sworn channels). The intent is "any
 * uniformed role" — the alternative was a separate enum value per role,
 * which is more granular than supervisors actually want.
 */
const AUDIENCE_ROLES: Record<AudienceScope, string[]> = {
  all: [], // empty = visible to everyone with announcements.read
  sworn: ["officer", "reserveOfficer", "supervisor", "commandStaff", "dispatcher"],
  patrol: ["officer", "reserveOfficer", "supervisor"],
  reserves: ["reserveOfficer"],
  dispatch: ["dispatcher"],
  supervisorsOnly: ["supervisor", "commandStaff", "admin", "systemAdmin"],
  command: ["commandStaff", "admin", "systemAdmin"],
  admin: ["admin", "systemAdmin"],
};

export function audienceMatches(audience: AudienceScope, roleKeys: string[]): boolean {
  const allowed = AUDIENCE_ROLES[audience];
  if (allowed.length === 0) return true; // "all"
  return roleKeys.some((r) => allowed.includes(r));
}

export type ViewActor = {
  permissionKeys: string[];
  roleKeys: string[];
};

export type AnnouncementForVisibility = {
  status: AnnouncementStatus;
  audience: AudienceScope;
  publishedAt: Date | null;
  expiresAt: Date | null;
  archivedAt?: Date | null;
};

export function canSeeAnnouncement(
  actor: ViewActor,
  a: AnnouncementForVisibility,
  now: Date = new Date(),
): boolean {
  // Managers see everything.
  if (actor.permissionKeys.includes("announcements.manage")) return true;

  if (a.status !== "published") return false;
  if (!a.publishedAt) return false;
  if (a.expiresAt && a.expiresAt < now) return false;
  if (a.archivedAt) return false;

  return audienceMatches(a.audience, actor.roleKeys);
}

export type StatusTransition =
  | { ok: true; next: AnnouncementStatus }
  | { ok: false; error: string };

/**
 * Validate a status transition. Used by the publish/unpublish/archive
 * server actions. Permissions are checked separately (the UI doesn't
 * expose a control for a transition the actor can't make, but the
 * server actions enforce it regardless).
 */
export function validateTransition(
  from: AnnouncementStatus,
  to: AnnouncementStatus,
): StatusTransition {
  // Drafts → published or archived. Published → draft (unpublish) or
  // archived. Archived stays archived (we don't restore via the UI;
  // delete the row in admin if it was a mistake).
  if (from === "archived") {
    return { ok: false, error: "Archived announcements cannot change status." };
  }
  if (from === "draft" && to === "published") return { ok: true, next: to };
  if (from === "draft" && to === "archived") return { ok: true, next: to };
  if (from === "published" && to === "draft") return { ok: true, next: to };
  if (from === "published" && to === "archived") return { ok: true, next: to };
  return { ok: false, error: "Invalid status transition." };
}
