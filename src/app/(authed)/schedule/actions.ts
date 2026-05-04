"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { validateNotes, notesErrorMessage } from "@/lib/schedule/notes";
import {
  findDoubleBooking,
  findTimeOffConflicts,
  validateShiftTimes,
  type Conflict,
} from "@/lib/schedule/conflicts";
import { utcMidnight } from "@/lib/schedule/time";

const CATEGORY = z.enum([
  "patrol",
  "dispatch",
  "reserve",
  "command",
  "sro",
  "event",
  "training",
  "court",
  "admin",
]);

const SHIFT_BASE = z.object({
  date: z.string().min(8).max(40), // ISO; we re-anchor to UTC midnight
  label: z.string().min(1).max(120),
  category: CATEGORY,
  startMinute: z.number().int().min(0).max(2880),
  endMinute: z.number().int().min(1).max(2880),
  location: z.string().max(120).optional().default(""),
  requiredRole: z.string().max(40).optional().default(""),
  notes: z.string().max(1500).optional().default(""),
});

async function ctx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

function parseInputDate(s: string): Date {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error("Invalid date");
  return utcMidnight(d);
}

// ── Create / update shift ─────────────────────────────────────────────

export async function createShift(input: z.infer<typeof SHIFT_BASE>): Promise<
  { ok: true; shiftId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/schedule");
  await requirePermission(actor, "schedule.create");
  const c = await ctx();

  const parsed = SHIFT_BASE.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const v = validateNotes(parsed.data.notes);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };

  const timeProblem = validateShiftTimes(parsed.data);
  if (timeProblem) return { ok: false, error: "Shift end must be after start." };

  const date = parseInputDate(parsed.data.date);
  const shift = await prisma.scheduleShift.create({
    data: {
      date,
      label: parsed.data.label,
      category: parsed.data.category,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      location: parsed.data.location || null,
      requiredRole: parsed.data.requiredRole || null,
      notes: parsed.data.notes || null,
      status: "draft",
      createdById: actor.userId,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_SHIFT_CREATED,
    entityType: "ScheduleShift",
    entityId: shift.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      date: date.toISOString().slice(0, 10),
      label: shift.label,
      category: shift.category,
      startMinute: shift.startMinute,
      endMinute: shift.endMinute,
    },
  });

  revalidatePath("/schedule");
  return { ok: true, shiftId: shift.id };
}

const UPDATE = SHIFT_BASE.extend({ shiftId: z.string().min(1).max(40) });

export async function updateShift(input: z.infer<typeof UPDATE>): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const actor = await requireActor("/schedule");
  await requirePermission(actor, "schedule.update");
  const c = await ctx();

  const parsed = UPDATE.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  const v = validateNotes(parsed.data.notes);
  if (!v.ok) return { ok: false, error: notesErrorMessage(v)! };
  if (validateShiftTimes(parsed.data)) return { ok: false, error: "Shift end must be after start." };

  const before = await prisma.scheduleShift.findUnique({ where: { id: parsed.data.shiftId } });
  if (!before) return { ok: false, error: "Shift not found." };
  if (before.archivedAt) return { ok: false, error: "Cannot edit an archived shift." };

  const date = parseInputDate(parsed.data.date);
  // If the shift was already published, mark it changed.
  const nextStatus =
    before.status === "published" ? "changed" : before.status === "changed" ? "changed" : before.status;

  await prisma.scheduleShift.update({
    where: { id: parsed.data.shiftId },
    data: {
      date,
      label: parsed.data.label,
      category: parsed.data.category,
      startMinute: parsed.data.startMinute,
      endMinute: parsed.data.endMinute,
      location: parsed.data.location || null,
      requiredRole: parsed.data.requiredRole || null,
      notes: parsed.data.notes || null,
      status: nextStatus,
      updatedById: actor.userId,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_SHIFT_UPDATED,
    entityType: "ScheduleShift",
    entityId: before.id,
    action: "update",
    result: "success",
    ...c,
    metadata: {
      old: summarize(before),
      new: { ...parsed.data, date: date.toISOString().slice(0, 10) },
    },
  });

  revalidatePath("/schedule");
  return { ok: true };
}

