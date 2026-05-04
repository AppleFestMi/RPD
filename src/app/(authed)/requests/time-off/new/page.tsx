import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { TimeOffForm } from "./TimeOffForm";

export const dynamic = "force-dynamic";

export default async function NewTimeOffPage() {
  const actor = await requireActor("/requests/time-off/new");
  await requirePermission(actor, "requests.create");
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow="New request · Time off"
        title="Submit a time-off request"
        description="Approved time-off automatically appears as a conflict warning when supervisors try to schedule you for an overlapping shift."
      />
      <Card>
        <CardHeader title="Time-off details" />
        <CardBody>
          <TimeOffForm />
        </CardBody>
      </Card>
      <BoundaryNotice variant="panel" />
    </main>
  );
}
