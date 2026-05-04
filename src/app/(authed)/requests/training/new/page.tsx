import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { TrainingForm } from "./TrainingForm";

export const dynamic = "force-dynamic";

export default async function NewTrainingPage() {
  const actor = await requireActor("/requests/training/new");
  await requirePermission(actor, "requests.create");
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow="New request · Training"
        title="Submit a training request"
        description="Outside courses, conferences, and certifications. Cost and travel details help command staff decide."
      />
      <Card>
        <CardHeader title="Course details" />
        <CardBody>
          <TrainingForm />
        </CardBody>
      </Card>
      <BoundaryNotice variant="panel" />
    </main>
  );
}
