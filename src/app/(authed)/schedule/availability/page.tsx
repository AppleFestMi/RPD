import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { AvailabilityForm } from "./AvailabilityForm";
import { AvailabilityRowActions } from "./AvailabilityRowActions";
import { formatRange, addDays, isoDay, startOfWeek } from "@/lib/schedule/time";

export const dynamic = "force-dynamic";

const STATE_TONE: Record<string, string> = {
  available: "bg-ok-soft text-ok",
  preferred: "bg-info-soft text-info",
  unavailable: "bg-danger-soft text-danger",
};

export default async function AvailabilityPage() {
  const actor = await requireActor("/schedule/availability");
  await requirePermission(actor, "availability.read.own");
  const showAll = can(actor, "availability.read.all");

  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 14); // show two weeks

  const myBlocks = await prisma.availabilityBlock.findMany({
    where: { userId: actor.userId, date: { gte: weekStart, lt: weekEnd } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  const allBlocks = showAll
    ? await prisma.availabilityBlock.findMany({
        where: { date: { gte: weekStart, lt: weekEnd } },
        include: { user: { select: { id: true, name: true, badge: true, rank: true } } },
        orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      })
    : [];

  // Aggregate per-user counts for the admin summary.
  const summary = new Map<string, { name: string; available: number; preferred: number; unavailable: number }>();
  if (showAll) {
    for (const b of allBlocks) {
      const k = b.userId;
      const cur = summary.get(k) ?? {
        name: b.user?.name ?? "(unknown)",
        available: 0,
        preferred: 0,
        unavailable: 0,
      };
      cur[b.state] += 1;
      summary.set(k, cur);
    }
  }

  return (
    <main className="p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Availability</h1>
          <p className="text-sm text-text3">Manage your own availability. Weeks shown: next two.</p>
        </div>
        <Link href="/schedule" className="text-sm text-text3 hover:text-text2">← Schedule</Link>
      </header>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-text2">My availability</h2>
        <AvailabilityForm />
        {myBlocks.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line bg-neutral-soft/40 p-3 text-sm text-text3">
            No availability blocks yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {myBlocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className={"rounded px-2 py-0.5 text-[11.5px] font-medium " + (STATE_TONE[b.state] ?? "")}>
                    {b.state}
                  </span>
                  <span className="font-mono text-[12.5px]">
                    {b.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{" "}
                    · {formatRange(b.startMinute, b.endMinute)}
                  </span>
                  {b.recurrenceText ? (
                    <span className="text-[11.5px] text-text3">recurs: {b.recurrenceText}</span>
                  ) : null}
                  {b.notes ? <span className="text-[11.5px] text-text3">— {b.notes}</span> : null}
                </div>
                <AvailabilityRowActions blockId={b.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAll ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-text2">All users (next two weeks)</h2>
          <p className="text-[12px] text-text3">
            Aggregate of submitted availability blocks for supervisors and admins.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-soft text-left text-[11.5px] uppercase tracking-wider text-text3">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Available</th>
                  <th className="px-3 py-2">Preferred</th>
                  <th className="px-3 py-2">Unavailable</th>
                </tr>
              </thead>
              <tbody>
                {[...summary.entries()]
                  .sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([uid, s]) => (
                    <tr key={uid} className="border-t border-line">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2 font-mono">{s.available}</td>
                      <td className="px-3 py-2 font-mono">{s.preferred}</td>
                      <td className="px-3 py-2 font-mono">{s.unavailable}</td>
                    </tr>
                  ))}
                {summary.size === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-text3">
                      No availability submissions yet for this window.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="mt-6 max-w-prose text-[12px] text-text3">
        Window starts {isoDay(weekStart)}. Recurrence is a free-text hint only — it is not interpreted
        by the scheduling engine.
      </p>
    </main>
  );
}
