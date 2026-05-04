/**
 * Time-off — read-only listing.
 *
 * Full create/approve UX is deferred to the Requests module
 * (requests.create + requests.approve.supervisor). What this page does:
 *   - Shows the actor's own approved + pending time-off.
 *   - Shows supervisors/admins all upcoming approved time-off, so they can
 *     plan around it.
 *
 * Approved time-off is already surfaced in the schedule UI as a conflict
 * warning when assigning a user to an overlapping shift (see
 * src/lib/schedule/conflicts.ts and src/app/(authed)/schedule/actions.ts).
 */
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { appDecisionTone, StatusChip } from "@/components/schedule/StatusChip";

export const dynamic = "force-dynamic";

export default async function TimeOffPage() {
  const actor = await requireActor("/schedule/timeoff");
  await requirePermission(actor, "schedule.read");
  const showAll = can(actor, "requests.read.all");

  const now = new Date();
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + 60);

  const [mine, all] = await Promise.all([
    prisma.timeOffRequest.findMany({
      where: { userId: actor.userId, endDate: { gte: now } },
      orderBy: { startDate: "asc" },
      take: 50,
    }),
    showAll
      ? prisma.timeOffRequest.findMany({
          where: { status: "approved", startDate: { lt: horizon }, endDate: { gte: now } },
          include: { user: { select: { name: true, badge: true } } },
          orderBy: { startDate: "asc" },
          take: 100,
        })
      : Promise.resolve([] as never[]),
  ]);

  return (
    <main className="p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Time-off</h1>
          <p className="text-sm text-text3">
            Submission and approval move into the Requests module in a later
            session — this page lists the data so it can be planned around today.
          </p>
        </div>
        <Link href="/schedule" className="text-sm text-text3 hover:text-text2">← Schedule</Link>
      </header>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-text2">My time-off</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-text3">No time-off on file.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {mine.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-mono text-[13px]">
                    {t.startDate.toISOString().slice(0, 10)} → {t.endDate.toISOString().slice(0, 10)}
                  </div>
                  <div className="text-[11.5px] text-text3">
                    {t.type}
                    {t.reason ? ` · ${t.reason}` : ""}
                  </div>
                </div>
                <StatusChip label={t.status} tone={appDecisionTone(t.status)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAll ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-text2">All approved time-off (next 60 days)</h2>
          {all.length === 0 ? (
            <p className="mt-2 text-sm text-text3">None.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {all.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {t.user?.name}
                      {t.user?.badge ? ` · ${t.user.badge}` : ""}
                    </div>
                    <div className="font-mono text-[13px] text-text3">
                      {t.startDate.toISOString().slice(0, 10)} → {t.endDate.toISOString().slice(0, 10)} · {t.type}
                    </div>
                  </div>
                  <StatusChip label="approved" tone="ok" />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="mt-6 max-w-prose rounded-md bg-warn-soft/40 px-3 py-2 text-[12px] text-text2">
        Approved time-off automatically surfaces as a conflict warning when
        a supervisor tries to assign that user to an overlapping shift. The
        warning does not block the assignment — it is a planning aid.
      </p>
    </main>
  );
}
