import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Roles overview — read-only for now.
 *
 * Granting/revoking roles to a user happens on the user detail page.
 * Editing role permissions (creating new roles, granting/revoking
 * permissions on a role) is a future change; the schema and audit events
 * already exist.
 */
export default async function RolesPage() {
  const actor = await requireActor("/admin/roles");
  await requirePermission(actor, "admin.roles.manage");

  const roles = await prisma.role.findMany({
    include: {
      permissions: { include: { permission: true } },
      users: true,
    },
    orderBy: { key: "asc" },
  });

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <PageHeader
        eyebrow="Admin"
        title="Roles"
        description="Read-only view of role definitions and permission grants. Assign roles to users from the user detail page."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <article key={r.id} className="rounded-lg border border-line bg-white p-4">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">{r.label}</h2>
                <p className="font-mono text-[11.5px] text-text3">{r.key}</p>
              </div>
              <span className="rounded bg-neutral-soft px-2 py-0.5 text-[11.5px] text-text3">
                {r.users.length} user{r.users.length === 1 ? "" : "s"}
              </span>
            </header>
            {r.description ? (
              <p className="mt-2 text-[13px] text-text2">{r.description}</p>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] text-text3 hover:text-text2">
                {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 font-mono text-[11.5px] text-text2 sm:grid-cols-2">
                {r.permissions
                  .map((rp) => rp.permission.key)
                  .sort()
                  .map((k) => (
                    <li key={k} className="rounded bg-neutral-soft px-2 py-1">
                      {k}
                    </li>
                  ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
    </main>
  );
}
