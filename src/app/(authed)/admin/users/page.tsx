import Link from "next/link";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function UsersIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const actor = await requireActor("/admin/users");
  await requirePermission(actor, "admin.users.manage");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
          { badge: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy: [{ disabledAt: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where }),
  ]);

  const h = await headers();
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUDIT_VIEWED,
    action: "view",
    result: "success",
    requestId: h.get("x-request-id"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    metadata: { surface: "admin.users.index", q },
  });

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description={`${total} user${total === 1 ? "" : "s"} on file.`}
        actions={
          <Button href="/admin/users/new" variant="accent" size="md">
            Invite user
          </Button>
        }
      />

      <form className="mt-4 flex gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, badge…"
          className="w-full max-w-sm rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft">
          Search
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-soft text-left text-[11.5px] uppercase tracking-wider text-text3">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Roles</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <div className="font-medium">{u.name}</div>
                  {u.rank ? <div className="text-[11.5px] text-text3">{u.rank}</div> : null}
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px]">{u.email}</td>
                <td className="px-3 py-2 text-[12px]">
                  {u.roles.map((r) => r.role.label).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-[12px]">
                  <StatusBadge user={u} />
                </td>
                <td className="px-3 py-2 text-[12px] text-text3">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/admin/users/${u.id}`} className="text-accent hover:underline">
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-sm text-text3">
        {total} user{total === 1 ? "" : "s"}
        {total > PAGE_SIZE ? ` · page ${page}` : null}
      </div>
    </main>
  );
}

function StatusBadge({
  user,
}: {
  user: { disabledAt: Date | null; activatedAt: Date | null; lockedUntil: Date | null };
}) {
  if (user.disabledAt) return <span className="rounded bg-danger-soft px-2 py-0.5 text-danger">Disabled</span>;
  if (!user.activatedAt) return <span className="rounded bg-warn-soft px-2 py-0.5 text-warn">Invited</span>;
  if (user.lockedUntil && user.lockedUntil > new Date())
    return <span className="rounded bg-warn-soft px-2 py-0.5 text-warn">Locked</span>;
  return <span className="rounded bg-ok-soft px-2 py-0.5 text-ok">Active</span>;
}
