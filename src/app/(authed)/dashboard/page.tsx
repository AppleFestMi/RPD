/**
 * Dashboard.
 *
 * The Chief's first impression. Shows real data where it exists today
 * (schedule, open shifts, audit, role context) and labels everything
 * else as planned. Every server-side check (requireActor, can,
 * audit logging) is preserved.
 *
 * What's REAL on this page:
 *   - the user's next assigned shift, from ScheduleAssignment
 *   - this week's open-shift count, from OpenShift
 *   - this week's published / draft shift counts, from ScheduleShift
 *   - admin pending approvals (open-shift applications), if visible
 *   - last 24h audit events count, if the user can audit.read
 *   - actor role + permission count
 *
 * What's intentionally placeholder:
 *   - "Today's briefing" body copy (no Announcements module yet)
 *   - "Policy acknowledgments due" (no Policies module yet)
 *   - "Upcoming training" (no Training module yet)
 *   - "Vehicle/equipment issues" (modules not wired)
 * Each placeholder card explicitly says "module pending" and links to
 * the corresponding Coming Soon page so it's not misleading.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { addDays, formatRange, isoDay, startOfWeek } from "@/lib/schedule/time";
import { canSeeAnnouncement } from "@/lib/announcements/policy";
import type {
  AnnouncementPriority,
  AnnouncementStatus,
  AudienceScope,
} from "@/lib/announcements/types";

import { HeroCard } from "@/components/dashboard/HeroCard";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuickActionButton } from "@/components/ui/QuickActionButton";
import { Icon } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActor("/dashboard");
  const h = await headers();

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);

  const canApprovePickup = can(actor, "schedule.approvePickup");
  const canApproveRequests =
    can(actor, "requests.approve.supervisor") || can(actor, "requests.approve.command");
  const canSeeAudit = can(actor, "audit.read");

  // Pull dashboard data in parallel. Everything here is a count or a
  // small slice; nothing fans out to a large query.
  const [
    nextAssignment,
    openShiftsThisWeek,
    publishedThisWeek,
    draftThisWeek,
    pendingPickups,
    last24hAuditCount,
    user,
    myOpenRequestCount,
    pendingRequestApprovalCount,
    announcementCandidates,
  ] = await Promise.all([
    prisma.scheduleAssignment.findFirst({
      where: {
        userId: actor.userId,
        status: { in: ["scheduled", "pending", "changed"] },
        shift: { archivedAt: null, status: { not: "cancelled" }, date: { gte: startOfDayUtc(now) } },
      },
      orderBy: [{ shift: { date: "asc" } }, { shift: { startMinute: "asc" } }],
      include: { shift: true },
    }),
    prisma.openShift.count({
      where: { date: { gte: weekStart, lt: weekEnd }, status: "open" },
    }),
    prisma.scheduleShift.count({
      where: { date: { gte: weekStart, lt: weekEnd }, status: "published", archivedAt: null },
    }),
    prisma.scheduleShift.count({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        status: { in: ["draft", "changed"] },
        archivedAt: null,
      },
    }),
    canApprovePickup
      ? prisma.openShiftApplication.count({ where: { decision: "pending" } })
      : Promise.resolve(0),
    canSeeAudit
      ? prisma.auditLog.count({ where: { createdAt: { gte: addHours(now, -24) } } })
      : Promise.resolve(0),
    prisma.user.findUnique({
      where: { id: actor.userId },
      select: { name: true, rank: true, badge: true },
    }),
    prisma.adminRequest.count({
      where: {
        userId: actor.userId,
        status: { in: ["submitted", "supervisorReview", "commandReview", "needsMoreInfo"] },
      },
    }),
    canApproveRequests
      ? prisma.adminRequest.count({
          where: {
            userId: { not: actor.userId },
            status: { in: ["submitted", "supervisorReview", "commandReview", "needsMoreInfo"] },
          },
        })
      : Promise.resolve(0),
    // Latest published, audience-visible, non-expired announcements.
    // Visibility is filtered in app code post-fetch via canSeeAnnouncement.
    prisma.announcement.findMany({
      where: {
        status: "published",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { acks: { where: { userId: actor.userId }, select: { id: true } } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 8,
    }),
  ]);

  // Filter announcements by audience visibility in app code (the SQL
  // can't express the actor's roleKeys cleanly without a join). The
  // batch is small enough that this is cheap.
  const visibleAnnouncements = announcementCandidates
    .filter((a) =>
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
    )
    .map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      pinned: a.pinned,
      priority: a.priority as AnnouncementPriority,
      requiresAcknowledgment: a.requiresAcknowledgment,
      publishedAt: a.publishedAt,
      acks: a.acks,
    }));

  const unacknowledgedAnnouncementCount = visibleAnnouncements.filter(
    (a) => a.requiresAcknowledgment && a.acks.length === 0,
  ).length;

  // The dashboard view is itself an audit-relevant event (admin surface
  // visibility). We log it once per render with the surface name and
  // the role snapshot so an auditor can reconstruct who saw what.
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    requestId: h.get("x-request-id"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    metadata: { surface: "dashboard.summary" },
  });

  const greeting = greetingFor(now);
  const firstName = user?.name?.split(/\s+/)[0] ?? "";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <HeroCard
        title={`${greeting}${firstName ? `, ${firstName}` : ""}.`}
        description={
          user?.rank || user?.badge
            ? [user?.rank, user?.badge ? `Badge ${user.badge}` : null]
                .filter(Boolean)
                .join(" · ")
            : "Welcome to the Internal Ops portal."
        }
        meta={
          <span className="font-mono">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        }
        actions={
          <>
            <Button href="/schedule" variant="accent" size="md">
              Open schedule
            </Button>
            <Button
              href="/schedule/availability"
              variant="outline"
              size="md"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40"
            >
              Submit availability
            </Button>
          </>
        }
      />

      {unacknowledgedAnnouncementCount > 0 ? (
        <AlertBanner
          tone="warn"
          title={`${unacknowledgedAnnouncementCount} announcement${
            unacknowledgedAnnouncementCount === 1 ? "" : "s"
          } awaiting your acknowledgment`}
          action={
            <Button href="/announcements?filter=unack" variant="primary" size="sm">
              Review
            </Button>
          }
        >
          You won&apos;t be able to clear them by ignoring; the system tracks who has read what.
        </AlertBanner>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="My next shift"
          value={nextAssignment ? formatRange(nextAssignment.shift.startMinute, nextAssignment.shift.endMinute) : "—"}
          sub={
            nextAssignment
              ? `${nextAssignment.shift.label} · ${nextAssignment.shift.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
              : "No upcoming assignment"
          }
          trailing={<Icon.Clock size={18} />}
          tone={nextAssignment ? "info" : "neutral"}
        />
        <StatCard
          label="Open shifts this week"
          value={openShiftsThisWeek}
          sub={openShiftsThisWeek > 0 ? "Coverage requests posted" : "No coverage requests"}
          trailing={<Icon.Megaphone size={18} />}
          tone={openShiftsThisWeek > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Published shifts (week)"
          value={publishedThisWeek}
          sub={draftThisWeek > 0 ? `${draftThisWeek} draft / changed` : "All shifts published"}
          trailing={<Icon.Calendar size={18} />}
          tone={draftThisWeek > 0 ? "warn" : "ok"}
        />
        {canApproveRequests ? (
          <StatCard
            label="Awaiting your decision"
            value={pendingRequestApprovalCount + pendingPickups}
            sub={
              pendingRequestApprovalCount + pendingPickups > 0
                ? `${pendingRequestApprovalCount} requests · ${pendingPickups} pickups`
                : "Nothing pending"
            }
            trailing={<Icon.Inbox size={18} />}
            tone={pendingRequestApprovalCount + pendingPickups > 0 ? "pending" : "neutral"}
          />
        ) : (
          <StatCard
            label="My open requests"
            value={myOpenRequestCount}
            sub={
              myOpenRequestCount > 0
                ? "Time-off, training, equipment, etc."
                : "Nothing in flight"
            }
            trailing={<Icon.Inbox size={18} />}
            tone={myOpenRequestCount > 0 ? "info" : "neutral"}
          />
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DashboardPanel
            title="My upcoming shifts"
            meta={<Badge tone="navy">Schedule</Badge>}
            viewAllHref="/schedule"
          >
            {nextAssignment ? (
              <ul className="divide-y divide-line/70">
                <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold tracking-tight">
                      {nextAssignment.shift.label}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-text3">
                      {nextAssignment.shift.date.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                      {" · "}
                      <span className="font-mono">
                        {formatRange(
                          nextAssignment.shift.startMinute,
                          nextAssignment.shift.endMinute,
                        )}
                      </span>
                      {nextAssignment.shift.location ? ` · ${nextAssignment.shift.location}` : null}
                    </div>
                  </div>
                  <Badge tone={nextAssignment.shift.status === "published" ? "ok" : "warn"}>
                    {nextAssignment.shift.status}
                  </Badge>
                </li>
              </ul>
            ) : (
              <EmptyState
                icon={<Icon.Calendar size={20} />}
                title="No upcoming shifts assigned"
                description="When a supervisor assigns you to a shift, it will appear here."
              />
            )}
          </DashboardPanel>

          <DashboardPanel
            title="Today's briefing"
            meta={
              visibleAnnouncements.length > 0 ? (
                <Badge tone="info">{visibleAnnouncements.length}</Badge>
              ) : null
            }
            viewAllHref="/announcements"
            viewAllLabel="Open announcements"
          >
            {visibleAnnouncements.length === 0 ? (
              <EmptyState
                icon={<Icon.Bell size={20} />}
                title="No announcements right now"
                description="Briefings, policy reminders, and training notices appear here as supervisors and command staff publish them."
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {visibleAnnouncements.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/announcements/${a.id}`}
                      className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-neutral-soft/40"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {a.pinned ? <Badge tone="info">Pinned</Badge> : null}
                          {a.priority !== "normal" ? (
                            <Badge tone={a.priority === "urgent" ? "danger" : "warn"}>
                              {a.priority === "urgent" ? "Urgent" : "Important"}
                            </Badge>
                          ) : null}
                          {a.requiresAcknowledgment && a.acks.length === 0 ? (
                            <Badge tone="warn" dot>
                              Needs ack
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-[13.5px] font-semibold tracking-tight text-ink">
                          {a.title}
                        </div>
                        <div className="text-[11.5px] text-text3">
                          {a.category ? `${a.category} · ` : ""}
                          {a.publishedAt
                            ? a.publishedAt.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardPanel>

          <DashboardPanel
            title="Open shifts needing coverage"
            meta={<Badge tone="warn">{openShiftsThisWeek} open</Badge>}
            viewAllHref="/schedule/open"
          >
            {openShiftsThisWeek === 0 ? (
              <EmptyState
                icon={<Icon.Megaphone size={20} />}
                title="No open shifts this week"
                description="When a supervisor posts a shift for pickup, eligible officers can apply from the Open Shifts board."
              />
            ) : (
              <p className="text-[13px] text-text2">
                {openShiftsThisWeek} shift{openShiftsThisWeek === 1 ? "" : "s"} posted for the week
                of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
                Apply from the Open Shifts board.
              </p>
            )}
          </DashboardPanel>
        </div>

        <div className="space-y-6">
          <DashboardPanel title="Quick actions">
            <div className="grid grid-cols-1 gap-2">
              <QuickActionButton
                href="/schedule"
                label="View schedule"
                description="This week's published roster"
                icon={<Icon.Calendar size={16} />}
              />
              <QuickActionButton
                href="/schedule/open"
                label="Open shifts"
                description="Apply for coverage requests"
                icon={<Icon.Megaphone size={16} />}
              />
              <QuickActionButton
                href="/schedule/availability"
                label="Submit availability"
                description="Reserve / PT availability"
                icon={<Icon.Clock size={16} />}
              />
              <QuickActionButton
                href="/requests/time-off/new"
                label="Request time off"
                description="Vacation, sick, jury, etc."
                icon={<Icon.FileText size={16} />}
              />
              <QuickActionButton
                href="/requests/training/new"
                label="Request training"
                description="Outside courses & certifications"
                icon={<Icon.Award size={16} />}
              />
              <QuickActionButton
                href="/requests/vehicle-issue/new"
                label="Report vehicle issue"
                description="Mechanical or service issue"
                icon={<Icon.Car size={16} />}
              />
              <QuickActionButton
                href="/requests"
                label="My requests"
                description={`${myOpenRequestCount} open`}
                icon={<Icon.Inbox size={16} />}
              />
              <QuickActionButton
                href="/announcements"
                label="Announcements"
                description={
                  unacknowledgedAnnouncementCount > 0
                    ? `${unacknowledgedAnnouncementCount} need acknowledgment`
                    : "Briefings & policy notices"
                }
                icon={<Icon.Bell size={16} />}
              />
              {can(actor, "announcements.create") ? (
                <QuickActionButton
                  href="/announcements/new"
                  label="Post announcement"
                  description="Briefing, policy reminder, etc."
                  icon={<Icon.Megaphone size={16} />}
                />
              ) : null}
              {canApproveRequests ? (
                <QuickActionButton
                  href="/requests/approvals"
                  label="Approval queue"
                  description={`${pendingRequestApprovalCount} request${pendingRequestApprovalCount === 1 ? "" : "s"} awaiting`}
                  icon={<Icon.Inbox size={16} />}
                />
              ) : null}
              {canSeeAudit ? (
                <QuickActionButton
                  href="/admin/audit"
                  label="Audit log"
                  description={`${last24hAuditCount} events in last 24h`}
                  icon={<Icon.Activity size={16} />}
                />
              ) : null}
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Policies awaiting acknowledgment"
            meta={<Badge tone="info">Module pending</Badge>}
          >
            <EmptyState
              icon={<Icon.BookOpen size={20} />}
              title="No policies on file yet"
              description="Once the Policies module ships, you'll see the documents you need to acknowledge here."
            />
          </DashboardPanel>

          <DashboardPanel
            title="Your access"
            meta={<Badge tone="neutral">Read-only</Badge>}
          >
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-text3">Roles</dt>
                <dd className="text-right font-medium">
                  {actor.roleKeys.length === 0 ? "—" : actor.roleKeys.join(", ")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text3">Permissions</dt>
                <dd className="text-right font-medium font-mono">
                  {actor.permissionKeys.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text3">User ID</dt>
                <dd className="text-right font-mono text-[12px] text-text3">
                  {actor.userId.slice(0, 12)}…
                </dd>
              </div>
            </dl>
          </DashboardPanel>
        </div>
      </section>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60_000);
}