const ID = z.object({ shiftId: z.string().min(1).max(40) });

export async function archiveShift(input: z.infer<typeof ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.update");
  const c = await ctx();
  const { shiftId } = ID.parse(input);

  const shift = await prisma.scheduleShift.findUnique({ where: { id: shiftId } });
  if (!shift) return { ok: false as const, error: "Shift not found." };
  if (shift.archivedAt) return { ok: false as const, error: "Already archived." };

  await prisma.$transaction([
    prisma.scheduleShift.update({
      where: { id: shiftId },
      data: { archivedAt: new Date(), archivedById: actor.userId, status: "archived" },
    }),
    prisma.scheduleAssignment.updateMany({
      where: { shiftId, status: { in: ["scheduled", "pending", "changed"] } },
      data: { status: "removed", removedAt: new Date(), removedById: actor.userId },
    }),
    prisma.openShift.updateMany({
      where: { shiftId, status: "open" },
      data: { status: "cancelled" },
    }),
  ]);

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_SHIFT_ARCHIVED,
    entityType: "ScheduleShift",
    entityId: shiftId,
    action: "archive",
    result: "success",
    ...c,
    metadata: { date: shift.date.toISOString().slice(0, 10), label: shift.label },
  });

  revalidatePath("/schedule");
  return { ok: true as const };
}

// ── Assignment ────────────────────────────────────────────────────────

const ASSIGN = z.object({
  shiftId: z.string().min(1).max(40),
  userId: z.string().min(1).max(40),
  assignmentRole: z.string().max(40).optional().default(""),
});

export async function assignUserToShift(input: z.infer<typeof ASSIGN>): Promise<
  { ok: true; warnings: string[] } | { ok: false; error: string }
