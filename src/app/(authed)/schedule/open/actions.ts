"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { validateNotes, notesErrorMessage } from "@/lib/schedule/notes";
import {
  findApplicantOverlap,
  validateOpenShiftFillable,
  validateShiftTimes,
} from "@/lib/schedule/conflicts";
import { utcMidnight } from "@/lib/schedule/time";

async function ctx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

const TYPE = z.enum(["ot", "reserve", "event", "dispatch", "other"]);

const CREATE = z.object({
  shiftId: z.string().min(1).max(40).optional(),
  date: z.string().min(8).max(40),
  startMinute: z.number().int().min(0).max(2880),
  endMinute: z.number().int().min(1).max(2880),
  post: z.string().min(1).max(120),
  location: z.string().max(120).optional().default(""),
  type: TYPE,
  eligibilityRole: z.string().max(40).optional().default(""),
  closesAt: z.string().min(0).max(40).optional().default(""),
  notes: z.string().max(1500).optional().default(""),
});

export async function createOpenShift(input: z.infer<typeof CREATE>) {
  const actor = await requireActor("/schedule/open");
  await requirePermission(actor, "schedule.update");
  const c = await ctx();
  const parsed = CREATE.parse(input);
  const v = validateNotes(parsed.notes);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };
  // Build the call without a `shiftId: undefined` slot, since the
  // helper's signature is `shiftId?: string` under
  // exactOptionalPropertyTypes (no `| undefined`).
  const timesInput =
    parsed.shiftId !== undefined
      ? { startMinute: parsed.startMinute, endMinute: parsed.endMinute, shiftId: parsed.shiftId }
      : { startMinute: parsed.startMinute, endMinute: parsed.endMinute };
  if (validateShiftTimes(timesInput)) {
    return { ok: false as const, error: "End must be after start." };
  }

  const closesAt = parsed.closesAt ? new Date(parsed.closesAt) : null;
  if (closesAt && isNaN(closesAt.getTime())) {
    return { ok: false as const, error: "Invalid closesAt." };
  }

  const row = await prisma.openShift.create({
    data: {
      shiftId: parsed.shiftId || null,
      date: utcMidnight(new Date(parsed.date)),
      startMinute: parsed.startMinute,
      endMinute: parsed.endMinute,
      post: parsed.post,
      location: parsed.location || null,
      type: parsed.type,
      eligibilityRole: parsed.eligibilityRole || null,
      closesAt,
      notes: parsed.notes || null,
      status: "open",
      createdById: actor.userId,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_CREATED,
    entityType: "OpenShift",
    entityId: row.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      eligibilityRole: row.eligibilityRole,
      post: row.post,
    },
  });

  revalidatePath("/schedule/open");
  return { ok: true as const, openShiftId: row.id };
}

const APPLY = z.object({ openShiftId: z.string().min(1).max(40) });

export async function applyToOpenShift(input: z.infer<typeof APPLY>) {
  const actor = await requireActor("/schedule/open");
  await requirePermission(actor, "schedule.requestPickup");
  const c = await ctx();
  const { openShiftId } = APPLY.parse(input);

  const open = await prisma.openShift.findUnique({ where: { id: openShiftId } });
  if (!open) return { ok: false as const, error: "Open shift not found." };
  if (open.status !== "open") return { ok: false as const, error: "This open shift is no longer accepting applications." };
  if (open.closesAt && open.closesAt < new Date()) {
    return { ok: false as const, error: "Application window has closed." };
  }
  if (open.eligibilityRole && !actor.roleKeys.includes(open.eligibilityRole)) {
    return { ok: false as const, error: "You are not eligible for this open shift." };
  }

  const existing = await prisma.openShiftApplication.findUnique({
    where: { openShiftId_userId: { openShiftId, userId: actor.userId } },
  });
  if (existing && existing.decision !== "withdrawn") {
    return { ok: false as const, error: "You have already applied." };
  }

  const application = await prisma.openShiftApplication.upsert({
    where: { openShiftId_userId: { openShiftId, userId: actor.userId } },
    create: { openShiftId, userId: actor.userId, decision: "pending" },
    update: { decision: "pending", decidedAt: null, decidedById: null, comment: null },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_APP_CREATED,
    entityType: "OpenShiftApplication",
    entityId: application.id,
    action: "create",
    result: "success",
    ...c,
    metadata: { openShiftId, applicantId: actor.userId },
  });

  revalidatePath("/schedule/open");
  return { ok: true as const };
}

const WITHDRAW = z.object({ applicationId: z.string().min(1).max(40) });

export async function withdrawApplication(input: z.infer<typeof WITHDRAW>) {
  const actor = await requireActor();
  // Users can withdraw their own application; we authorize via ownership.
  const c = await ctx();
  const { applicationId } = WITHDRAW.parse(input);
  const app = await prisma.openShiftApplication.findUnique({ where: { id: applicationId } });
  if (!app) return { ok: false as const, error: "Application not found." };
  if (app.userId !== actor.userId) return { ok: false as const, error: "Not your application." };
  if (app.decision === "approved") return { ok: false as const, error: "Already approved — contact a supervisor." };

  await prisma.openShiftApplication.update({
    where: { id: applicationId },
    data: { decision: "withdrawn", decidedAt: new Date() },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_APP_WITHDRAWN,
    entityType: "OpenShiftApplication",
    entityId: applicationId,
    action: "withdraw",
    result: "success",
    ...c,
    metadata: { openShiftId: app.openShiftId },
  });

  revalidatePath("/schedule/open");
  return { ok: true as const };
}

