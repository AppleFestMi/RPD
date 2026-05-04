/**
 * Schedule conflict detection.
 *
 * Pure functions over plain shapes. Server actions load the relevant rows
 * from Prisma, hand them to these helpers, and surface the result to the
 * UI. Keeping this layer pure makes it trivially testable and easy to
 * change the storage backing later without re-deriving the rules.
 */
import { slotsOverlap, type Slot } from "./time";

// ── Inputs ────────────────────────────────────────────────────────────

export type ShiftLike = Slot & {
  id: string;
  status?: "draft" | "published" | "changed" | "cancelled" | "archived";
};

export type AssignmentLike = {
  id: string;
  userId: string | null;
  status?: "scheduled" | "open" | "changed" | "pending" | "removed" | "cancelled";
  shift: ShiftLike;
};

export type TimeOffLike = {
  id: string;
  userId: string;
  /** Time-off uses absolute UTC instants, not the slot model. */
  startMs: number;
  endMs: number;
  status?: "pending" | "approved" | "denied" | "withdrawn";
};

// ── Output ────────────────────────────────────────────────────────────

export type Conflict =
  | {
      kind: "double-booked";
      userId: string;
      a: { shiftId: string; assignmentId?: string };
      b: { shiftId: string; assignmentId?: string };
    }
  | {
      kind: "approved-time-off-overlap";
      userId: string;
      shiftId: string;
      timeOffId: string;
    }
  | {
      kind: "open-shift-already-filled";
      openShiftId: string;
    }
  | {
      kind: "applicant-already-assigned";
      userId: string;
      openShiftId: string;
      conflictingShiftId: string;
    }
  | {
      kind: "shift-end-before-start";
      shiftId?: string;
    }
  | {
      kind: "swap-replacement-already-assigned";
      replacementUserId: string;
      conflictingShiftId: string;
    };

// ── Validators ────────────────────────────────────────────────────────

/**
 * Reject impossible shift times. End must be strictly greater than start.
 * (Equal is rejected — a 0-minute shift is not a real shift.)
 */
export function validateShiftTimes(input: {
  startMinute: number;
  endMinute: number;
  shiftId?: string;
}): Conflict | null {
  if (input.endMinute <= input.startMinute) {
    // Build the result without a `shiftId` key when the caller didn't
    // supply one. exactOptionalPropertyTypes forbids `shiftId: undefined`.
    return input.shiftId !== undefined
      ? { kind: "shift-end-before-start", shiftId: input.shiftId }
      : { kind: "shift-end-before-start" };
  }
  return null;
}

/**
 * Find all conflicts caused by adding a new assignment for `userId` on
 * `proposedShift`, given the user's existing live assignments.
 *
 * "Live" means status NOT in {removed, cancelled} and the parent shift
 * NOT in {cancelled, archived}. Caller is responsible for filtering.
 */
export function findDoubleBooking(input: {
  userId: string;
  proposedShift: ShiftLike;
  existingAssignments: AssignmentLike[];
  proposedAssignmentId?: string;
}): Conflict[] {
  const out: Conflict[] = [];
  for (const a of input.existingAssignments) {
    if (a.userId !== input.userId) continue;
    if (a.id === input.proposedAssignmentId) continue;
    if (a.shift.id === input.proposedShift.id) continue;
    if (a.shift.status === "cancelled" || a.shift.status === "archived") continue;
    if (slotsOverlap(a.shift, input.proposedShift)) {
      out.push({
        kind: "double-booked",
        userId: input.userId,
        a: { shiftId: input.proposedShift.id },
        b: { shiftId: a.shift.id, assignmentId: a.id },
      });
    }
  }
  return out;
}

/**
 * Approved time-off overlapping a proposed assignment is a hard warning
 * (rendered as such in the UI; whether to block or allow is a policy
 * decision left to the action).
 */
export function findTimeOffConflicts(input: {
  userId: string;
  proposedShift: ShiftLike;
  approvedTimeOff: TimeOffLike[];
}): Conflict[] {
  const out: Conflict[] = [];
  const start = input.proposedShift.date.getTime() + input.proposedShift.startMinute * 60_000;
  const end = input.proposedShift.date.getTime() + input.proposedShift.endMinute * 60_000;
  for (const t of input.approvedTimeOff) {
    if (t.userId !== input.userId) continue;
    if (t.status && t.status !== "approved") continue;
    if (start < t.endMs && t.startMs < end) {
      out.push({
        kind: "approved-time-off-overlap",
        userId: input.userId,
        shiftId: input.proposedShift.id,
        timeOffId: t.id,
      });
    }
  }
  return out;
}

/**
 * Reject re-fill of an already-filled or closed/cancelled open shift.
 */
export function validateOpenShiftFillable(input: {
  openShiftId: string;
  status: "open" | "closed" | "filled" | "cancelled";
}): Conflict | null {
  if (input.status !== "open") {
    return { kind: "open-shift-already-filled", openShiftId: input.openShiftId };
  }
  return null;
}

/**
 * Block approving a pickup application when the applicant already has an
 * overlapping live assignment. Use the same time bounds as the open shift.
 */
export function findApplicantOverlap(input: {
  userId: string;
  openShiftSlot: Slot;
  openShiftId: string;
  existingAssignments: AssignmentLike[];
}): Conflict[] {
  const proposed: ShiftLike = {
    id: `__open:${input.openShiftId}`,
    date: input.openShiftSlot.date,
    startMinute: input.openShiftSlot.startMinute,
    endMinute: input.openShiftSlot.endMinute,
  };
  return findDoubleBooking({
    userId: input.userId,
    proposedShift: proposed,
    existingAssignments: input.existingAssignments,
  }).map((c) => {
    if (c.kind === "double-booked") {
      return {
        kind: "applicant-already-assigned",
        userId: c.userId,
        openShiftId: input.openShiftId,
        conflictingShiftId: c.b.shiftId,
      };
    }
    return c;
  });
}

/**
 * Block swap approval if the replacement user is already on a shift that
 * overlaps the requester's original shift.
 */
export function findSwapReplacementOverlap(input: {
  replacementUserId: string;
  originalShift: ShiftLike;
  existingAssignments: AssignmentLike[];
  /** The replacement's own swapped-out shift; ignored as a conflict. */
  ignoreShiftId?: string;
}): Conflict[] {
  return findDoubleBooking({
    userId: input.replacementUserId,
    proposedShift: input.originalShift,
    existingAssignments: input.existingAssignments.filter(
      (a) => a.shift.id !== input.ignoreShiftId,
    ),
  }).map((c) => {
    if (c.kind === "double-booked") {
      return {
        kind: "swap-replacement-already-assigned",
        replacementUserId: c.userId,
        conflictingShiftId: c.b.shiftId,
      };
    }
    return c;
  });
}
