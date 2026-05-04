import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { prisma } from "@/lib/db";
import { InviteForm } from "./InviteForm";

export const dynamic = "force-dynamic";

export default async function InviteUserPage() {
  const actor = await requireActor("/admin/users/new");
  await requirePermission(actor, "admin.users.manage");

  const roles = await prisma.role.findMany({
    orderBy: [{ key: "asc" }],
    select: { key: true, label: true },
  });

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Invite a user</h1>
      <p className="mt-1 text-sm text-text3">
        The invitation creates an inactive account and produces a one-time
        activation link. Share the link with the invited user via department
        email or in person.
      </p>
      <InviteForm roles={roles} />
    </main>
  );
}
