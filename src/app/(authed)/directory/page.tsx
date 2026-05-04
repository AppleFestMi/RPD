import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const actor = await requireActor("/directory");
  await requirePermission(actor, "directory.read");
  return (
    <ComingSoon
      eyebrow="Directory"
      title="Department directory"
      description="Looking up department-issued contact information for sworn, reserve, and dispatch staff."
      capabilities={[
        "Department-issued email and extension only — never personal contacts",
        "Search by name, badge, role, or assignment",
        "Filter by current shift / assignment",
        "Profile pages with rank and tags (FTO, instructor, etc.)",
      ]}
      showBoundary={false}
    />
  );
}
