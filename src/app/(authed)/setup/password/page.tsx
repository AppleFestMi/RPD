import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { ForceResetForm } from "./ForceResetForm";

export const dynamic = "force-dynamic";

export default async function ForcePasswordResetPage() {
  const actor = await requireActor("/setup/password");
  const h = await headers();

  // Log every visit; this surface is rare and meaningful.
  await auditLog({
    actor: { userId: actor.userId, roleSnapshot: actor.roleKeys },
    eventType: EVENTS.AUTH_PASSWORD_RESET_REQUIRED,
    action: "view",
    result: "success",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    requestId: h.get("x-request-id"),
  });

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <p className="mt-1 text-sm text-text3">
        Your account requires a password change before you can continue.
      </p>
      <ForceResetForm />
    </main>
  );
}
