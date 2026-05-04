import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { HelpForm } from "./HelpForm";

export const dynamic = "force-dynamic";

export default async function NewHelpPage() {
  const actor = await requireActor("/requests/help/new");
  await requirePermission(actor, "requests.create");
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link href="/requests" className="text-[13px] text-text3 hover:text-text2">
        ← All requests
      </Link>
      <PageHeader
        eyebrow="New request · IT / Facilities"
        title="Submit a help request"
        description="IT, radio/MDC, building/facilities, software access, supplies, or other administrative needs."
      />
      <Card>
        <CardHeader title="What's wrong?" />
        <CardBody>
          <HelpForm />
        </CardBody>
      </Card>
      <BoundaryNotice variant="panel" />
    </main>
  );
}
