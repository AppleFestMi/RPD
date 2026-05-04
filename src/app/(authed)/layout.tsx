/**
 * Authenticated-area layout.
 *
 * `requireActor()` redirects to /login if there is no session. All routes
 * under (authed) inherit this gate, but each server action / API route
 * MUST still call requirePermission() — the layout is the floor, not the
 * ceiling.
 */
import { requireActor } from "@/lib/auth/session";
import { BoundaryNotice } from "@/components/BoundaryNotice";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-line px-6 py-3 flex items-center justify-between">
        <div className="font-semibold tracking-wide text-navy">Richmond PD · Internal Ops</div>
        <div className="text-sm text-text3">{actor.email}</div>
      </header>
      <div className="flex-1">{children}</div>
      <BoundaryNotice />
    </div>
  );
}
