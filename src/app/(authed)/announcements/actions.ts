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
import { validateTransition } from "@/lib/announcements/policy";
import type { AnnouncementStatus } from "@/lib/announcements/types";

async function loggingCtx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

/**
 * Run the schedule notes boundary validator on an announcement field.
 * The validator's prohibited list is the same here — case numbers, LEIN,
 * subject names, etc. — so reusing it keeps the rules in one place.
 */
function checkBoundary(text: string): { ok: true } | { ok: false; error: string } {
  const v = validateNotes(text);
  if (v.ok) return { ok: true };
  return { ok: false, error: notesErrorMessage(v) ?? "Content blocked by boundary policy." };
}

const AUDIENCE = z.enum([
  "all",
  "sworn",
  "patrol",
  "reserves",
  "dispatch",
  "supervisorsOnly",
  "command",
  "admin",
]);
const PRIORITY = z.enum(["normal", "important", "urgent"]);

// ── Create draft ────────────────────────────────────────────────────

const CREATE_SCHEMA = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  category: z.string().max(80).optional().default(""),
  audience: AUDIENCE,
  priority: PRIORITY.optional().default("normal"),
  pinned: z.boolean().optional().default(false),
  requiresAcknowledgment: z.boolean().optional().default(false),
  expiresAt: z.string().max(40).optional().default(""),
  publishNow: z.boolean().optional().default(false),
});

/**
 * Create an announcement. By default it lands in `draft` and a separate
 * publish action moves it to `published`. If `publishNow` is true and the
 * actor has announcements.publish, both happen in one transaction (this
 * is the common path for a supervisor posting today's briefing).
 */
export async function createAnnouncement(input: z.infer<typeof CREATE_SCHEMA>): Promise<
  { ok: true; announcementId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/announcements/new");
  await requirePermission(actor, "announcements.create");
  const c = await loggingCtx();

  const parsed = CREATE_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };

  for (const t of [parsed.data.title, parsed.data.body]) {
    const v = checkBoundary(t);
    if (!v.ok) return { ok: false, error: v.error };
  }

  let expires: Date | null = null;
  if (parsed.data.expiresAt) {
    expires = new Date(parsed.data.expiresAt);
    if (isNaN(expires.getTime())) return { ok: false, error: "Invalid expiry date." };
  }

  // publishNow requires the publish permission. Without it, fall back to draft.
  const wantsPublish =
    parsed.data.publishNow && actor.permissionKeys.includes("announcements.publish");

  const announcement = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category || null,
      audience: parsed.data.audience,
      priority: parsed.data.priority,
      pinned: parsed.data.pinned,
      requiresAcknowledgment: parsed.data.requiresAcknowledgment,
      authorId: actor.userId,
      status: wantsPublish ? "published" : "draft",
      publishedAt: wantsPublish ? new Date() : null,
      publishedById: wantsPublish ? actor.userId : null,
      expiresAt: expires,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_CREATED,
    entityType: "Announcement",
    entityId: announcement.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      category: announcement.category,
      audience: announcement.audience,
      priority: announcement.priority,
      pinned: announcement.pinned,
      requiresAcknowledgment: announcement.requiresAcknowledgment,
      status: announcement.status,
    },
  });
  if (wantsPublish) {
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.ANNOUNCEMENT_PUBLISHED,
      entityType: "Announcement",
      entityId: announcement.id,
      action: "publish",
      result: "success",
      ...c,
      metadata: { audience: announcement.audience, priority: announcement.priority },
    });
  }

  revalidatePath("/announcements");
  return { ok: true, announcementId: announcement.id };
}

// ── Update draft ────────────────────────────────────────────────────

const UPDATE_SCHEMA = CREATE_SCHEMA.extend({
  announcementId: z.string().min(1).max(40),
}).omit({ publishNow: true });

export async function updateAnnouncement(input: z.infer<typeof UPDATE_SCHEMA>): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const actor = await requireActor();
  await requirePermission(actor, "announcements.manage");
  const c = await loggingCtx();
  const parsed = UPDATE_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };

  const before = await prisma.announcement.findUnique({ where: { id: parsed.data.announcementId } });
  if (!before) return { ok: false, error: "Announcement not found." };
  if (before.status === "archived") return { ok: false, error: "Archived announcements cannot be edited." };

  for (const t of [parsed.data.title, parsed.data.body]) {
    const v = checkBoundary(t);
    if (!v.ok) return { ok: false, error: v.error };
  }
  let expires: Date | null = null;
  if (parsed.data.expiresAt) {
    expires = new Date(parsed.data.expiresAt);
    if (isNaN(expires.getTime())) return { ok: false, error: "Invalid expiry date." };
  }

  await prisma.announcement.update({
    where: { id: before.id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category || null,
      audience: parsed.data.audience,
      priority: parsed.data.priority,
      pinned: parsed.data.pinned,
      requiresAcknowledgment: parsed.data.requiresAcknowledgment,
      expiresAt: expires,
      updatedById: actor.userId,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_UPDATED,
    entityType: "Announcement",
    entityId: before.id,
    action: "update",
    result: "success",
    ...c,
    metadata: {
      category: parsed.data.category || null,
      audience: parsed.data.audience,
      priority: parsed.data.priority,
      pinned: parsed.data.pinned,
      requiresAcknowledgment: parsed.data.requiresAcknowledgment,
    },
  });

  revalidatePath(`/announcements/${before.id}`);
  revalidatePath("/announcements");
  return { ok: true };
}

