/**
 * Pure policy helpers for the Requests module. No DB access — the
 * server actions that use these load Prisma rows themselves and pass
 * the relevant primitives in.
 *
 * Two questions live here:
 *   1. May this actor see this request?  (canViewRequest)
 *   2. Is this status transition legal, and may this actor make it?
 *      (validateTransition)
 *
 * Self-approval is rejected at this layer so the server action's
 * `requirePermission` doesn't need to understand the actor identity.
 */
import type { RequestStatus } from "./types";

export type ViewActor = {
  userId: string;
  permissionKeys: string[];
};

/** Visible iff actor owns the request OR has requests.read.all. */
export function canViewRequest(actor: ViewActor, request: { userId: string }): boolean {
  if (actor.userId === request.userId) return true;
  return actor.permissionKeys.includes("requests.read.all");
}

export type TransitionDecision =
  | { ok: true; next: RequestStatus }
  | { ok: false; error: string };

/**
 * Whether an actor can move `from` → `to` on a request they don't own.
 *
 * Approver rules:
 *   - Supervisor (requests.approve.supervisor): can approve at supervisorReview
 *     or move submitted → supervisorReview/commandReview/approved/denied/needsMoreInfo.
 *   - Command (requests.approve.command): superset; specifically can approve
 *     at commandReview.
 *   - Self-approval is always blocked (a user with the permission cannot
 *     decide their own request — see canActorDecide below).
 *
 * The helper is conservative: any unrecognized transition fails closed.
 */
export function canActorDecide(input: {
  actorId: string;
  ownerUserId: string;
  permissionKeys: string[];
  decision: "approve" | "deny" | "needsInfo" | "complete";
  /** The request's current AdminRequest.status. */
  currentStatus: RequestStatus;
}): TransitionDecision {
  if (input.actorId === input.ownerUserId) {
    return { ok: false, error: "You cannot decide your own request." };
  }

  const hasSupervisor = input.permissionKeys.includes("requests.approve.supervisor");
  const hasCommand = input.permissionKeys.includes("requests.approve.command");
  if (!hasSupervisor && !hasCommand) {
    return { ok: false, error: "You do not have approval permission." };
  }

  // "complete" is the post-approval handoff — its only legal predecessor
  // is `approved`, so it must be checked BEFORE the open-state guard
  // below (which would otherwise reject every complete attempt as
  // "already decided"). The status stays at `approved`; completion is
  // tracked via REQUEST_COMPLETED in the audit log.
  if (input.decision === "complete") {
    if (input.currentStatus !== "approved") {
      return { ok: false, error: "Only approved requests can be marked completed." };
    }
    return { ok: true, next: "approved" };
  }

  // Approve / deny / needsInfo all require the request to still be open.
  if (
    input.currentStatus === "approved" ||
    input.currentStatus === "denied" ||
    input.currentStatus === "cancelled"
  ) {
    return { ok: false, error: "This request is already decided." };
  }

  switch (input.decision) {
    case "approve": {
      // Command-level approval can land directly. Supervisor approval is
      // permitted unless the request is explicitly at commandReview.
      if (input.currentStatus === "commandReview" && !hasCommand) {
        return { ok: false, error: "Command-level approval is required." };
      }
      return { ok: true, next: "approved" };
    }
    case "deny":
      return { ok: true, next: "denied" };
    case "needsInfo":
      return { ok: true, next: "needsMoreInfo" };
  }
}

/**
 * Whether the request owner can cancel a request. Cancellation is
 * allowed in any pre-decision state.
 */
export function canCancelOwn(input: {
  actorId: string;
  ownerUserId: string;
  currentStatus: RequestStatus;
}): boolean {
  if (input.actorId !== input.ownerUserId) return false;
  return ["submitted", "supervisorReview", "commandReview", "needsMoreInfo"].includes(
    input.currentStatus,
  );
}
