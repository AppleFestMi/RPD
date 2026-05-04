import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { appDecisionTone, StatusChip } from "@/components/schedule/StatusChip";
import { SwapRow } from "./SwapRow";
import { SwapNewForm } from "./SwapNewForm";

export const dynamic = "force-dynamic";

export default async function SwapsPage() {
  const actor = await requireActor("/schedule/swaps");
  await requirePermission(actor, "schedule.read");
  const canApprove = can(actor, "schedule.swap.approve");
  const canRequest = can(actor, "schedule.swap.request");

  // Three relevant streams: mine outgoing, mine incoming, all needing review.
  const [mineOut, mineIn, awaitingReview] = await Promise.all([
    prisma.shiftSwapRequest.findMany({
      where: { fromUserId: actor.userId },
      include: {
        toUser: { select: { name: true, email: true } },
        fromUser: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.shiftSwapRequest.findMany({
      where: { toUserId: actor.userId, status: { in: ["submitted", "acceptedByReplacement"] } },
      include: {
        fromUser: { select: { name: true, email: true } },
        toUser: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    canApprove
      ? prisma.shiftSwapRequest.findMany({
          where: { status: { in: ["acceptedByReplacement", "supervisorReview"] } },
          include: {
            fromUser: { select: { name: true, email: true } },
            toUser: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 50,
        })
      : Promise.resolve([] as never[]),
  ]);

  const myShifts = canRequest
    ? await prisma.scheduleAssignment.findMany({
        where: {
          userId: actor.userId,
          status: { in: ["scheduled", "pending", "changed"] },
          shift: { archivedAt: null, status: { not: "cancelled" }, date: { gte: new Date() } },
        },
        include: { shift: { select: { id: true, date: true, label: true, startMinute: true, endMinute: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
    : [];

  const possibleReplacements = canRequest
    ? await prisma.user.findMany({
        where: { disabledAt: null, activatedAt: { not: null }, id: { not: actor.userId } },
        select: { id: true, name: true, badge: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    : [];

  return (
    <main className="p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shift swaps</h1>
          <p className="text-sm text-text3">Propose, accept, and review swap requests.</p>
        </div>
        <Link href="/schedule" className="text-sm text-text3 hover:text-text2">← Schedule</Link>
      </header>

      {canRequest && myShifts.length > 0 ? (
        <section className="mt-5 rounded-lg border border-line bg-white p-4">
          <h2 className="text-sm font-semibold">Request a swap</h2>
          <SwapNewForm
            myShifts={myShifts.map((a) => ({
              id: a.shift.id,
              label: `${a.shift.label} · ${a.shift.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            }))}
            replacements={possibleReplacements.map((u) => ({
              id: u.id,
              label: `${u.name}${u.badge ? ` · ${u.badge}` : ""}`,
            }))}
          />
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text2">Awaiting your response</h2>
        {mineIn.length === 0 ? (
          <p className="mt-2 text-sm text-text3">Nothing to review.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {mineIn.map((s) => (
              <SwapRow
                key={s.id}
                row={{
                  id: s.id,
                  status: s.status,
                  reason: s.reason ?? null,
                  fromUser: s.fromUser?.name ?? "?",
                  toUser: s.toUser?.name ?? "?",
                }}
                viewer="replacement"
              />
            ))}
          </ul>
        )}
      </section>

      {canApprove ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text2">Awaiting supervisor review</h2>
          {awaitingReview.length === 0 ? (
            <p className="mt-2 text-sm text-text3">No swap requests in supervisor review.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {awaitingReview.map((s) => (
                <SwapRow
                  key={s.id}
                  row={{
                    id: s.id,
                    status: s.status,
                    reason: s.reason ?? null,
                    fromUser: s.fromUser?.name ?? "?",
                    toUser: s.toUser?.name ?? "?",
                  }}
                  viewer="supervisor"
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-text2">My recent swap requests</h2>
        {mineOut.length === 0 ? (
          <p className="mt-2 text-sm text-text3">None yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {mineOut.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">→ {s.toUser?.name}</div>
                  {s.reason ? <div className="text-[12px] text-text3">{s.reason}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip label={s.status} tone={appDecisionTone(s.status)} />
                  <SwapRow
                    row={{
                      id: s.id,
                      status: s.status,
                      reason: s.reason ?? null,
                      fromUser: s.fromUser?.name ?? "?",
                      toUser: s.toUser?.name ?? "?",
                    }}
                    viewer="requester"
                    inline
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
