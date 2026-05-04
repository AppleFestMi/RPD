import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { UserDetailClient } from "./UserDetailClient";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor("/admin/users");
  await requirePermission(actor, "admin.users.manage");
  const { id } = await params;

  const [user, roles] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    }),
    prisma.role.findMany({ orderBy: [{ key: "asc" }] }),
  ]);
  if (!user) notFound();

  const userRoleKeys = user.roles.map((r) => r.role.key);

  const lastInvitation = await prisma.userInvitation.findFirst({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <a href="/admin/users" className="text-sm text-text3 hover:text-text2">
        ← All users
      </a>
      <h1 className="mt-2 text-2xl font-bold">{user.name}</h1>
      <p className="text-sm font-mono text-text3">{user.email}</p>

      <UserDetailClient
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          rank: user.rank,
          badge: user.badge,
          activatedAt: user.activatedAt?.toISOString() ?? null,
          disabledAt: user.disabledAt?.toISOString() ?? null,
          mfaEnabled: user.mfaEnabled,
          forcePasswordReset: user.forcePasswordReset,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          lastLoginIp: user.lastLoginIp,
          failedLoginCount: user.failedLoginCount,
          lockedUntil: user.lockedUntil?.toISOString() ?? null,
        }}
        userRoleKeys={userRoleKeys}
        allRoles={roles.map((r) => ({ key: r.key, label: r.label }))}
        capabilities={{
          canManageRoles: can(actor, "admin.roles.manage"),
          canResetMfa: can(actor, "admin.mfa.reset"),
          canUnlock: can(actor, "admin.users.unlock"),
        }}
        lastInvitation={
          lastInvitation
            ? {
                expiresAt: lastInvitation.expiresAt.toISOString(),
                used: lastInvitation.usedAt !== null,
              }
            : null
        }
      />
    </main>
  );
}
