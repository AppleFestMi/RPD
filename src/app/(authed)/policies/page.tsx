import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const actor = await requireActor("/policies");
  await requirePermission(actor, "policies.read");
  return (
    <ComingSoon
      eyebrow="Policies"
      title="Policy & SOP library"
      description="Versioned policies and standard operating procedures with required acknowledgments."
      capabilities={[
        "Versioned policy documents with effective dates",
        "Per-user acknowledgment tracking — who has read what, and when",
        "Categorized library: General / Operations / Personnel / Admin",
        "PDF attachments with classification tags",
        "Search and filter by category, status, version",
      ]}
    />
  );
}
