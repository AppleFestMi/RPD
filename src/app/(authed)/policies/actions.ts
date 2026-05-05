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
import { ingestUpload } from "@/lib/files/service";
import { validatePolicyTransition } from "@/lib/policies/policy";
import type { PolicyStatus } from "@/lib/policies/types";

async function loggingCtx() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };
}

function checkBoundary(text: string): { ok: true } | { ok: false; error: string } {
  const v = validateNotes(text);
  if (v.ok) return { ok: true };
  return { ok: false, error: notesErrorMessage(v) ?? "Content blocked by boundary policy." };
}

const META_SCHEMA = z.object({
  number: z.string().min(1).max(20),
  title: z.string().min(1).max(200),
  category: z.string().max(80).optional().default(""),
  version: z.string().min(1).max(20),
  effectiveDate: z.string().min(8).max(40),
  reviewDate: z.string().max(40).optional().default(""),
  summary: z.string().max(2000).optional().default(""),
  requiresAcknowledgment: z.boolean().optional().default(true),
  publishNow: z.boolean().optional().default(false),
});

/**
 * Create a policy from a multipart form submission. The file part is
 * mandatory unless the actor explicitly creates a metadata-only draft;
 * for MVP we require it on every create to keep the data model simple
 * (a published policy without a document is meaningless).
 */
export async function createPolicy(formData: FormData): Promise<
  { ok: true; policyId: string } | { ok: false; error: string }
> {
  const actor = await requireActor("/policies/new");
  await requirePermission(actor, "policies.manage");
  const c = await loggingCtx();

  const meta = META_SCHEMA.safeParse({
    number: String(formData.get("number") ?? ""),
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    version: String(formData.get("version") ?? ""),
    effectiveDate: String(formData.get("effectiveDate") ?? ""),
    reviewDate: String(formData.get("reviewDate") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    requiresAcknowledgment: formData.get("requiresAcknowledgment") === "on",
    publishNow: formData.get("publishNow") === "on",
  });
  if (!meta.success) {
    return { ok: false, error: meta.error.errors[0]?.message ?? "Invalid input." };
  }

  for (const t of [meta.data.title, meta.data.summary]) {
    const v = checkBoundary(t);
    if (!v.ok) return { ok: false, error: v.error };
  }

  const effectiveAt = new Date(meta.data.effectiveDate);
  if (isNaN(effectiveAt.getTime())) return { ok: false, error: "Invalid effective date." };
  let reviewDate: Date | null = null;
  if (meta.data.reviewDate) {
    reviewDate = new Date(meta.data.reviewDate);
    if (isNaN(reviewDate.getTime())) return { ok: false, error: "Invalid review date." };
  }

  // Refuse duplicate (number, version) pair early so the user sees a
  // clear error rather than a Prisma unique-constraint error.
  const dup = await prisma.policyDocument.findFirst({
    where: { number: meta.data.number, version: meta.data.version },
  });
  if (dup) return { ok: false, error: `Policy ${meta.data.number} version ${meta.data.version} already exists.` };

  // Required: a single file upload field named "file".
  const fileField = formData.get("file");
  if (!(fileField instanceof File) || fileField.size === 0) {
    return { ok: false, error: "A policy document file is required." };
  }
  const bytes = Buffer.from(await fileField.arrayBuffer());

  const ingest = await ingestUpload({
    actor,
    bytes,
    originalFilename: fileField.name,
    mimeType: fileField.type,
    kind: "policy",
    classification: "operational",
    ctx: c,
  });
  if (!ingest.ok) return { ok: false, error: ingest.error };

  const wantsPublish =
    meta.data.publishNow && actor.permissionKeys.includes("policies.publish");

  const policy = await prisma.policyDocument.create({
    data: {
      number: meta.data.number,
      title: meta.data.title,
      category: meta.data.category || null,
      version: meta.data.version,
      effectiveAt,
      reviewDate,
      summary: meta.data.summary || null,
      status: wantsPublish ? "published" : "draft",
      requiresAcknowledgment: meta.data.requiresAcknowledgment,
      fileId: ingest.fileId,
      createdById: actor.userId,
      publishedAt: wantsPublish ? new Date() : null,
      publishedById: wantsPublish ? actor.userId : null,
    },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_CREATED,
    entityType: "PolicyDocument",
    entityId: policy.id,
    action: "create",
    result: "success",
    ...c,
    metadata: {
      number: policy.number,
      version: policy.version,
      category: policy.category,
      requiresAcknowledgment: policy.requiresAcknowledgment,
      fileId: ingest.fileId,
      status: policy.status,
    },
  });
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_UPLOADED,
    entityType: "PolicyDocument",
    entityId: policy.id,
    action: "upload",
    result: "success",
    ...c,
    metadata: { fileId: ingest.fileId },
  });
  if (wantsPublish) {
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.POLICY_PUBLISHED,
      entityType: "PolicyDocument",
      entityId: policy.id,
      action: "publish",
      result: "success",
      ...c,
    });
  }

  revalidatePath("/policies");
  return { ok: true, policyId: policy.id };
}

