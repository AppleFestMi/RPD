import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/audit";
import { EVENTS } from "@/lib/audit/events";
import { ForceResetForm } from "./ForceResetForm";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <PageHeader
        eyebrow="Account setup"
        title="Set a new password"
        description="Your account is in forced-reset state. You must replace the temporary password before you can continue."
      />
      <AlertBanner tone="warn" title="Why am I seeing this?">
        An administrator created this account with a temporary password, or flagged it for reset.
        Choose a new password that is at least 12 characters and not on the breached-password
        blocklist. The reset is audit-logged.
      </AlertBanner>
      <Card>
        <CardHeader title="New password" />
        <CardBody>
          <ForceResetForm />
        </CardBody>
      </Card>
    </div>
  );
}
