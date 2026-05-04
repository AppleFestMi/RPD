/**
 * /requests/[id] — single-request detail.
 *
 * Visible to the owner (via `requests.read.own`) or anyone with
 * `requests.read.all`. Approvers see decision controls; non-approvers
 * see the comment field but no approve/deny buttons. Owners can cancel
 * pre-decision.
 *
 * Server-side gate is enforced by canViewRequest; the page itself
 * audit-logs an `audit.viewed` for the surface.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { canActorDecide, canCancelOwn, canViewRequest } from "@/lib/requests/policy";
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  type RequestKind,
  type RequestStatus,
} from "@/lib/requests/types";
import { kindTone, statusTone } from "@/lib/requests/badges";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { RequestActions } from "./RequestActions";
import { CommentForm } from "./CommentForm";

export const dynamic = "force-dynamic";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor("/requests");
  const { id } = await params;

  const req = await prisma.adminRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, badge: true, rank: true } },
      timeOffRequest: true,
      trainingRequest: true,
      equipmentRequest: true,
      vehicleIssue: { include: { vehicle: { select: { unit: true, model: true } } } },
      comments: {
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });
  if (!req) notFound();

  if (!canViewRequest({ userId: actor.userId, permissionKeys: actor.permissionKeys }, { userId: req.userId })) {
    notFound();
  }

  // Author IDs for comment display
  const authorIds = Array.from(new Set(req.comments.map((c) => c.authorId)));
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, badge: true },
      })
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    requestId: h.get("x-request-id"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    metadata: { surface: "requests.detail", requestId: req.id, kind: req.kind },
  });

  const status = req.status as RequestStatus;
  const isOwner = req.userId === actor.userId;
  const canApproveSupervisor = can(actor, "requests.approve.supervisor");
  const canApproveCommand = can(actor, "requests.approve.command");
  const decide = canActorDecide({
    actorId: actor.userId,
    ownerUserId: req.userId,
    permissionKeys: actor.permissionKeys,
    decision: "approve",
    currentStatus: status,
  });
  const canDecide = decide.ok || canApproveSupervisor || canApproveCommand;
  const canCancel = canCancelOwn({
    actorId: actor.userId,
    ownerUserId: req.userId,
    currentStatus: status,
  });

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow={`Request · ${REQUEST_KIND_LABELS[req.kind as RequestKind]}`}
        title={req.title}
        description={
          <span className="font-mono text-[12px] text-text3">
            #{req.id.slice(0, 8)} · submitted{" "}
            {req.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        }
        actions={
          <>
            <Badge tone={kindTone(req.kind as RequestKind)}>
              {REQUEST_KIND_LABELS[req.kind as RequestKind]}
            </Badge>
            <Badge tone={statusTone(status)}>{REQUEST_STATUS_LABELS[status]}</Badge>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-2 text-[13px]">
                <Row label="Submitted by">
                  {req.user.name}
                  {req.user.rank ? ` · ${req.user.rank}` : ""}
                  {req.user.badge ? ` · #${req.user.badge}` : ""}
                  <div className="font-mono text-[11.5px] text-text3">{req.user.email}</div>
                </Row>
                <Row label="Status">
                  <Badge tone={statusTone(status)}>{REQUEST_STATUS_LABELS[status]}</Badge>
                </Row>
                {req.timeOffRequest ? (
                  <>
                    <Row label="Time off">
                      {req.timeOffRequest.startDate.toISOString().slice(0, 10)} →{" "}
                      {req.timeOffRequest.endDate.toISOString().slice(0, 10)}
                    </Row>
                    <Row label="Type">{req.timeOffRequest.type}</Row>
                  </>
                ) : null}
                {req.trainingRequest ? (
                  <>
                    <Row label="Course">{req.trainingRequest.courseName}</Row>
                    {req.trainingRequest.cost != null ? (
                      <Row label="Cost">${(req.trainingRequest.cost / 100).toFixed(2)}</Row>
                    ) : null}
                  </>
                ) : null}
                {req.vehicleIssue ? (
                  <>
                    <Row label="Vehicle">
                      {req.vehicleIssue.vehicle.unit} · {req.vehicleIssue.vehicle.model}
                    </Row>
                    <Row label="Priority">{req.vehicleIssue.priority}</Row>
                  </>
                ) : null}
                {req.equipmentRequest ? <Row label="Item">{req.equipmentRequest.item}</Row> : null}
                {req.decidedAt ? (
                  <Row label="Decided">
                    {req.decidedAt.toLocaleString()}{" "}
                    {req.decidedById ? (
                      <span className="text-[11.5px] text-text3">by {req.decidedById}</span>
                    ) : null}
                  </Row>
                ) : null}
              </dl>
              <div className="mt-3 whitespace-pre-wrap rounded-md border border-line bg-neutral-soft/40 p-3 text-[13px]">
                {req.description}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Comments"
              meta={<Badge tone="neutral">{req.comments.length}</Badge>}
            />
            <CardBody>
              {req.comments.length === 0 ? (
                <p className="text-[13px] text-text3">No comments yet.</p>
              ) : (
                <ul className="space-y-3">
                  {req.comments.map((c) => {
                    const a = authorMap.get(c.authorId);
                    return (
                      <li key={c.id} className="rounded-md border border-line/70 bg-white p-3">
                        <div className="flex items-baseline justify-between gap-2 text-[12px]">
                          <span className="font-semibold text-text2">
                            {a?.name ?? c.authorId}
                            {a?.badge ? ` · ${a.badge}` : ""}
                          </span>
                          <span className="text-text3">
                            {c.createdAt.toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-text2">
                          {c.body}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4">
                <CommentForm requestId={req.id} />
              </div>
              <p className="mt-2 text-[11.5px] text-text3">
                Comments are administrative-only. Do not enter case, victim/witness, LEIN/NCIC,
                or investigative content.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          {canDecide && !isOwner ? (
            <Card>
              <CardHeader title="Decide" />
              <CardBody>
                <RequestActions
                  requestId={req.id}
                  currentStatus={status}
                  canApproveSupervisor={canApproveSupervisor}
                  canApproveCommand={canApproveCommand}
                />
              </CardBody>
            </Card>
          ) : null}

          {isOwner && canCancel ? (
            <Card>
              <CardHeader title="Owner actions" />
              <CardBody>
                <RequestActions
                  requestId={req.id}
                  currentStatus={status}
                  canApproveSupervisor={false}
                  canApproveCommand={false}
                  ownerCanCancel
                />
              </CardBody>
            </Card>
          ) : null}

          <BoundaryNotice variant="panel" />
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-1.5 last:border-b-0">
      <dt className="text-text3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
