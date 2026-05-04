import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { addDays, isoDay, startOfWeek } from "@/lib/schedule/time";
import { PublishConfirm } from "./PublishConfirm";

export const dynamic = "force-dynamic";

export default async function PublishPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const actor = await requireActor("/schedule/publish");
  await requirePermission(actor, "schedule.publish");
  const sp = await searchParams;
  const weekStart = sp.week ? startOfWeek(new Date(sp.week)) : startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);

  const all = await prisma.scheduleShift.findMany({
    where: { date: { gte: weekStart, lt: weekEnd }, archivedAt: null },
    include: { assignments: { where: { status: { not: "removed" } } } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  const draft = all.filter((s) => s.status === "draft");
  const changed = all.filter((s) => s.status === "changed");
  const published = all.filter((s) => s.status === "published");
  const cancelled = all.filter((s) => s.status === "cancelled");
  const unstaffed = all.filter(
    (s) => s.status !== "cancelled" && s.requiredRole !== null && s.assignments.length === 0,
  );

  const openShifts = await prisma.openShift.count({
    where: { date: { gte: weekStart, lt: weekEnd }, status: "open" },
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/schedule?week=${isoDay(weekStart)}`} className="text-sm text-text3 hover:text-text2">
        ← Back to schedule
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Publish week</h1>
      <p className="mt-1 text-sm text-text3">
        Week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
      </p>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Total shifts" value={all.length} />
        <Stat label="Draft" value={draft.length} tone="warn" />
        <Stat label="Changed (re-publish)" value={changed.length} tone="info" />
        <Stat label="Published" value={published.length} tone="ok" />
        <Stat label="Cancelled" value={cancelled.length} tone="danger" />
        <Stat label="Open shifts" value={openShifts} />
        <Stat label="Required-role shifts unstaffed" value={unstaffed.length} tone={unstaffed.length > 0 ? "warn" : "neutral"} />
      </section>

      {unstaffed.length > 0 ? (
        <p className="mt-4 rounded-md bg-warn-soft/40 p-3 text-[13px] text-text2">
          ⚠ {unstaffed.length} shift{unstaffed.length === 1 ? "" : "s"} with a required role have no live assignments.
          You can still publish; coverage gaps will need follow-up.
        </p>
      ) : null}

      <PublishConfirm
        weekStart={isoDay(weekStart)}
        expectShifts={draft.length + changed.length}
      />

      <p className="mt-6 max-w-prose text-[12px] text-text3">
        Publishing transitions <strong>draft</strong> and <strong>changed</strong> shifts to{" "}
        <strong>published</strong>. Cancelled and archived shifts are unaffected. The action is
        audit-logged with the publish version and shift IDs.
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "danger" | "info" | "neutral";
}) {
  const cls = {
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
    neutral: "text-text2",
  }[tone];
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-[11.5px] uppercase tracking-wider text-text3">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
