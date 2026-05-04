import { notFound } from "next/navigation";
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { ShiftForm } from "../ShiftForm";
import { ShiftDetailActions } from "./ShiftDetailActions";
import { shiftStatusTone, StatusChip } from "@/components/schedule/StatusChip";
import { isoDay, formatRange } from "@/lib/schedule/time";

export const dynamic = "force-dynamic";

export default async function ShiftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("/schedule");
  await requirePermission(actor, "schedule.read");
  const { id } = await params;

  const shift = await prisma.scheduleShift.findUnique({
    where: { id },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true, badge: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!shift) notFound();

  const canEdit = can(actor, "schedule.update");
  const eligibleUsers = canEdit
    ? await prisma.user.findMany({
        where: { disabledAt: null, activatedAt: { not: null } },
        select: { id: true, name: true, email: true, badge: true, rank: true },
        orderBy: { name: "asc" },
        take: 200,
      })
    : [];

  const assignedIds = new Set(shift.assignments.filter((a) => a.status !== "removed").map((a) => a.userId));

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/schedule?week=${isoDay(shift.date)}`} className="text-sm text-text3 hover:text-text2">
        ← Back to schedule
      </Link>

      <div className="mt-2 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{shift.label}</h1>
        <StatusChip label={shift.status} tone={shiftStatusTone(shift.status)} />
      </div>
      <p className="mt-1 text-sm text-text3">
        {shift.date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })} ·{" "}
        <span className="font-mono">{formatRange(shift.startMinute, shift.endMinute)}</span>
        {shift.location ? ` · ${shift.location}` : null}
      </p>

      <section className="mt-5">
        <h2 className="text-sm font-semibold text-text2">Assignments</h2>
        <div className="mt-2 space-y-1">
          {shift.assignments.length === 0 ? (
            <p className="rounded-md border border-dashed border-line bg-neutral-soft/40 p-3 text-sm text-text3">
              No assignments yet.
            </p>
          ) : (
            shift.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm">
                <div>
                  <div className={a.status === "removed" ? "line-through text-text3" : ""}>
                    {a.user?.name ?? "(unassigned)"}
                    {a.user?.badge ? ` · ${a.user.badge}` : null}
                  </div>
                  <div className="text-[11.5px] text-text3">{a.status}</div>
                </div>
                {canEdit && a.status !== "removed" ? (
                  <ShiftDetailActions kind="unassign" assignmentId={a.id} />
                ) : null}
              </div>
            ))
          )}
        </div>

        {canEdit && shift.archivedAt == null ? (
          <ShiftDetailActions
            kind="assign"
            shiftId={shift.id}
            users={eligibleUsers
              .filter((u) => !assignedIds.has(u.id))
              .map((u) => ({ id: u.id, label: `${u.name}${u.badge ? ` · ${u.badge}` : ""}` }))}
          />
        ) : null}
      </section>

      {canEdit && shift.archivedAt == null ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text2">Edit shift</h2>
          <ShiftForm
            mode="edit"
            defaults={{
              shiftId: shift.id,
              date: shift.date.toISOString().slice(0, 10),
              label: shift.label,
              category: shift.category,
              startMinute: shift.startMinute,
              endMinute: shift.endMinute,
              location: shift.location ?? "",
              requiredRole: shift.requiredRole ?? "",
              notes: shift.notes ?? "",
            }}
          />
          <div className="mt-4">
            <ShiftDetailActions kind="archive" shiftId={shift.id} />
          </div>
        </section>
      ) : null}

      {shift.notes ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text2">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-white p-3 text-sm">
            {shift.notes}
          </p>
        </section>
      ) : null}
    </main>
  );
}
