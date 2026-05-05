import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { NewPolicyForm } from "./NewPolicyForm";

export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
  const actor = await requireActor("/policies/new");
  await requirePermission(actor, "policies.manage");
  const canPublishNow = can(actor, "policies.publish");

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <Link href="/policies" className="text-[13px] text-text3 hover:text-text2">
        ← All policies
      </Link>
      <PageHeader
        eyebrow="Policies"
        title="Upload a policy"
        description="Department policies and standing orders. Each policy needs a (number, version) pair and one document attachment."
      />

      <AlertBanner tone="warn" title="Administrative policy documents only">
        The uploaded file must be the written policy itself — not evidence, body-cam footage,
        case material, victim/witness data, or any CJIS-regulated content. The policy title may
        name a sensitive subject area (e.g. Body-Worn Camera Policy); the document body must
        still be administrative procedure only. Title and summary are scanned by the boundary
        validator before save.
      </AlertBanner>

      <Card>
        <CardHeader title="Policy metadata + document" />
        <CardBody>
          <NewPolicyForm canPublishNow={canPublishNow} />
        </CardBody>
      </Card>

      <BoundaryNotice variant="panel" />
    </main>
  );
}
