/**
 * /requests/new — picker.
 *
 * Lightweight chooser between the five per-kind forms. Direct links from
 * the dashboard or sidebar can also bypass this page; it exists so a
 * "+ New request" button has a single home.
 */
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icons";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import type { RequestKind } from "@/lib/requests/types";
import { REQUEST_KIND_LABELS } from "@/lib/requests/types";

export const dynamic = "force-dynamic";

const OPTIONS: Array<{
  href: string;
  kind: RequestKind;
  blurb: string;
  icon: IconName;
}> = [
  { href: "/requests/time-off/new",      kind: "timeOff",      blurb: "Vacation, sick, jury, military, bereavement, unpaid.", icon: "Calendar" },
  { href: "/requests/training/new",      kind: "training",     blurb: "Outside courses, conferences, certifications.",        icon: "Award" },
  { href: "/requests/equipment/new",     kind: "equipment",    blurb: "New issue, replacement, damaged, lost, or other.",     icon: "Briefcase" },
  { href: "/requests/vehicle-issue/new", kind: "vehicleIssue", blurb: "Mechanical or service issue with a department unit.", icon: "Car" },
  { href: "/requests/help/new",          kind: "itFacilities", blurb: "IT, radio/MDC, building, supplies, software access.", icon: "Wrench" },
];

export default async function NewRequestPicker() {
  const actor = await requireActor("/requests/new");
  await requirePermission(actor, "requests.create");

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <PageHeader
        eyebrow="Requests"
        title="New request"
        description="Pick the kind of request you want to submit. Each form has its own validations."
      />

      <Card>
        <CardBody>
          <ul className="grid gap-2">
            {OPTIONS.map((o) => {
              const I = Icon[o.icon];
              return (
                <li key={o.kind}>
                  <Link
                    href={o.href}
                    className="group flex items-center gap-4 rounded-lg border border-line bg-white p-4 transition-colors hover:border-accent/50 hover:bg-accent-soft/30"
                  >
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-neutral-soft text-text2 group-hover:bg-accent-soft group-hover:text-accent">
                      <I size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold tracking-tight text-ink">
                        {REQUEST_KIND_LABELS[o.kind]}
                      </span>
                      <span className="block text-[12.5px] leading-snug text-text3">
                        {o.blurb}
                      </span>
                    </span>
                    <span className="text-text3 group-hover:text-accent">
                      <Icon.ChevronRight size={16} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <BoundaryNotice variant="panel" />
    </main>
  );
}