> {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.update");
  const c = await ctx();
  const parsed = ASSIGN.parse(input);

  const shift = await prisma.scheduleShift.findUnique({ where: { id: parsed.shiftId } });
  if (!shift) return { ok: false, error: "Shift not found." };
  if (shift.archivedAt) return { ok: false, error: "Cannot assign to an archived shift." };

  // Soft conflict warnings — collect, don't block. Caller can re-show form.
  const [otherAssignments, timeOff] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: {
        userId: parsed.userId,
        status: { in: ["scheduled", "pending", "changed"] },
        shift: { archivedAt: null, status: { not: "cancelled" } },
      },
      include: { shift: true },
    }),
    prisma.timeOffRequest.findMany({
      where: {
        userId: parsed.userId,
        status: "approved",
        endDate: { gte: shift.date },
      },
    }),
  ]);

  const warnings: string[] = [];
  const dbl = findDoubleBooking({
    userId: parsed.userId,
    proposedShift: { id: shift.id, date: shift.date, startMinute: shift.startMinute, endMinute: shift.endMinute },
    existingAssignments: otherAssignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      status: a.status,
      shift: {
        id: a.shift.id,
        date: a.shift.date,
        startMinute: a.shift.startMinute,
        endMinute: a.shift.endMinute,
        status: a.shift.status,
      },
    })),
  });
  if (dbl.length > 0) warnings.push(`User is already assigned to an overlapping shift.`);

  const tof = findTimeOffConflicts({
    userId: parsed.userId,
    proposedShift: { id: shift.id, date: shift.date, startMinute: shift.startMinute, endMinute: shift.endMinute },
    approvedTimeOff: timeOff.map((t) => ({
      id: t.id,
      userId: t.userId,
      startMs: t.startDate.getTime(),
      endMs: t.endDate.getTime(),
      status: "approved",
    })),
  });
  if (tof.length > 0) warnings.push("User has approved time-off overlapping this shift.");

  const assignment = await prisma.scheduleAssignment.create({
    data: {
      shiftId: shift.id,
      userId: parsed.userId,
      assignmentRole: parsed.assignmentRole || null,
      status: shift.status === "published" || shift.status === "changed" ? "changed" : "scheduled",
      createdById: actor.userId,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_SHIFT_ASSIGNED,
    entityType: "ScheduleShift",
    entityId: shift.id,
    action: "assign",
    result: "success",
    ...c,
    metadata: {
      assignmentId: assignment.id,
      affectedUserId: parsed.userId,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  });

  revalidatePath("/schedule");
  return { ok: true, warnings };
}

const UNASSIGN = z.object({ assignmentId: z.string().min(1).max(40) });

export async function unassignFromShift(input: z.infer<typeof UNASSIGN>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.update");
  const c = await ctx();
  const { assignmentId } = UNASSIGN.parse(input);

  const a = await prisma.scheduleAssignment.findUnique({ where: { id: assignmentId } });
  if (!a) return { ok: false as const, error: "Assignment not found." };

  await prisma.scheduleAssignment.update({
    where: { id: assignmentId },
    data: { status: "removed", removedAt: new Date(), removedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_SHIFT_UNASSIGNED,
    entityType: "ScheduleShift",
    entityId: a.shiftId,
    action: "unassign",
    result: "success",
    ...c,
    metadata: { assignmentId, affectedUserId: a.userId },
  });

  revalidatePath("/schedule");
  return { ok: true as const };
}

// ── Publish ──────────────────────────────────────────────────────────

const PUBLISH = z.object({
  weekStart: z.string().min(8).max(40),
  /** Must equal the calculated unpublished count, as a confirmation. */
  expectShifts: z.number().int().min(0).optional(),
});

/**
 * Publishes all draft and changed shifts whose `date` falls inside the
 * Mon-Sun week beginning at `weekStart`. Idempotent — already-published,
 * cancelled, archived shifts are skipped.
 *
 * "Publish" is the moment the schedule becomes operational truth. We log
 * it carefully and surface a count summary to the UI before commit.
 */
export async function publishWeek(input: z.infer<typeof PUBLISH>): Promise<
  | { ok: true; publishedCount: number; weekStart: string }
  | { ok: false; error: string; warnings?: string[] }
> {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.publish");
  const c = await ctx();
  const parsed = PUBLISH.parse(input);

  const start = utcMidnight(new Date(parsed.weekStart));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const candidates = await prisma.scheduleShift.findMany({
    where: {
      date: { gte: start, lt: end },
      status: { in: ["draft", "changed"] },
      archivedAt: null,
    },
  });

  if (parsed.expectShifts !== undefined && parsed.expectShifts !== candidates.length) {
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.SCHEDULE_PUBLISH_FAILED,
      action: "publish",
      result: "failure",
      ...c,
      metadata: {
        weekStart: start.toISOString().slice(0, 10),
        reason: "count_mismatch",
        expected: parsed.expectShifts,
        actual: candidates.length,
      },
    });
    return {
      ok: false,
      error: "Schedule changed since you opened the publish dialog. Reload and try again.",
    };
  }

  const ids = candidates.map((s) => s.id);
  const now = new Date();

  await prisma.scheduleShift.updateMany({
    where: { id: { in: ids } },
    data: { status: "published", publishedAt: now, publishedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_PUBLISHED,
    action: "publish",
    result: "success",
    ...c,
    metadata: {
      weekStart: start.toISOString().slice(0, 10),
      publishedCount: ids.length,
      shiftIds: ids.slice(0, 50), // bounded
    },
  });

  revalidatePath("/schedule");
  return { ok: true, publishedCount: ids.length, weekStart: start.toISOString().slice(0, 10) };
}

// ── Helpers ──────────────────────────────────────────────────────────

function summarize(s: {
  date: Date;
  label: string;
  category: string;
  startMinute: number;
  endMinute: number;
  status: string;
}) {
  return {
    date: s.date.toISOString().slice(0, 10),
    label: s.label,
    category: s.category,
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    status: s.status,
  };
}
