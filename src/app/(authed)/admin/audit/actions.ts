"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { ForbiddenError, requirePermission } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";

const EXPORT_SCHEMA = z.object({
  /** Mirrors the page filter so the audit row is meaningful. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  eventType: z.string().max(64).optional(),
  result: z.enum(["success", "failure", "denied"]).optional(),
  actorUserId: z.string().max(40).optional(),
  entityType: z.string().max(40).optional(),
});

/**
 * Stub — emits the audit events but does not generate a file.
 *
 * The real implementation streams a CSV of the filtered range. Permission
 * is enforced first; permission-denied events are emitted from
 * requirePermission. The export-requested event is emitted on success so
 * downstream review can correlate exports to filters.
 */
export async function requestAuditExport(
  input: z.infer<typeof EXPORT_SCHEMA>,
): Promise<{ ok: true; rowCount: number } | { ok: false; error: string }> {
  const actor = await requireActor("/admin/audit");
  const h = await headers();
  const ctx = {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  };

  try {
    await requirePermission(actor, "audit.export");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      // requirePermission already emits permission.denied; emit the
      // export-specific denial too so audit-export attempts stand out.
      await auditLog({
        actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
        eventType: EVENTS.AUDIT_EXPORT_DENIED,
        action: "export",
        result: "denied",
        ...ctx,
        metadata: input,
      });
    }
    throw e;
  }

  const parsed = EXPORT_SCHEMA.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid filter." };
  }

  const where = buildWhere(parsed.data);
  const rowCount = await prisma.auditLog.count({ where });

  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_EXPORT_REQUESTED,
    action: "export",
    result: "success",
    ...ctx,
    metadata: { ...parsed.data, rowCount, format: "csv-stub" },
  });

  // TODO: stream CSV. For now we report the row count so the UI can hint
  // at the size of the requested export.
  return { ok: true, rowCount };
}

export function buildWhere(filter: z.infer<typeof EXPORT_SCHEMA>) {
  const where: Parameters<typeof prisma.auditLog.findMany>[0] = {};
  const and: Array<NonNullable<typeof where>["AND"]> = [];
  const conds: Array<Record<string, unknown>> = [];
  if (filter.from) conds.push({ createdAt: { gte: new Date(filter.from) } });
  if (filter.to) conds.push({ createdAt: { lte: new Date(filter.to) } });
  if (filter.eventType) conds.push({ eventType: filter.eventType });
  if (filter.result) conds.push({ result: filter.result });
  if (filter.actorUserId) conds.push({ actorUserId: filter.actorUserId });
  if (filter.entityType) conds.push({ entityType: filter.entityType });
  if (conds.length === 0) return {};
  return { AND: conds };
}
