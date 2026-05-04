/**
 * Authenticated-area layout.
 *
 * Responsibilities:
 *   1. Require a session (redirect to /login otherwise).
 *   2. Enforce setup gates:
 *        - forcePasswordReset → /setup/password
 *        - role requires MFA but mfaEnabled = false → /setup/mfa
 *      Setup paths themselves are excluded so they can render.
 *
 * Per-feature server actions still call requirePermission(...). The layout
 * is the floor, not the ceiling.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { evaluateSetupGate } from "@/lib/auth/policy";
import { can } from "@/lib/permissions/check";
import { BoundaryNotice } from "@/components/BoundaryNotice";
import { SignOutButton } from "./SignOutButton";

const SETUP_PATHS = ["/setup/mfa", "/setup/password"];

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";

  // Pull the minimum extra fields needed for gate decisions.
  const u = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true, forcePasswordReset: true },
  });
  if (!u) redirect("/login");

  const gate = evaluateSetupGate({
    forcePasswordReset: u.forcePasswordReset,
    mfaEnabled: u.mfaEnabled,
    roleKeys: actor.roleKeys,
  });

  const onSetupPage = SETUP_PATHS.some((p) => pathname.startsWith(p));
  if (gate.kind === "force-password-reset" && pathname !== "/setup/password") {
    redirect("/setup/password");
  }
  if (gate.kind === "mfa-required" && pathname !== "/setup/mfa") {
    redirect("/setup/mfa");
  }
  // If user has cleared the gate but is still on a setup route, let them go home.
  if (gate.kind === "ok" && onSetupPage) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-navy text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold tracking-wide">
            Richmond PD · Internal Ops
          </Link>
          {gate.kind === "ok" ? <NavLinks actor={actor} /> : null}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/70">{actor.email}</span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <BoundaryNotice />
    </div>
  );
}

function NavLinks({ actor }: { actor: { permissionKeys: string[] } }) {
  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: "/dashboard",       label: "Dashboard",  show: true },
    { href: "/admin/users",     label: "Users",      show: can(actor as never, "admin.users.manage") },
    { href: "/admin/roles",     label: "Roles",      show: can(actor as never, "admin.roles.manage") },
    { href: "/admin/audit",     label: "Audit",      show: can(actor as never, "audit.read") },
  ];
  return (
    <nav className="flex items-center gap-4 text-sm">
      {links
        .filter((l) => l.show)
        .map((l) => (
          <Link key={l.href} href={l.href} className="text-white/85 hover:text-white">
            {l.label}
          </Link>
        ))}
    </nav>
  );
}
