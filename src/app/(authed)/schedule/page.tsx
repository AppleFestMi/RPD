import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { addDays, formatRange, isoDay, startOfWeek, weekDates } from "@/lib/schedule/time";
import { shiftStatusTone, StatusChip } from "@/components/schedule/StatusChip";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { key: "patrol", label: "Patrol" },
  { key: "reserve", label: "Reserve" },
  { key: "dispatch", label: "Dispatch" },
  { key: "training", label: "Training" },
  { key: "event", label: "Special Event" },
  { key: "court", label: "Court" },
  { key: "admin", label: "Admin" },
] as const;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; cat?: string; me?: string }>;
}) {
  const actor = await requireActor("/schedule");
  await requirePermission(actor, "schedule.read");
  const sp = await searchParams;

  const weekStart = sp.week ? startOfWeek(new Date(sp.week)) : startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  const days = weekDates(weekStart);

  const activeCats = (sp.cat ?? "").split(",").filter(Boolean);
  const myOnly = sp.me === "1";

  const shifts = await prisma.scheduleShift.findMany({
    where: {
      date: { gte: weekStart, lt: weekEnd },
      archivedAt: null,
      ...(activeCats.length > 0 ? { category: { in: activeCats } } : {}),
      ...(myOnly ? { assignments: { some: { userId: actor.userId, status: { not: "removed" } } } } : {}),
    },
    include: {
      assignments: {
        where: { status: { not: "removed" } },
        include: { user: { select: { id: true, name: true, badge: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
    metadata: { surface: "schedule.week", weekStart: isoDay(weekStart) },
  });

  const byDay = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const k = isoDay(s.date);
    const arr = byDay.get(k) ?? [];
    arr.push(s);
    byDay.set(k, arr);
  }

  const prevWeek = isoDay(addDays(weekStart, -7));
  const nextWeek = isoDay(addDays(weekStart, 7));
  const thisWeek = isoDay(startOfWeek(new Date()));

  return (
    <main className="p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-text3">
            Week of {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/schedule?week=${prevWeek}`} className="btn">← Prev</Link>
          <Link href={`/schedule?week=${thisWeek}`} className="btn">This week</Link>
          <Link href={`/schedule?week=${nextWeek}`} className="btn">Next →</Link>
          <Link href="/schedule/open" className="btn">Open shifts</Link>
          <Link href="/schedule/availability" className="btn">Availability</Link>
          <Link href="/schedule/swaps" className="btn">Swaps</Link>
          <Link href={`/schedule-print/${isoDay(new Date())}`} target="_blank" className="btn" rel="noreferrer">
            Print today's roster
          </Link>
          {can(actor, "schedule.create") ? (
            <Link href="/schedule/new" className="btn btn-primary">+ Add shift</Link>
          ) : null}
          {can(actor, "schedule.publish") ? (
            <Link href={`/schedule/publish?week=${isoDay(weekStart)}`} className="btn btn-primary">
              Publish week…
            </Link>
          ) : null}
        </div>
      </header>

      <FilterBar
        weekStart={isoDay(weekStart)}
        activeCats={activeCats}
        myOnly={myOnly}
      />

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 gap-px rounded-md border border-line bg-line">
          {days.map((d) => (
            <div key={d.toISOString()} className="bg-white">
              <div className="border-b border-line bg-neutral-soft px-3 py-2 text-[11.5px] uppercase tracking-wider text-text3">
                {d.toLocaleDateString(undefined, { weekday: "short" })}{" "}
                <span className="font-mono text-text2">
                  {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="min-h-[180px] space-y-1.5 p-2">
                {(byDay.get(isoDay(d)) ?? []).map((s) => (
                  <Link
                    key={s.id}
                    href={`/schedule/${s.id}`}
                    className="block rounded-md border border-line bg-white px-2 py-1.5 text-[12px] hover:bg-neutral-soft"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-[11px] text-text3">
                        {formatRange(s.startMinute, s.endMinute)}
                      </div>
                      <StatusChip label={s.status} tone={shiftStatusTone(s.status)} />
                    </div>
                    <div className="mt-0.5 font-medium">{s.label}</div>
                    {s.location ? <div className="text-[11px] text-text3">{s.location}</div> : null}
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-text2">
                      {s.assignments.length === 0 ? (
                        <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">unstaffed</span>
                      ) : (
                        s.assignments.map((a) =>
                          a.user ? (
                            <span key={a.id} className="rounded bg-neutral-soft px-1.5 py-0.5">
                              {a.user.name}
                              {a.user.badge ? ` · ${a.user.badge}` : ""}
                            </span>
                          ) : null,
                        )
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 max-w-3xl rounded-md bg-warn-soft/40 px-3 py-2 text-[12px] text-text2">
        <strong>Administrative notes only.</strong> Shift notes, locations, and titles must not contain
        CAD, RMS, case, victim/witness, LEIN, NCIC, or investigative information.
      </p>

      <style>{`
        .btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #e3e7ee; background:white; padding:6px 12px; border-radius:8px; font-size:13px; font-weight:500; }
        .btn:hover { background:#fafbfd; }
        .btn-primary { background:#0f1d33; border-color:#0f1d33; color:white; }
        .btn-primary:hover { background:#14253f; }
      `}</style>
    </main>
  );
}

function FilterBar({
  weekStart,
  activeCats,
  myOnly,
}: {
  weekStart: string;
  activeCats: string[];
  myOnly: boolean;
}) {
  const linkFor = (toggleCat?: string, toggleMe?: boolean) => {
    const next = new Set(activeCats);
    if (toggleCat) {
      if (next.has(toggleCat)) next.delete(toggleCat);
      else next.add(toggleCat);
    }
    const me = toggleMe ? !myOnly : myOnly;
    const params = new URLSearchParams();
    params.set("week", weekStart);
    if (next.size > 0) params.set("cat", [...next].join(","));
    if (me) params.set("me", "1");
    return `/schedule?${params.toString()}`;
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
      <span className="text-text3">Filter:</span>
      {CATEGORIES.map((c) => {
        const on = activeCats.includes(c.key);
        return (
          <Link
            key={c.key}
            href={linkFor(c.key)}
            className={
              "rounded-full border px-2.5 py-0.5 " +
              (on
                ? "border-accent bg-accent text-white"
                : "border-line bg-white text-text2 hover:bg-neutral-soft")
            }
          >
            {c.label}
          </Link>
        );
      })}
      <span className="ml-2 text-text3">·</span>
      <Link
        href={linkFor(undefined, true)}
        className={
          "rounded-full border px-2.5 py-0.5 " +
          (myOnly
            ? "border-accent bg-accent text-white"
            : "border-line bg-white text-text2 hover:bg-neutral-soft")
        }
      >
        My schedule
      </Link>
    </div>
  );
}
