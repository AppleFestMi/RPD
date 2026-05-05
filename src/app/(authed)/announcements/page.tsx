/**
 * /announcements — landing.
 *
 * Filters: all (default), pinned, requires acknowledgment, my unacknowledged,
 * archived (managers only). The list is server-rendered; permissions and
 * visibility (`canSeeAnnouncement`) are evaluated for each row before it
 * renders. Pinned announcements always sort first within the visible set.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import {
  AUDIENCE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AudienceScope,
} from "@/lib/announcements/types";
import { canSeeAnnouncement } from "@/lib/announcements/policy";
import { priorityTone, statusTone } from "@/lib/announcements/badges";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

type Filter = "all" | "pinned" | "ack" | "unack" | "archived";

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const actor = await requireActor("/announcements");
  await requirePermission(actor, "announcements.read");

  const sp = await searchParams;
  const filter = (["all", "pinned", "ack", "unack", "archived"] as Filter[]).includes(
    sp.filter as Filter,
  )
    ? (sp.filter as Filter)
    : "all";

  const canCreate = can(actor, "announcements.create");
  const canManage = can(actor, "announcements.manage");

  const now = new Date();

  // Pull a generous batch and filter visibility in memory. The list is
  // small enough (department-internal); paginate later if it isn't.
  const includeArchived = filter === "archived" && canManage;
  const rows = await prisma.announcement.findMany({
    where: {
      ...(includeArchived ? { status: "archived" } : { status: { in: ["published"] } }),
    },
    include: { acks: { where: { userId: actor.userId }, select: { id: true } } },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const visible = rows.filter((a) =>
    canSeeAnnouncement(
      { permissionKeys: actor.permissionKeys, roleKeys: actor.roleKeys },
      {
        status: a.status as AnnouncementStatus,
        audience: a.audience as AudienceScope,
        publishedAt: a.publishedAt,
        expiresAt: a.expiresAt,
        archivedAt: a.archivedAt,
      },
      now,
    ),
  );

  const filtered = visible.filter((a) => {
    if (filter === "pinned") return a.pinned;
    if (filter === "ack") return a.requiresAcknowledgment;
    if (filter === "unack") return a.requiresAcknowledgment && a.acks.length === 0;
    if (filter === "archived") return a.status === "archived";
    return true;
  });

  // Audit-log the surface view at admin-relevant filters so a later
  // reviewer can see who looked at the archived list.
  if (filter === "archived") {
    const h = await headers();
    await auditLog({
      actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
      eventType: EVENTS.AUDIT_VIEWED,
      action: "view",
      result: "success",
      requestId: h.get("x-request-id"),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
      metadata: { surface: "announcements.archived", count: filtered.length },
    });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        eyebrow="Announcements"
        title="Department announcements"
        description="Briefings, policy reminders, training notices, and other administrative posts. Acknowledgments are audit-logged."
        actions={
          canCreate ? (
            <Button href="/announcements/new" variant="accent" size="md">
              + New announcement
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader title="Filters" />
        <CardBody>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <FilterChip filter="all" current={filter}>
              All ({visible.length})
            </FilterChip>
            <FilterChip filter="pinned" current={filter}>
              Pinned ({visible.filter((a) => a.pinned).length})
            </FilterChip>
            <FilterChip filter="ack" current={filter}>
              Requires ack ({visible.filter((a) => a.requiresAcknowledgment).length})
            </FilterChip>
            <FilterChip filter="unack" current={filter}>
              My unacknowledged (
              {visible.filter((a) => a.requiresAcknowledgment && a.acks.length === 0).length})
            </FilterChip>
            {canManage ? (
              <FilterChip filter="archived" current={filter}>
                Archived
              </FilterChip>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Icon.Bell size={20} />}
              title={
                filter === "all"
                  ? "No announcements right now"
                  : filter === "pinned"
                    ? "No pinned announcements"
                    : filter === "unack"
                      ? "No outstanding acknowledgments"
                      : filter === "archived"
                        ? "No archived announcements"
                        : "No matching announcements"
              }
              description="When command staff posts a briefing or policy notice, it will appear here."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtered.map((a) => (
            <AnnouncementRow
              key={a.id}
              row={{
                id: a.id,
                title: a.title,
                category: a.category ?? null,
                audience: a.audience as AudienceScope,
                priority: a.priority as AnnouncementPriority,
                status: a.status as AnnouncementStatus,
                pinned: a.pinned,
                requiresAcknowledgment: a.requiresAcknowledgment,
                publishedAt: a.publishedAt,
                expiresAt: a.expiresAt,
                acknowledgedByMe: a.acks.length > 0,
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterChip({
  filter,
  current,
  children,
}: {
  filter: Filter;
  current: Filter;
  children: React.ReactNode;
}) {
  const active = filter === current;
  return (
    <Link
      href={filter === "all" ? "/announcements" : `/announcements?filter=${filter}`}
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

function AnnouncementRow({
  row,
}: {
  row: {
    id: string;
    title: string;
    category: string | null;
    audience: AudienceScope;
    priority: AnnouncementPriority;
    status: AnnouncementStatus;
    pinned: boolean;
    requiresAcknowledgment: boolean;
    publishedAt: Date | null;
    expiresAt: Date | null;
    acknowledgedByMe: boolean;
  };
}) {
  return (
    <li>
      <Link
        href={`/announcements/${row.id}`}
        className="block rounded-lg border border-line bg-white p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/20"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {row.pinned ? <Badge tone="info">Pinned</Badge> : null}
              {row.priority !== "normal" ? (
                <Badge tone={priorityTone(row.priority)}>
                  {PRIORITY_LABELS[row.priority]}
                </Badge>
              ) : null}
              {row.requiresAcknowledgment && !row.acknowledgedByMe ? (
                <Badge tone="warn" dot>
                  Action required
                </Badge>
              ) : null}
              {row.requiresAcknowledgment && row.acknowledgedByMe ? (
                <Badge tone="ok">Acknowledged</Badge>
              ) : null}
              {row.status !== "published" ? (
                <Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status]}</Badge>
              ) : null}
            </div>
            <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-ink">{row.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text3">
              {row.category ? <span>{row.category}</span> : null}
              {row.category ? <span aria-hidden="true">·</span> : null}
              <span>Audience: {AUDIENCE_LABELS[row.audience]}</span>
              {row.publishedAt ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Published{" "}
                    {row.publishedAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </>
              ) : null}
              {row.expiresAt ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Expires {row.expiresAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
