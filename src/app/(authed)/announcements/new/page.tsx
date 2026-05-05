import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { NewAnnouncementForm } from "./NewAnnouncementForm";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const actor = await requireActor("/announcements/new");
  await requirePermission(actor, "announcements.create");
  const canPublishNow = can(actor, "announcements.publish");

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <Link href="/announcements" className="text-[13px] text-text3 hover:text-text2">
        ← All announcements
      </Link>
      <PageHeader
        eyebrow="Announcements"
        title="New announcement"
        description="Briefings, policy reminders, and other administrative posts. Audience determines who sees the post; required-acknowledgment posts are tracked per user."
      />

      <AlertBanner tone="warn" title="Administrative content only">
        Do not enter CAD, RMS, case, victim/witness, LEIN/NCIC, CJIS, investigative, evidence,
        body camera, HR/payroll, juvenile, or criminal history information. The body and title
        run through the boundary validator before saving.
      </AlertBanner>

      <Card>
        <CardHeader title="Compose" />
        <CardBody>
          <NewAnnouncementForm canPublishNow={canPublishNow} />
        </CardBody>
      </Card>

      <BoundaryNotice variant="panel" />
    </main>
  );
}
