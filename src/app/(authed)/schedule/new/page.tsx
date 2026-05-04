import { requireActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/permissions/check";
import { ShiftForm } from "../ShiftForm";

export const dynamic = "force-dynamic";

export default async function NewShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const actor = await requireActor("/schedule/new");
  await requirePermission(actor, "schedule.create");
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-xl p-6">
      <a href="/schedule" className="text-sm text-text3 hover:text-text2">← Back to schedule</a>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">New shift</h1>
      <ShiftForm mode="create" defaults={{ date: sp.date ?? new Date().toISOString().slice(0, 10) }} />
    </main>
  );
}
