/**
 * /requests — landing page.
 *
 * Two views combined on one screen:
 *   1. My requests — anything the actor has submitted, scoped by
 *      `requests.read.own`.
 *   2. (For supervisors / command staff) a one-glance count of pending
 *      approvals with a link to the dedicated approvals queue.
 *
 * The action-card row at the top routes to the per-kind new-request
 * forms. Each form page enforces its own create permission.
 */
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icons";
import {
  REQUEST_KIND_LABELS,
  REQUEST_STATUS_LABELS,
  OPEN_REQUEST_STATUSES,
  type RequestKind,
  type RequestStatus,
} from "@/lib/requests/types";
import { kindTone, statusTone } from "@/lib/requests/badges";

export const dynamic = "force-dynamic";

const ACTION_CARDS: Array<{
  href: string;
  kind: RequestKind;
  blurb: string;
  icon: IconName;
}> = [
  { href: "/requests/time-off/new",      kind: "timeOff",      blurb: "Vacation, sick, jury, military, bereavement.", icon: "Calendar" },
  { href: "/requests/training/new",      kind: "training",     blurb: "Outside courses, conferences, certifications.", icon: "Award" },
  { href: "/requests/equipment/new",     kind: "equipment",    blurb: "New issue, replacement, damaged, lost item.",   icon: "Briefcase" },
  { href: "/requests/vehicle-issue/new", kind: "vehicleIssue", blurb: "Mechanical or service issue with a unit.",      icon: "Car" },
  { href: "/requests/help/new",          kind: "itFacilities", blurb: "IT, radio/MDC, building, supplies, software.",  icon: "Wrench" },
];

export default async function RequestsLandingPage() {
  const actor = await requireActor("/requests");
  await requirePermission(actor, "requests.read.own");

  const canApprove =
    can(actor, "requests.approve.supervisor") || can(actor, "requests.approve.command");
  const canCreate = can(actor, "requests.create");

  const [myOpen, myDecided, pendingApprovalCount] = await Promise.all([
    prisma.adminRequest.findMany({
      where: { userId: actor.userId, status: { in: OPEN_REQUEST_STATUSES } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.adminRequest.findMany({
      where: { userId: actor.userId, status: { in: ["approved", "denied", "cancelled"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    canApprove
      ? prisma.adminRequest.count({
          where: {
            status: { in: OPEN_REQUEST_STATUSES },
            userId: { not: actor.userId },
          },
        })
      : Promise.resolve(0),
  ]);

  const counts = {
    submitted: myOpen.filter((r) => r.status === "submitted").length,
    inReview: myOpen.filter((r) => r.status === "supervisorReview" || r.status === "commandReview").length,
    needsInfo: myOpen.filter((r) => r.status === "needsMoreInfo").length,
    approvedRecent: myDecided.filter((r) => r.status === "approved").length,
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        eyebrow="Requests"
        title="Internal requests"
        description="Submit and track time-off, training, equipment, vehicle, and IT/facilities requests. All decisions are audit-logged."
        actions={
          canCreate ? (
            <Button href="/requests/new" variant="accent" size="md">
              + New request
            </Button>
          ) : null
        }
      />

      {canApprove && pendingApprovalCount > 0 ? (
        <div className="rounded-lg border border-pending/30 bg-pending-soft/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-text2">
                {pendingApprovalCount} request{pendingApprovalCount === 1 ? "" : "s"} awaiting review
              </div>
              <div className="text-[12px] text-text3">
                You have approval permission. Open the queue to decide.
              </div>
            </div>
            <Button href="/requests/approvals" variant="primary" size="sm">
              Open approvals queue →
            </Button>
          </div>
        </div>
      ) : null}

      {canCreate ? (
        <section>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-text3">
            Start a new request
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ACTION_CARDS.map((c) => {
              const I = Icon[c.icon];
              return (
                <Link
                  key={c.kind}
                  href={c.href}
                  className="group flex flex-col gap-2 rounded-lg border border-line bg-white p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/30"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-soft text-text2 group-hover:bg-accent-soft group-hover:text-accent">
                    <I size={18} />
                  </span>
                  <span className="text-[14px] font-semibold tracking-tight text-ink">
                    {REQUEST_KIND_LABELS[c.kind]}
                  </span>
                  <span className="text-[12px] leading-snug text-text3">{c.blurb}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Submitted" value={counts.submitted} tone="info" />
        <SummaryCard label="In review" value={counts.inReview} tone="pending" />
        <SummaryCard label="Needs info" value={counts.needsInfo} tone="warn" />
        <SummaryCard label="Recently approved" value={counts.approvedRecent} tone="ok" />
      </section>

      <Card>
        <CardHeader
          title="My open requests"
          meta={<Badge tone="neutral">{myOpen.length} open</Badge>}
        />
        <CardBody>
          {myOpen.length === 0 ? (
            <EmptyState
              icon={<Icon.Inbox size={20} />}
              title="No open requests"
              description="Every request you submit lands here until it is approved, denied, or cancelled."
              action={
                canCreate ? (
                  <Button href="/requests/new" variant="accent" size="sm">
                    Start a new request
                  </Button>
                ) : null
              }
            />
          ) : (
            <RequestList rows={myOpen} />
          )}
        </CardBody>
      </Card>

      {myDecided.length > 0 ? (
        <Card>
          <CardHeader
            title="Recently decided"
            meta={<span className="text-[11.5px] text-text3">last 10</span>}
          />
          <CardBody>
            <RequestList rows={myDecided} />
          </CardBody>
        </Card>
      ) : null}
    </main>
  );
}

function RequestList({
  rows,
}: {
  rows: Array<{
    id: string;
    kind: string;
    title: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/requests/${r.id}`}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-neutral-soft/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone={kindTone(r.kind as RequestKind)}>
                  {REQUEST_KIND_LABELS[r.kind as RequestKind] ?? r.kind}
                </Badge>
                <span className="truncate text-[13.5px] font-medium tracking-tight">
                  {r.title}
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-text3">
                Submitted{" "}
                {r.createdAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {" · "}
                Updated{" "}
                {r.updatedAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </div>
            </div>
            <Badge tone={statusTone(r.status as RequestStatus)}>
              {REQUEST_STATUS_LABELS[r.status as RequestStatus] ?? r.status}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "info" | "warn" | "pending";
}) {
  const toneCls = {
    ok: "text-ok",
    info: "text-info",
    warn: "text-warn",
    pending: "text-pending",
  }[tone];
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text3">
          {label}
        </div>
        <div className={`mt-1 font-mono text-[26px] font-bold leading-none ${toneCls}`}>
          {value}
        </div>
      </CardBody>
    </Card>
  );
}
