import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const actor = await requireActor("/events");
  await requirePermission(actor, "events.read");
  return (
    <ComingSoon
      eyebrow="Special Events"
      title="Special event planning & staffing"
      description="Plan multi-day events, organize posts, assign personnel, and coordinate mutual aid."
      capabilities={[
        "Event roster with dates, lead, location, and ICS classification",
        "Posts (named staffing slots) with required headcount",
        "Per-day briefings and asset attachments",
        "Mutual-aid agency tracking (county, state, fire, EMS)",
        "Open-shift integration for event coverage",
      ]}
    />
  );
}
