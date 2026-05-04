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
import { utcMidnight } from "@/lib/schedule/time";

async function ctx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

const STATE = z.enum(["available", "preferred", "unavailable"]);

const CREATE = z.object({
  date: z.string().min(8).max(40),
  startMinute: z.number().int().min(0).max(2880),
  endMinute: z.number().int().min(1).max(2880),
  state: STATE,
  notes: z.string().max(500).optional().default(""),
  recurrenceText: z.string().max(120).optional().default(""),
});

export async function createAvailability(input: z.infer<typeof CREATE>) {
  const actor = await requireActor("/schedule/availability");
  await requirePermission(actor, "availability.manage.own");
  const c = await ctx();
  const parsed = CREATE.parse(input);
  const v = validateNotes(parsed.notes);
  if (!v.ok) return { ok: false as const, error: notesErrorMessage(v)! };
  if (parsed.endMinute <= parsed.startMinute) {
    return { ok: false as const, error: "End must be after start." };
  }

  const row = await prisma.availabilityBlock.create({
    data: {
      userId: actor.userId,
      date: utcMidnight(new Date(parsed.date)),
      startMinute: parsed.startMinute,
      endMinute: parsed.endMinute,
      state: parsed.state,
      notes: parsed.notes || null,
      recurrenceText: parsed.recurrenceText || null,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_AVAILABILITY_CREATED,
    entityType: "AvailabilityBlock",
    entityId: row.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      date: row.date.toISOString().slice(0, 10),
      startMinute: row.startMinute,
      endMinute: row.endMinute,
      state: row.state,
    },
  });

  revalidatePath("/schedule/availability");
  return { ok: true as const, blockId: row.id };
}

const ID = z.object({ blockId: z.string().min(1).max(40) });

export async function deleteAvailability(input: z.infer<typeof ID>) {
  const actor = await requireActor();
  await requirePermission(actor, "availability.manage.own");
  const c = await ctx();
  const { blockId } = ID.parse(input);

  const row = await prisma.availabilityBlock.findUnique({ where: { id: blockId } });
  if (!row) return { ok: false as const, error: "Block not found." };
  if (row.userId !== actor.userId) {
    return { ok: false as const, error: "Cannot delete another user's availability." };
  }

  await prisma.availabilityBlock.delete({ where: { id: blockId } });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.SCHEDULE_AVAILABILITY_DELETED,
    entityType: "AvailabilityBlock",
    entityId: blockId,
    action: "delete",
    result: "success",
    ...c,
  });

  revalidatePath("/schedule/availability");
  return { ok: true as const };
}
