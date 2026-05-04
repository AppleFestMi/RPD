/**
 * Dashboard — authenticated landing page.
 *
 * This is intentionally minimal. It demonstrates the auth/permission/audit
 * pattern that all subsequent feature pages must follow.
 */
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActor("/dashboard");

  // Example of UI-level capability check (NOT a security boundary).
  const canSeeAudit = can(actor, "audit.read");

  // Optional: log explicit admin-area views. We do not log every dashboard
  // hit (would be noise), but specific sensitive surfaces should.
  if (canSeeAudit) {
    const h = await headers();
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
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-text3">Foundation build · feature modules pending.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="My next shift" sub="—" />
        <Card title="Pending approvals" sub="—" />
        <Card title="Open shifts this week" sub="—" />
        <Card title="Policies awaiting ack" sub="—" />
      </section>

      <section className="mt-8 rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Your access</h2>
        <p className="mt-1 text-xs text-text3">
          Roles: {actor.roleKeys.length === 0 ? "(none)" : actor.roleKeys.join(", ")}
        </p>
        <p className="mt-1 text-xs text-text3">
          Permissions: {actor.permissionKeys.length}
        </p>
      </section>
    </main>
  );
}

function Card({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="text-[11px] uppercase tracking-wider text-text3">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{sub}</div>
    </div>
  );
}
