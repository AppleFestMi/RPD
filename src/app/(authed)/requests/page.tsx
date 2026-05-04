import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const actor = await requireActor("/requests");
  await requirePermission(actor, "requests.read.own");
  return (
    <ComingSoon
      eyebrow="Requests"
      title="Internal request center"
      description="Submit and track time-off, training, equipment, vehicle, and IT/facilities requests in one place."
      capabilities={[
        "Submit time-off requests with date range and type (vacation/sick/jury/etc.)",
        "Submit training requests with course and justification",
        "Submit equipment requests with reason",
        "Submit vehicle issues tied to a specific unit",
        "Supervisor and command-level approval queues",
        "Full audit trail of decisions and comments",
      ]}
    />
  );
}
