import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { VehicleIssueForm } from "./VehicleIssueForm";

export const dynamic = "force-dynamic";

export default async function NewVehicleIssuePage() {
  const actor = await requireActor("/requests/vehicle-issue/new");
  if (!can(actor, "vehicles.reportIssue") && !can(actor, "requests.create")) {
    redirect("/requests");
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { archivedAt: null },
    orderBy: { unit: "asc" },
    select: { id: true, unit: true, model: true, status: true },
    take: 200,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow="New request · Vehicle issue"
        title="Report a vehicle issue"
        description="Mechanical or service issue with a department unit. Do not enter crash, incident, or case content here — those belong in CAD/RMS."
      />
      <Card>
        <CardHeader title="Issue details" />
        <CardBody>
          <VehicleIssueForm
            vehicles={vehicles.map((v) => ({
              id: v.id,
              label: `${v.unit} — ${v.model}${v.status === "outOfService" ? " (out of service)" : ""}`,
            }))}
          />
        </CardBody>
      </Card>
      <BoundaryNotice variant="panel" />
    </main>
  );
}
