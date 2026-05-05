/**
 * Policy visibility + transition helpers. Pure — no DB.
 *
 * The same shape as canSeeAnnouncement: managers see everything;
 * everyone else sees published + non-archived rows. Drafts stay
 * invisible until publish.
 */
import type { PolicyStatus } from "./types";

export type ViewActor = {
  permissionKeys: string[];
};

export type PolicyForVisibility = {
  status: PolicyStatus;
  archivedAt?: Date | null;
};

export function canSeePolicy(actor: ViewActor, p: PolicyForVisibility): boolean {
  if (actor.permissionKeys.includes("policies.manage")) return true;
  if (p.status !== "published") return false;
  if (p.archivedAt) return false;
  return true;
}

export type StatusTransition =
  | { ok: true; next: PolicyStatus }
  | { ok: false; error: string };

export function validatePolicyTransition(
  from: PolicyStatus,
  to: PolicyStatus,
): StatusTransition {
  if (from === "archived") {
    return { ok: false, error: "Archived policies cannot change status." };
  }
  if (from === to) return { ok: false, error: "No transition." };
  if (from === "draft" && to === "published") return { ok: true, next: to };
  if (from === "draft" && to === "archived") return { ok: true, next: to };
  if (from === "published" && to === "draft") return { ok: true, next: to };
  if (from === "published" && to === "archived") return { ok: true, next: to };
  return { ok: false, error: "Invalid status transition." };
}
