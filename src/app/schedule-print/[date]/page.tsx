/**
 * Print-only daily roster.
 *
 * Lives outside the (authed) layout group so the navigation chrome is not
 * rendered. Auth is still enforced — `requireActor()` redirects to /login
 * if no session, and `requirePermission('schedule.read')` gates content.
 *
 * Notes are deliberately NOT printed. The roster is for posting in the
 * briefing room or attaching to a daily ops sheet; sensitive admin notes
 * stay in-app where access is controlled.
 */
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { formatRange, utcMidnight } from "@/lib/schedule/time";

export const dynamic = "force-dynamic";

export default async function PrintRosterPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const actor = await requireActor("/schedule");
  await requirePermission(actor, "schedule.read");
  const { date: raw } = await params;

  const day = utcMidnight(new Date(raw));
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  const shifts = await prisma.scheduleShift.findMany({
    where: { date: { gte: day, lt: next }, archivedAt: null, status: { not: "cancelled" } },
    include: {
      assignments: {
        where: { status: { not: "removed" } },
        include: { user: { select: { name: true, badge: true, rank: true } } },
      },
    },
    orderBy: [{ startMinute: "asc" }],
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
    metadata: { surface: "schedule.print", date: day.toISOString().slice(0, 10) },
  });

  return (
    <main className="mx-auto max-w-3xl p-8 print:p-2">
      <header className="border-b border-black pb-2 print:pb-1">
        <h1 className="text-xl font-bold">Daily Roster</h1>
        <p className="text-sm">
          {day.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}{" "}
          · Richmond Police Department
        </p>
      </header>

      <table className="mt-4 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-black/70 text-left">
            <th className="px-1 py-1">Time</th>
            <th className="px-1 py-1">Shift</th>
            <th className="px-1 py-1">Location</th>
            <th className="px-1 py-1">Assigned</th>
            <th className="px-1 py-1">Status</th>
          </tr>
        </thead>
        <tbody>
          {shifts.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-1 py-3 text-center">
                No shifts scheduled.
              </td>
            </tr>
          ) : (
            shifts.map((s) => (
              <tr key={s.id} className="border-b border-black/20 align-top">
                <td className="px-1 py-1.5 font-mono">{formatRange(s.startMinute, s.endMinute)}</td>
                <td className="px-1 py-1.5">{s.label}</td>
                <td className="px-1 py-1.5">{s.location ?? ""}</td>
                <td className="px-1 py-1.5">
                  {s.assignments.length === 0 ? (
                    <em>unstaffed</em>
                  ) : (
                    s.assignments
                      .map((a) =>
                        a.user
                          ? [a.user.rank, a.user.name, a.user.badge ? `#${a.user.badge}` : null]
                              .filter(Boolean)
                              .join(" ")
                          : "",
                      )
                      .filter(Boolean)
                      .join(", ")
                  )}
                </td>
                <td className="px-1 py-1.5">{s.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="mt-4 text-[11px] text-text3 print:text-black">
        Administrative coordination only. Notes are intentionally not included on the printed roster.
      </p>

      <style>{`
        @media print {
          body { background: white; color: black; }
          @page { margin: 12mm; }
        }
      `}</style>
    </main>
  );
}