const REVIEW = z.object({
  applicationId: z.string().min(1).max(40),
  decisionNotes: z.string().max(500).optional().default(""),
});

export async function approvePickup(input: z.infer<typeof REVIEW>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.approvePickup");
  const c = await ctx();
  const { applicationId, decisionNotes } = REVIEW.parse(input);
  const v = validateNotes(decisionNotes);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const app = await prisma.openShiftApplication.findUnique({
    where: { id: applicationId },
    include: { openShift: true },
  });
  if (!app) return { ok: false as const, error: "Application not found." };
  if (app.decision !== "pending") return { ok: false as const, error: "Already decided." };

  const open = app.openShift;
  const fillable = validateOpenShiftFillable({ openShiftId: open.id, status: open.status as never });
  if (fillable) return { ok: false as const, error: "Open shift is no longer fillable." };

  // Conflict: applicant already on overlapping live shift.
  const live = await prisma.scheduleAssignment.findMany({
    where: {
      userId: app.userId,
      status: { in: ["scheduled", "pending", "changed"] },
      shift: { archivedAt: null, status: { not: "cancelled" } },
    },
    include: { shift: true },
  });
  const overlap = findApplicantOverlap({
    userId: app.userId,
    openShiftSlot: { date: open.date, startMinute: open.startMinute, endMinute: open.endMinute },
    openShiftId: open.id,
    existingAssignments: live.map((a) => ({
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
  if (overlap.length > 0) {
    return { ok: false as const, error: "Applicant has an overlapping live assignment." };
  }

  // Apply: create or upgrade assignment for the parent shift; close open posting.
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (open.shiftId) {
      await tx.scheduleAssignment.create({
        data: {
          shiftId: open.shiftId,
          userId: app.userId,
          status: "scheduled",
          createdById: actor.userId,
          notes: decisionNotes || null,
        },
      });
    }
    await tx.openShiftApplication.update({
      where: { id: applicationId },
      data: {
        decision: "approved",
        decidedById: actor.userId,
        decidedAt: new Date(),
        comment: decisionNotes || null,
      },
    });
    await tx.openShift.update({
      where: { id: open.id },
      data: { status: "filled" },
    });
    // Cancel other pending applications for this open shift.
    await tx.openShiftApplication.updateMany({
      where: { openShiftId: open.id, decision: "pending", id: { not: applicationId } },
      data: { decision: "withdrawn", decidedAt: new Date(), comment: "Auto-withdrawn: shift filled." },
    });
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_APP_APPROVED,
    entityType: "OpenShiftApplication",
    entityId: applicationId,
    action: "approve",
    result: "success",
    ...c,
    metadata: { openShiftId: open.id, applicantId: app.userId },
  });

  revalidatePath("/schedule/open");
  revalidatePath("/schedule");
  return { ok: true as const };
}

export async function denyPickup(input: z.infer<typeof REVIEW>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.approvePickup");
  const c = await ctx();
  const { applicationId, decisionNotes } = REVIEW.parse(input);
  const v = validateNotes(decisionNotes);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const app = await prisma.openShiftApplication.findUnique({ where: { id: applicationId } });
  if (!app) return { ok: false as const, error: "Application not found." };
  if (app.decision !== "pending") return { ok: false as const, error: "Already decided." };

  await prisma.openShiftApplication.update({
    where: { id: applicationId },
    data: {
      decision: "denied",
      decidedById: actor.userId,
      decidedAt: new Date(),
      comment: decisionNotes || null,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_APP_DENIED,
    entityType: "OpenShiftApplication",
    entityId: applicationId,
    action: "deny",
    result: "success",
    ...c,
    metadata: { openShiftId: app.openShiftId, applicantId: app.userId },
  });

  revalidatePath("/schedule/open");
  return { ok: true as const };
}

const CLOSE = z.object({ openShiftId: z.string().min(1).max(40) });

export async function closeOpenShift(input: z.infer<typeof CLOSE>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.update");
  const c = await ctx();
  const { openShiftId } = CLOSE.parse(input);

  const o = await prisma.openShift.findUnique({ where: { id: openShiftId } });
  if (!o) return { ok: false as const, error: "Open shift not found." };
  if (o.status !== "open") return { ok: false as const, error: "Already closed/filled/cancelled." };

  await prisma.$transaction([
    prisma.openShift.update({ where: { id: openShiftId }, data: { status: "closed" } }),
    prisma.openShiftApplication.updateMany({
      where: { openShiftId, decision: "pending" },
      data: { decision: "withdrawn", decidedAt: new Date(), comment: "Auto-withdrawn: posting closed." },
    }),
  ]);

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.OPEN_SHIFT_CLOSED,
    entityType: "OpenShift",
    entityId: openShiftId,
    action: "close",
    result: "success",
    ...c,
  });

  revalidatePath("/schedule/open");
  return { ok: true as const };
}
