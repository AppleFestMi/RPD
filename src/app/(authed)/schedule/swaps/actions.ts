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
import { findSwapReplacementOverlap } from "@/lib/schedule/conflicts";

async function ctx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

const REQUEST = z.object({
  fromShiftId: z.string().min(1).max(40),
  toUserId: z.string().min(1).max(40),
  toShiftId: z.string().max(40).optional().default(""),
  reason: z.string().max(500).optional().default(""),
});

/** Requester (current user) asks `toUserId` to take their `fromShiftId`. */
export async function requestSwap(input: z.infer<typeof REQUEST>) {
  const actor = await requireActor("/schedule/swaps");
  await requirePermission(actor, "schedule.swap.request");
  const c = await ctx();
  const parsed = REQUEST.parse(input);
  const v = validateNotes(parsed.reason);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  // Caller must be currently assigned to fromShift.
  const myAssignment = await prisma.scheduleAssignment.findFirst({
    where: {
      shiftId: parsed.fromShiftId,
      userId: actor.userId,
      status: { in: ["scheduled", "pending", "changed"] },
    },
  });
  if (!myAssignment) {
    return { ok: false as const, error: "You are not assigned to that shift." };
  }
  if (parsed.toUserId === actor.userId) {
    return { ok: false as const, error: "You cannot swap with yourself." };
  }

  const swap = await prisma.shiftSwapRequest.create({
    data: {
      fromUserId: actor.userId,
      toUserId: parsed.toUserId,
      fromShiftId: parsed.fromShiftId,
      toShiftId: parsed.toShiftId || null,
      reason: parsed.reason || null,
      status: "submitted",
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_REQUESTED,
    entityType: "ShiftSwapRequest",
    entityId: swap.id,
    action: "request",
    result: "success",
    ...c,
    metadata: {
      fromShiftId: parsed.fromShiftId,
      toShiftId: parsed.toShiftId || undefined,
      affectedUserId: parsed.toUserId,
    },
  });

  revalidatePath("/schedule/swaps");
  return { ok: true as const, swapId: swap.id };
}

const ID = z.object({ swapId: z.string().min(1).max(40) });

/** Replacement user accepts the proposal — moves to supervisorReview. */
export async function acceptAsReplacement(input: z.infer<typeof ID>) {
  const actor = await requireActor();
  const c = await ctx();
  const { swapId } = ID.parse(input);
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: swapId } });
  if (!swap) return { ok: false as const, error: "Swap not found." };
  if (swap.toUserId !== actor.userId) return { ok: false as const, error: "Only the proposed replacement can accept." };
  if (swap.status !== "submitted") return { ok: false as const, error: "Swap is no longer awaiting acceptance." };

  await prisma.shiftSwapRequest.update({
    where: { id: swapId },
    data: { status: "acceptedByReplacement", replacementAcceptedAt: new Date() },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_REPLACEMENT_ACCEPTED,
    entityType: "ShiftSwapRequest",
    entityId: swapId,
    action: "accept",
    result: "success",
    ...c,
  });

  revalidatePath("/schedule/swaps");
  return { ok: true as const };
}

export async function declineAsReplacement(input: z.infer<typeof ID>) {
  const actor = await requireActor();
  const c = await ctx();
  const { swapId } = ID.parse(input);
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: swapId } });
  if (!swap) return { ok: false as const, error: "Swap not found." };
  if (swap.toUserId !== actor.userId) return { ok: false as const, error: "Only the proposed replacement can decline." };
  if (!["submitted", "acceptedByReplacement"].includes(swap.status)) {
    return { ok: false as const, error: "Swap is no longer awaiting your decision." };
  }

  await prisma.shiftSwapRequest.update({
    where: { id: swapId },
    data: { status: "cancelled" },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_REPLACEMENT_DECLINED,
    entityType: "ShiftSwapRequest",
    entityId: swapId,
    action: "decline",
    result: "success",
    ...c,
  });
  revalidatePath("/schedule/swaps");
  return { ok: true as const };
}

const REVIEW = z.object({
  swapId: z.string().min(1).max(40),
  reason: z.string().max(500).optional().default(""),
});

