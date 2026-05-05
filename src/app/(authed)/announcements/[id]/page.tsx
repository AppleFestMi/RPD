/**
 * /announcements/[id] — single announcement view.
 *
 * Visibility delegated to canSeeAnnouncement; if that returns false the
 * page treats the announcement as not-found rather than leaking its
 * existence with a permission-denied screen.
 */
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { canSeeAnnouncement } from "@/lib/announcements/policy";
import {
  AUDIENCE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AudienceScope,
} from "@/lib/announcements/types";
import { priorityTone, statusTone } from "@/lib/announcements/badges";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { AnnouncementActions } from "./AnnouncementActions";
import { AcknowledgePanel } from "./AcknowledgePanel";

export const dynamic = "force-dynamic";

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor("/announcements");
  await requirePermission(actor, "announcements.read");
  const { id } = await params;

  const a = await prisma.announcement.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, badge: true, rank: true, email: true } },
      acks: {
        include: { user: { select: { name: true, badge: true } } },
        orderBy: { acknowledgedAt: "asc" },
        take: 200,
      },
    },
  });
  if (!a) notFound();

  const visible = canSeeAnnouncement(
    { permissionKeys: actor.permissionKeys, roleKeys: actor.roleKeys },
    {
      status: a.status as AnnouncementStatus,
      audience: a.audience as AudienceScope,
      publishedAt: a.publishedAt,
      expiresAt: a.expiresAt,
      archivedAt: a.archivedAt,
    },
  );
  if (!visible) notFound();

  const myAck = a.acks.find((ack) => ack.userId === actor.userId) ?? null;
  const canManage = can(actor, "announcements.manage");
  const canPublish = can(actor, "announcements.publish");
  const canAck = can(actor, "announcements.acknowledge");

  // Admin viewing the ack roster is itself an audit event so reviewers
  // can reconstruct who looked at compliance details.
  if (canManage && a.acks.length > 0) {
    const h = await headers();
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.ANNOUNCEMENT_ACK_VIEWED,
      entityType: "Announcement",
      entityId: a.id,
      action: "view",
      result: "success",
      requestId: h.get("x-request-id"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
      metadata: { ackCount: a.acks.length },
    });
  }

  const status = a.status as AnnouncementStatus;
  const priority = a.priority as AnnouncementPriority;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6">
      <Link href="/announcements" className="text-[13px] text-text3 hover:text-text2">
        ← All announcements
      </Link>

      <PageHeader
        eyebrow={a.category ?? "Announcement"}
        title={a.title}
        description={
          <span className="font-mono text-[12px] text-text3">
            #{a.id.slice(0, 8)} ·{" "}
            {a.publishedAt
              ? `published ${a.publishedAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : "draft"}
          </span>
        }
        actions={
          <>
            {a.pinned ? <Badge tone="info">Pinned</Badge> : null}
            {priority !== "normal" ? (
              <Badge tone={priorityTone(priority)}>{PRIORITY_LABELS[priority]}</Badge>
            ) : null}
            <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Body" />
            <CardBody>
              <article className="prose prose-sm max-w-none whitespace-pre-wrap text-[14px] leading-relaxed text-text2">
                {a.body}
              </article>
            </CardBody>
          </Card>

          {a.requiresAcknowledgment && status === "published" ? (
            <AcknowledgePanel
              announcementId={a.id}
              alreadyAcknowledged={myAck !== null}
              acknowledgedAt={myAck?.acknowledgedAt.toISOString() ?? null}
              canAck={canAck}
            />
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-1.5 text-[13px]">
                <Row label="Audience">{AUDIENCE_LABELS[a.audience as AudienceScope]}</Row>
                <Row label="Priority">{PRIORITY_LABELS[priority]}</Row>
                <Row label="Status">
                  <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>
                </Row>
                {a.category ? <Row label="Category">{a.category}</Row> : null}
                <Row label="Author">
                  {a.author.name}
                  {a.author.rank ? ` · ${a.author.rank}` : ""}
                </Row>
                {a.publishedAt ? (
                  <Row label="Published">
                    {a.publishedAt.toLocaleString()}
                  </Row>
                ) : null}
                {a.expiresAt ? <Row label="Expires">{a.expiresAt.toLocaleString()}</Row> : null}
                {a.requiresAcknowledgment ? (
                  <Row label="Acks">
                    <span className="font-mono">{a.acks.length}</span>
                  </Row>
                ) : null}
              </dl>
            </CardBody>
          </Card>

          {(canPublish || canManage) && status !== "archived" ? (
            <Card>
              <CardHeader title="Manage" />
              <CardBody>
                <AnnouncementActions
                  announcementId={a.id}
                  status={status}
                  canPublish={canPublish}
                  canManage={canManage}
                />
              </CardBody>
            </Card>
          ) : null}

          {canManage && a.requiresAcknowledgment && a.acks.length > 0 ? (
            <Card>
              <CardHeader
                title="Acknowledged by"
                meta={<Badge tone="ok">{a.acks.length}</Badge>}
              />
              <CardBody>
                <ul className="space-y-1.5 text-[13px]">
                  {a.acks.map((ack) => (
                    <li
                      key={ack.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-neutral-soft/60 px-2 py-1.5"
                    >
                      <span>
                        {ack.user.name}
                        {ack.user.badge ? ` · ${ack.user.badge}` : ""}
                      </span>
                      <span className="text-[11.5px] font-mono text-text3">
                        {ack.acknowledgedAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
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
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1 last:border-b-0">
      <dt className="text-[12px] text-text3">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
