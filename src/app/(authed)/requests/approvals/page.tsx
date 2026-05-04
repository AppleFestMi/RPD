/**
 * /requests/approvals — admin approval queue.
 *
 * Lists open requests that need a supervisor or command decision. Excludes
 * the actor's own requests (a supervisor can submit a request, but cannot
 * decide their own — the action handlers also enforce this).
 */
import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icons";
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  OPEN_REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
} from "@/lib/requests/types";
import { kindTone, statusTone } from "@/lib/requests/badges";

export const dynamic = "force-dynamic";

type SP = { kind?: string; status?: string };

export default async function ApprovalsQueuePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const actor = await requireActor("/requests/approvals");
  // requirePermission emits permission.denied if the actor has neither.
  if (!actor.permissionKeys.includes("requests.approve.command")) {
    await requirePermission(actor, "requests.approve.supervisor");
  }
  const sp = await searchParams;
  const kindFilter =
    sp.kind && Object.keys(REQUEST_KIND_LABELS).includes(sp.kind)
      ? (sp.kind as RequestKind)
      : null;
  const statusFilter =
    sp.status && OPEN_REQUEST_STATUSES.includes(sp.status as RequestStatus)
      ? (sp.status as RequestStatus)
      : null;

  const rows = await prisma.adminRequest.findMany({
    where: {
      userId: { not: actor.userId },
      status: statusFilter ? { equals: statusFilter } : { in: OPEN_REQUEST_STATUSES },
      ...(kindFilter ? { kind: kindFilter } : {}),
    },
    include: {
      user: { select: { name: true, badge: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    requestId: h.get("x-request-id"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    metadata: {
      surface: "requests.approvals",
      filter: { kind: kindFilter, status: statusFilter },
      count: rows.length,
    },
  });

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader
        eyebrow="Requests"
        title="Approval queue"
        description="Open requests waiting on a supervisor or command decision. You cannot decide your own requests."
      />

      <Card>
        <CardHeader title="Filters" />
        <CardBody>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <FilterChip href="/requests/approvals" active={kindFilter === null && statusFilter === null}>
              All
            </FilterChip>
            {(["timeOff", "training", "vehicleIssue", "equipment", "itFacilities"] as RequestKind[]).map((k) => (
              <FilterChip
                key={k}
                href={`/requests/approvals?kind=${k}${statusFilter ? `&status=${statusFilter}` : ""}`}
                active={kindFilter === k}
              >
                {REQUEST_KIND_LABELS[k]}
              </FilterChip>
            ))}
            <span className="mx-1 self-center text-text3/60">·</span>
            {OPEN_REQUEST_STATUSES.map((s) => (
              <FilterChip
                key={s}
                href={`/requests/approvals?status=${s}${kindFilter ? `&kind=${kindFilter}` : ""}`}
                active={statusFilter === s}
              >
                {REQUEST_STATUS_LABELS[s]}
              </FilterChip>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Pending decisions"
          meta={<Badge tone="pending">{rows.length}</Badge>}
        />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Icon.Inbox size={20} />}
              title="Nothing in the queue"
              description="When a request needs a supervisor or command decision, it shows up here."
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-neutral-soft/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={kindTone(r.kind as RequestKind)}>
                          {REQUEST_KIND_LABELS[r.kind as RequestKind]}
                        </Badge>
                        <span className="truncate text-[13.5px] font-medium tracking-tight">
                          {r.title}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-text3">
                        {r.user.name}
                        {r.user.badge ? ` · #${r.user.badge}` : ""}
                        {" · "}
                        Submitted{" "}
                        {r.createdAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                    <Badge tone={statusTone(r.status as RequestStatus)}>
                      {REQUEST_STATUS_LABELS[r.status as RequestStatus]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "rounded-full border px-2.5 py-0.5 transition-colors " +
        (active
          ? "border-accent bg-accent text-white"
          : "border-line bg-white text-text2 hover:bg-neutral-soft")
      }
    >
      {children}
    </Link>
  );
}
