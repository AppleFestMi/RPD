import { requireActor } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  await requireActor("/equipment");
  return (
    <ComingSoon
      eyebrow="Equipment"
      title="Equipment inventory & requests"
      description="Track issued equipment, submit requests for new or replacement items, and surface the assignment history."
      capabilities={[
        "Personal equipment list with serial numbers and issue dates",
        "Submit equipment request with reason (initial / damaged / replacement)",
        "Admin assignment + return tracking",
        "Department-wide inventory view for management",
      ]}
    />
  );
}