const ID_SCHEMA = z.object({ policyId: z.string().min(1).max(40) });

export async function publishPolicy(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "policies.publish");
  const c = await loggingCtx();
  const { policyId } = ID_SCHEMA.parse(input);

  const before = await prisma.policyDocument.findUnique({ where: { id: policyId } });
  if (!before) return { ok: false as const, error: "Policy not found." };
  if (!before.fileId) {
    return { ok: false as const, error: "Cannot publish a policy without an attached document." };
  }

  const t = validatePolicyTransition(before.status as PolicyStatus, "published");
  if (!t.ok) return { ok: false as const, error: t.error };

  await prisma.policyDocument.update({
    where: { id: policyId },
    data: { status: "published", publishedAt: new Date(), publishedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_PUBLISHED,
    entityType: "PolicyDocument",
    entityId: policyId,
    action: "publish",
    result: "success",
    ...c,
    metadata: { number: before.number, version: before.version },
  });

  revalidatePath(`/policies/${policyId}`);
  revalidatePath("/policies");
  return { ok: true as const };
}

export async function unpublishPolicy(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "policies.publish");
  const c = await loggingCtx();
  const { policyId } = ID_SCHEMA.parse(input);

  const before = await prisma.policyDocument.findUnique({ where: { id: policyId } });
  if (!before) return { ok: false as const, error: "Policy not found." };
  const t = validatePolicyTransition(before.status as PolicyStatus, "draft");
  if (!t.ok) return { ok: false as const, error: t.error };

  await prisma.policyDocument.update({
    where: { id: policyId },
    data: { status: "draft" },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_UPDATED,
    entityType: "PolicyDocument",
    entityId: policyId,
    action: "unpublish",
    result: "success",
    ...c,
    metadata: { number: before.number, version: before.version, oldStatus: "published", newStatus: "draft" },
  });

  revalidatePath(`/policies/${policyId}`);
  revalidatePath("/policies");
  return { ok: true as const };
}

export async function archivePolicy(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "policies.manage");
  const c = await loggingCtx();
  const { policyId } = ID_SCHEMA.parse(input);

  const before = await prisma.policyDocument.findUnique({ where: { id: policyId } });
  if (!before) return { ok: false as const, error: "Policy not found." };
  const t = validatePolicyTransition(before.status as PolicyStatus, "archived");
  if (!t.ok) return { ok: false as const, error: t.error };

  await prisma.policyDocument.update({
    where: { id: policyId },
    data: { status: "archived", archivedAt: new Date(), archivedById: actor.userId },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_ARCHIVED,
    entityType: "PolicyDocument",
    entityId: policyId,
    action: "archive",
    result: "success",
    ...c,
    metadata: { number: before.number, version: before.version },
  });

  revalidatePath(`/policies/${policyId}`);
  revalidatePath("/policies");
  return { ok: true as const };
}

export async function acknowledgePolicy(input: z.infer<typeof ID_SCHEMA>) {
  const actor = await requireActor();
  await requirePermission(actor, "policies.acknowledge");
  const c = await loggingCtx();
  const { policyId } = ID_SCHEMA.parse(input);

  const policy = await prisma.policyDocument.findUnique({ where: { id: policyId } });
  if (!policy) return { ok: false as const, error: "Policy not found." };
  if (policy.status !== "published") {
    return { ok: false as const, error: "Only published policies can be acknowledged." };
  }
  if (!policy.requiresAcknowledgment) {
    return { ok: false as const, error: "This policy does not require acknowledgment." };
  }

  // Idempotent on (policyId, userId). Re-clicking returns alreadyAcknowledged.
  const existing = await prisma.policyAcknowledgment.findUnique({
    where: { policyId_userId: { policyId, userId: actor.userId } },
  });
  if (existing) return { ok: true as const, alreadyAcknowledged: true };

  const ack = await prisma.policyAcknowledgment.create({
    data: { policyId, userId: actor.userId, policyVersion: policy.version },
  });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.POLICY_ACK,
    entityType: "PolicyDocument",
    entityId: policyId,
    action: "acknowledge",
    result: "success",
    ...c,
    metadata: { ackId: ack.id, policyNumber: policy.number, policyVersion: policy.version },
  });

  revalidatePath(`/policies/${policyId}`);
  return { ok: true as const, alreadyAcknowledged: false };
}
