import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const actor = await requireActor("/training");
  await requirePermission(actor, "training.read.own");
  return (
    <ComingSoon
      eyebrow="Training"
      title="Training records & requests"
      description="Track required and elective certifications, expiration dates, and the request flow for outside courses."
      capabilities={[
        "Personal training history with completion + expiration dates",
        "Department training catalog with seat counts and host org",
        "Submit a training request linked to a course",
        "Supervisor / command approval queues",
        "Certificate file attachments (PDF / image, classification-tagged)",
      ]}
    />
  );
}
