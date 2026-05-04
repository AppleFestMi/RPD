import { requireActor } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function VehiclesPage() {
  await requireActor("/vehicles");
  return (
    <ComingSoon
      eyebrow="Vehicles"
      title="Fleet & vehicle issues"
      description="View fleet status, mileage thresholds, and report mechanical or service issues."
      capabilities={[
        "Fleet roster with unit, model, mileage, status",
        "Report a vehicle issue with priority and description",
        "Service history and resolution tracking",
        "Out-of-service indicators and ETA",
      ]}
    />
  );
}