// ── Publish / Unpublish / Archive ───────────────────────────────────

const ID_SCHEMA = z.object({ announcementId: z.string().min(1).max(40) });

export async function publishAnnouncement(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "announcements.publish");
  const c = await loggingCtx();
  const { announcementId } = ID_SCHEMA.parse(input);
  const before = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!before) return { ok: false as const, error: "Announcement not found." };

  const t = validateTransition(before.status as AnnouncementStatus, "published");
  if (!t.ok) return { ok: false as const, error: t.error };

  await prisma.announcement.update({
    where: { id: before.id },
    data: { status: "published", publishedAt: new Date(), publishedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_PUBLISHED,
    entityType: "Announcement",
    entityId: before.id,
    action: "publish",
    result: "success",
    ...c,
    metadata: { audience: before.audience, priority: before.priority },
  });

  revalidatePath(`/announcements/${before.id}`);
  revalidatePath("/announcements");
  return { ok: true as const };
}

export async function unpublishAnnouncement(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "announcements.publish");
  const c = await loggingCtx();
  const { announcementId } = ID_SCHEMA.parse(input);
  const before = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!before) return { ok: false as const, error: "Announcement not found." };

  const t = validateTransition(before.status as AnnouncementStatus, "draft");
  if (!t.ok) return { ok: false as const, error: t.error };

  await prisma.announcement.update({
    where: { id: before.id },
    data: { status: "draft" },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_UNPUBLISHED,
    entityType: "Announcement",
    entityId: before.id,
    action: "unpublish",
    result: "success",
    ...c,
  });

  revalidatePath(`/announcements/${before.id}`);
  revalidatePath("/announcements");
  return { ok: true as const };
}

export async function archiveAnnouncement(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "announcements.manage");
  const c = await loggingCtx();
  const { announcementId } = ID_SCHEMA.parse(input);
  const before = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!before) return { ok: false as const, error: "Announcement not found." };

  const t = validateTransition(before.status as AnnouncementStatus, "archived");
  if (!t.ok) return { ok: false as const, error: t.error };

  const now = new Date();
  await prisma.announcement.update({
    where: { id: before.id },
    data: { status: "archived", archivedAt: now, archivedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_ARCHIVED,
    entityType: "Announcement",
    entityId: before.id,
    action: "archive",
    result: "success",
    ...c,
  });

  revalidatePath(`/announcements/${before.id}`);
  revalidatePath("/announcements");
  return { ok: true as const };
}

// ── Acknowledge ─────────────────────────────────────────────────────

export async function acknowledgeAnnouncement(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "announcements.acknowledge");
  const c = await loggingCtx();
  const { announcementId } = ID_SCHEMA.parse(input);

  const ann = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!ann) return { ok: false as const, error: "Announcement not found." };
  if (ann.status !== "published") {
    return { ok: false as const, error: "Only published announcements can be acknowledged." };
  }
  if (!ann.requiresAcknowledgment) {
    return { ok: false as const, error: "This announcement does not require acknowledgment." };
  }
  if (ann.expiresAt && ann.expiresAt < new Date()) {
    return { ok: false as const, error: "This announcement has expired." };
  }

  // Idempotent: upsert on the unique (announcementId, userId) constraint.
  // If the actor already acknowledged, the timestamp stays at its first
  // value — re-clicking is a no-op.
  const existing = await prisma.announcementAcknowledgment.findUnique({
    where: { announcementId_userId: { announcementId, userId: actor.userId } },
  });
  if (existing) return { ok: true as const, alreadyAcknowledged: true };

  const ack = await prisma.announcementAcknowledgment.create({
    data: { announcementId, userId: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.ANNOUNCEMENT_ACK,
    entityType: "Announcement",
    entityId: announcementId,
    action: "acknowledge",
    result: "success",
    ...c,
    metadata: { ackId: ack.id },
  });

  revalidatePath(`/announcements/${announcementId}`);
  return { ok: true as const, alreadyAcknowledged: false };
}
