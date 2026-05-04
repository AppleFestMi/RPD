import { describe, expect, it } from "vitest";
import {
  findApplicantOverlap,
  findDoubleBooking,
  findSwapReplacementOverlap,
  findTimeOffConflicts,
  validateOpenShiftFillable,
  validateShiftTimes,
} from "@/lib/schedule/conflicts";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("validateShiftTimes", () => {
  it("rejects end before start", () => {
    expect(validateShiftTimes({ startMinute: 600, endMinute: 600 })).toEqual({
      kind: "shift-end-before-start",
    });
    expect(validateShiftTimes({ startMinute: 600, endMinute: 540 })).toEqual({
      kind: "shift-end-before-start",
    });
  });
  it("accepts overnight (end > start across midnight)", () => {
    expect(validateShiftTimes({ startMinute: 1260, endMinute: 1860 })).toBeNull();
  });
});

describe("findDoubleBooking", () => {
  const proposed = { id: "S1", date: day("2026-05-04"), startMinute: 7 * 60, endMinute: 17 * 60 };
  it("flags overlap with another live shift", () => {
    const conflicts = findDoubleBooking({
      userId: "u1",
      proposedShift: proposed,
      existingAssignments: [
        {
          id: "a1",
          userId: "u1",
          status: "scheduled",
          shift: {
            id: "S2",
            date: day("2026-05-04"),
            startMinute: 16 * 60,
            endMinute: 22 * 60,
            status: "published",
          },
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("double-booked");
  });
  it("ignores assignments for other users", () => {
    expect(
      findDoubleBooking({
        userId: "u1",
        proposedShift: proposed,
        existingAssignments: [
          { id: "a1", userId: "u2", status: "scheduled", shift: { ...proposed, id: "S2" } },
        ],
      }),
    ).toEqual([]);
  });
  it("ignores cancelled or archived parent shifts", () => {
    expect(
      findDoubleBooking({
        userId: "u1",
        proposedShift: proposed,
        existingAssignments: [
          { id: "a1", userId: "u1", status: "scheduled", shift: { ...proposed, id: "S2", status: "cancelled" } },
          { id: "a2", userId: "u1", status: "scheduled", shift: { ...proposed, id: "S3", status: "archived" } },
        ],
      }),
    ).toEqual([]);
  });
  it("ignores the proposed assignment itself when given", () => {
    expect(
      findDoubleBooking({
        userId: "u1",
        proposedShift: proposed,
        proposedAssignmentId: "a1",
        existingAssignments: [
          { id: "a1", userId: "u1", status: "scheduled", shift: { ...proposed, id: "S2" } },
        ],
      }),
    ).toEqual([]);
  });
});

describe("findTimeOffConflicts", () => {
  const proposed = { id: "S1", date: day("2026-05-04"), startMinute: 7 * 60, endMinute: 17 * 60 };
  it("only counts approved time-off", () => {
    const tof = (status: "approved" | "pending" | "denied") => [
      {
        id: "t1",
        userId: "u1",
        status,
        startMs: day("2026-05-04").getTime() + 8 * 60 * 60_000,
        endMs: day("2026-05-04").getTime() + 12 * 60 * 60_000,
      },
    ];
    expect(
      findTimeOffConflicts({ userId: "u1", proposedShift: proposed, approvedTimeOff: tof("approved") }),
    ).toHaveLength(1);
    expect(
      findTimeOffConflicts({ userId: "u1", proposedShift: proposed, approvedTimeOff: tof("pending") }),
    ).toHaveLength(0);
  });
});

describe("validateOpenShiftFillable", () => {
  it("only open is fillable", () => {
    expect(validateOpenShiftFillable({ openShiftId: "o1", status: "open" })).toBeNull();
    expect(validateOpenShiftFillable({ openShiftId: "o1", status: "filled" })).toEqual({
      kind: "open-shift-already-filled",
      openShiftId: "o1",
    });
    expect(validateOpenShiftFillable({ openShiftId: "o1", status: "cancelled" })).toEqual({
      kind: "open-shift-already-filled",
      openShiftId: "o1",
    });
  });
});

describe("findApplicantOverlap", () => {
  it("flags applicant already assigned to overlapping shift", () => {
    const c = findApplicantOverlap({
      userId: "u1",
      openShiftId: "O1",
      openShiftSlot: { date: day("2026-05-04"), startMinute: 7 * 60, endMinute: 17 * 60 },
      existingAssignments: [
        {
          id: "a1",
          userId: "u1",
          status: "scheduled",
          shift: { id: "S2", date: day("2026-05-04"), startMinute: 9 * 60, endMinute: 12 * 60 },
        },
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("applicant-already-assigned");
  });
});

describe("findSwapReplacementOverlap", () => {
  it("flags replacement double-book and ignores their own outbound shift", () => {
    const original = { id: "Sa", date: day("2026-05-04"), startMinute: 17 * 60, endMinute: 23 * 60 };
    const c = findSwapReplacementOverlap({
      replacementUserId: "u2",
      originalShift: original,
      existingAssignments: [
        // Their own swapped-out shift — should be ignored.
        { id: "ax", userId: "u2", status: "scheduled", shift: { id: "Sb", date: day("2026-05-04"), startMinute: 18 * 60, endMinute: 22 * 60 } },
        // Genuinely conflicting shift.
        { id: "ay", userId: "u2", status: "scheduled", shift: { id: "Sc", date: day("2026-05-04"), startMinute: 19 * 60, endMinute: 21 * 60 } },
      ],
      ignoreShiftId: "Sb",
    });
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("swap-replacement-already-assigned");
  });
});
