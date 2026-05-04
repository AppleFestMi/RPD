import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { EquipmentForm } from "./EquipmentForm";

export const dynamic = "force-dynamic";

export default async function NewEquipmentPage() {
  const actor = await requireActor("/requests/equipment/new");
  if (!can(actor, "equipment.request") && !can(actor, "requests.create")) {
    redirect("/requests");
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow="New request · Equipment"
        title="Submit an equipment request"
        description="Initial issue, replacement, damaged item, or lost item. Property-room and evidence records do not belong here."
      />
      <Card>
        <CardHeader title="Item details" />
        <CardBody>
          <EquipmentForm />
        </CardBody>
      </Card>
      <BoundaryNotice variant="panel" />
    </main>
  );
}
