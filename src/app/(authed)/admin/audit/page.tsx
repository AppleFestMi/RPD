import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { AuditClient } from "./AuditClient";
import { buildWhere } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = {
  from?: string;
  to?: string;
  eventType?: string;
  result?: "success" | "failure" | "denied";
  actorUserId?: string;
  entityType?: string;
  page?: string;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("/admin/audit");
  await requirePermission(actor, "audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const filter = {
    from: validIso(sp.from),
    to: validIso(sp.to),
    eventType: sp.eventType?.trim() || undefined,
    result: sp.result || undefined,
    actorUserId: sp.actorUserId?.trim() || undefined,
    entityType: sp.entityType?.trim() || undefined,
  };

  const where = buildWhere(filter);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Resolve a small actor lookup for display.
  const actorIds = Array.from(new Set(rows.map((r) => r.actorUserId).filter(Boolean) as string[]));
  const actorMap = new Map<string, { email: string; name: string }>(
    (
      await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, name: true },
      })
    ).map((u) => [u.id, { email: u.email, name: u.name }]),
  );

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
    metadata: { surface: "admin.audit", filter, page },
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
      <p className="mt-1 text-sm text-text3">
        Append-only system events. Reading this page is itself logged.
      </p>

      <AuditClient
        filter={filter}
        rows={rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          actorUserId: r.actorUserId,
          actorEmail: r.actorUserId ? (actorMap.get(r.actorUserId)?.email ?? null) : null,
          actorName: r.actorUserId ? (actorMap.get(r.actorUserId)?.name ?? null) : null,
          actorRoleSnapshot: r.actorRoleSnapshot,
          eventType: r.eventType,
          entityType: r.entityType,
          entityId: r.entityId,
          action: r.action,
          result: r.result,
          ip: r.actorIp,
          userAgent: r.actorUserAgent,
          requestId: r.requestId,
          metadata: r.metadata,
        }))}
        total={total}
        page={page}
        totalPages={totalPages}
      />
    </main>
  );
}

function validIso(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}