export async function approveSwap(input: z.infer<typeof REVIEW>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.swap.approve");
  const c = await ctx();
  const parsed = REVIEW.parse(input);
  const v = validateNotes(parsed.reason);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const swap = await prisma.shiftSwapRequest.findUnique({
    where: { id: parsed.swapId },
    include: {
      fromUser: { select: { id: true } },
      toUser: { select: { id: true } },
    },
  });
  if (!swap) return { ok: false as const, error: "Swap not found." };
  if (!["acceptedByReplacement", "supervisorReview", "submitted"].includes(swap.status)) {
    return { ok: false as const, error: "Swap is in a non-approvable state." };
  }

  // Conflict: replacement double-book on the original shift.
  const fromShift = await prisma.scheduleShift.findUnique({ where: { id: swap.fromShiftId } });
  if (!fromShift) return { ok: false as const, error: "Original shift no longer exists." };

  const live = await prisma.scheduleAssignment.findMany({
    where: {
      userId: swap.toUserId,
      status: { in: ["scheduled", "pending", "changed"] },
      shift: { archivedAt: null, status: { not: "cancelled" } },
    },
    include: { shift: true },
  });

  // exactOptionalPropertyTypes: omit `ignoreShiftId` rather than passing
  // `undefined`, since the helper's signature is `ignoreShiftId?: string`.
  const overlapInput = {
    replacementUserId: swap.toUserId,
    originalShift: {
      id: fromShift.id,
      date: fromShift.date,
      startMinute: fromShift.startMinute,
      endMinute: fromShift.endMinute,
    },
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
    ...(swap.toShiftId ? { ignoreShiftId: swap.toShiftId } : {}),
  };
  const overlap = findSwapReplacementOverlap(overlapInput);
  if (overlap.length > 0) {
    return { ok: false as const, error: "Replacement user has a conflicting assignment." };
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Remove requester from original shift.
    await tx.scheduleAssignment.updateMany({
      where: {
        shiftId: swap.fromShiftId,
        userId: swap.fromUserId,
        status: { in: ["scheduled", "pending", "changed"] },
      },
      data: { status: "removed", removedAt: new Date(), removedById: actor.userId },
    });
    // Assign replacement to original shift.
    await tx.scheduleAssignment.create({
      data: {
        shiftId: swap.fromShiftId,
        userId: swap.toUserId,
        status: "changed",
        createdById: actor.userId,
        notes: parsed.reason || null,
      },
    });
    // If a 1-for-1 swap, do the inverse on the replacement's shift.
    if (swap.toShiftId) {
      await tx.scheduleAssignment.updateMany({
        where: {
          shiftId: swap.toShiftId,
          userId: swap.toUserId,
          status: { in: ["scheduled", "pending", "changed"] },
        },
        data: { status: "removed", removedAt: new Date(), removedById: actor.userId },
      });
      await tx.scheduleAssignment.create({
        data: {
          shiftId: swap.toShiftId,
          userId: swap.fromUserId,
          status: "changed",
          createdById: actor.userId,
          notes: parsed.reason || null,
        },
      });
    }
    await tx.shiftSwapRequest.update({
      where: { id: swap.id },
      data: {
        status: "approved",
        decidedById: actor.userId,
        decidedAt: new Date(),
        reason: parsed.reason || swap.reason,
      },
    });
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_APPROVED,
    entityType: "ShiftSwapRequest",
    entityId: swap.id,
    action: "approve",
    result: "success",
    ...c,
    metadata: { fromShiftId: swap.fromShiftId, toShiftId: swap.toShiftId ?? undefined, fromUserId: swap.fromUserId, toUserId: swap.toUserId },
  });

  revalidatePath("/schedule/swaps");
  revalidatePath("/schedule");
  return { ok: true as const };
}

export async function denySwap(input: z.infer<typeof REVIEW>) {
  const actor = await requireActor();
  await requirePermission(actor, "schedule.swap.approve");
  const c = await ctx();
  const parsed = REVIEW.parse(input);
  const v = validateNotes(parsed.reason);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };

  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: parsed.swapId } });
  if (!swap) return { ok: false as const, error: "Swap not found." };
  if (["approved", "denied", "cancelled"].includes(swap.status)) {
    return { ok: false as const, error: "Already decided." };
  }

  await prisma.shiftSwapRequest.update({
    where: { id: parsed.swapId },
    data: { status: "denied", decidedById: actor.userId, decidedAt: new Date(), reason: parsed.reason || swap.reason },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_DENIED,
    entityType: "ShiftSwapRequest",
    entityId: parsed.swapId,
    action: "deny",
    result: "success",
    ...c,
  });

  revalidatePath("/schedule/swaps");
  return { ok: true as const };
}

export async function cancelSwap(input: z.infer<typeof ID>) {
  const actor = await requireActor();
  const c = await ctx();
  const { swapId } = ID.parse(input);
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: swapId } });
  if (!swap) return { ok: false as const, error: "Swap not found." };
  if (swap.fromUserId !== actor.userId) return { ok: false as const, error: "Only the requester can cancel." };
  if (["approved", "denied", "cancelled"].includes(swap.status)) {
    return { ok: false as const, error: "Already decided." };
  }
  await prisma.shiftSwapRequest.update({ where: { id: swapId }, data: { status: "cancelled" } });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SWAP_CANCELLED,
    entityType: "ShiftSwapRequest",
    entityId: swapId,
    action: "cancel",
    result: "success",
    ...c,
  });
  revalidatePath("/schedule/swaps");
  return { ok: true as const };
}
