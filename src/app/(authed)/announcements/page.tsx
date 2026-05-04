import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const actor = await requireActor("/announcements");
  await requirePermission(actor, "announcements.read");
  return (
    <ComingSoon
      eyebrow="Announcements"
      title="Department announcements"
      description="Publish and acknowledge daily briefings, policy reminders, training notices, and reserve-unit news."
      capabilities={[
        "Daily / shift briefings posted by supervisors",
        "Department-wide notices from command staff",
        "Audience scoping: All / Patrol / Reserves / Command / Dispatch / Supervisors",
        "Required-acknowledgment posts with completion tracking",
        "Pinned and archived states",
      ]}
    />
  );
}
