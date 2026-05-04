import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { formatRange } from "@/lib/schedule/time";
import { openShiftStatusTone, StatusChip } from "@/components/schedule/StatusChip";
import { OpenShiftCardActions } from "./OpenShiftCardActions";

export const dynamic = "force-dynamic";

export default async function OpenShiftsPage() {
  const actor = await requireActor("/schedule/open");
  await requirePermission(actor, "schedule.read");

  const canApply = can(actor, "schedule.requestPickup");
  const canApprove = can(actor, "schedule.approvePickup");

  const openShifts = await prisma.openShift.findMany({
    where: { date: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
    include: {
      applications: {
        include: { user: { select: { id: true, name: true, email: true, badge: true } } },
      },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  return (
    <main className="p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Open shifts</h1>
          <p className="text-sm text-text3">Posted shifts available for pickup.</p>
        </div>
        <Link href="/schedule" className="text-sm text-text3 hover:text-text2">← Schedule</Link>
      </header>

      {openShifts.length === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-line bg-neutral-soft/40 p-6 text-center text-sm text-text3">
          No upcoming open shifts.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {openShifts.map((o) => {
            const myApp = o.applications.find((a) => a.userId === actor.userId);
            const eligible =
              !o.eligibilityRole || actor.roleKeys.includes(o.eligibilityRole);
            const isClosed = o.closesAt ? o.closesAt < new Date() : false;
            return (
              <li key={o.id} className="rounded-lg border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">{o.post}</h2>
                      <StatusChip label={o.status} tone={openShiftStatusTone(o.status)} />
                      <span className="rounded bg-neutral-soft px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-text3">
                        {o.type}
                      </span>
                      {o.eligibilityRole ? (
                        <span className="rounded bg-info-soft px-1.5 py-0.5 text-[11px] text-info">
                          {o.eligibilityRole}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-text3">
                      {o.date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      · <span className="font-mono">{formatRange(o.startMinute, o.endMinute)}</span>
                      {o.location ? ` · ${o.location}` : null}
                    </div>
                    {o.notes ? <p className="mt-2 text-sm text-text2">{o.notes}</p> : null}
                    {o.closesAt ? (
                      <p className="mt-1 text-[11.5px] text-text3">
                        Closes {o.closesAt.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 border-t border-line pt-3">
                  <h3 className="text-[12px] uppercase tracking-wider text-text3">
                    {o.applications.length} applicant{o.applications.length === 1 ? "" : "s"}
                  </h3>
                  {o.applications.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {o.applications.map((a) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-soft px-2 py-1.5"
                        >
                          <div>
                            <div>{a.user?.name}</div>
                            <div className="text-[11px] font-mono text-text3">{a.user?.email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusChip label={a.decision} tone={
                              a.decision === "approved" ? "ok" :
                              a.decision === "denied" ? "danger" :
                              a.decision === "withdrawn" ? "neutral" : "pending"
                            } />
                            {canApprove && a.decision === "pending" && o.status === "open" ? (
                              <OpenShiftCardActions kind="review" applicationId={a.id} />
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canApply && o.status === "open" && eligible && !isClosed ? (
                    myApp && myApp.decision !== "withdrawn" ? (
                      <OpenShiftCardActions
                        kind="withdraw"
                        openShiftId={o.id}
                        applicationId={myApp.id}
                      />
                    ) : (
                      <OpenShiftCardActions kind="apply" openShiftId={o.id} />
                    )
                  ) : null}
                  {canApprove && o.status === "open" ? (
                    <OpenShiftCardActions kind="close" openShiftId={o.id} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
