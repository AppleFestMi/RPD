/**
 * Authenticated-area layout.
 *
 * Responsibilities (server-side):
 *   1. Require a session (redirect to /login otherwise).
 *   2. Enforce setup gates:
 *        - forcePasswordReset → /setup/password
 *        - role requires MFA but mfaEnabled = false → /setup/mfa
 *      Setup paths themselves are excluded so they can render.
 *   3. Compute the user-visible nav links once, server-side, based on
 *      the actor's permissions, and hand them to AppShell.
 *
 * Per-feature server actions still call requirePermission(...). The
 * layout is the floor, not the ceiling. Hiding a sidebar link is a
 * usability choice, never a security boundary.
 */
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { evaluateSetupGate } from "@/lib/auth/policy";
import { can } from "@/lib/permissions/check";
import { AppShell } from "@/components/layout/AppShell";
import type { NavLinkSpec } from "@/components/layout/SidebarNav";

const SETUP_PATHS = ["/setup/mfa", "/setup/password"];

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";

  const u = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true, forcePasswordReset: true, name: true, email: true },
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
  if (gate.kind === "ok" && onSetupPage) {
    redirect("/dashboard");
  }

  const links: NavLinkSpec[] = [
    { href: "/dashboard",              label: "Dashboard",            icon: "Home",      show: true,                                                                       group: "Daily Ops" },
    { href: "/schedule",               label: "Schedule",             icon: "Calendar",  show: can(actor, "schedule.read"),                                                group: "Scheduling" },
    { href: "/schedule/open",          label: "Open Shifts",          icon: "Megaphone", show: can(actor, "schedule.read"),                                                group: "Scheduling" },
    { href: "/schedule/availability",  label: "Reserve Availability", icon: "Clock",     show: can(actor, "availability.read.own"),                                        group: "Scheduling" },
    { href: "/schedule/swaps",         label: "Shift Swaps",          icon: "Swap",      show: can(actor, "schedule.read"),                                                group: "Scheduling" },
    { href: "/schedule/timeoff",       label: "Time Off",             icon: "FileText",  show: can(actor, "schedule.read"),                                                group: "Scheduling" },
    { href: "/requests",               label: "Requests",             icon: "Inbox",     show: can(actor, "requests.read.own"),                                            group: "Daily Ops" },
    { href: "/training",               label: "Training",             icon: "Award",     show: can(actor, "training.read.own"),                                            group: "Daily Ops" },
    { href: "/announcements",          label: "Announcements",        icon: "Bell",      show: can(actor, "announcements.read"),                                           group: "Daily Ops" },
    { href: "/policies",               label: "Policies",             icon: "BookOpen",  show: can(actor, "policies.read"),                                                group: "Daily Ops" },
    { href: "/equipment",              label: "Equipment",            icon: "Briefcase", show: can(actor, "equipment.request") || can(actor, "equipment.manage"),          group: "Daily Ops" },
    { href: "/vehicles",               label: "Vehicles",             icon: "Car",       show: can(actor, "vehicles.reportIssue") || can(actor, "vehicles.manage"),        group: "Daily Ops" },
    { href: "/events",                 label: "Special Events",       icon: "Star",      show: can(actor, "events.read"),                                                  group: "Daily Ops" },
    { href: "/directory",              label: "Directory",            icon: "IdCard",    show: can(actor, "directory.read"),                                               group: "Daily Ops" },
    { href: "/admin/users",            label: "Users",                icon: "Users",     show: can(actor, "admin.users.manage"),                                           group: "Admin" },
    { href: "/admin/roles",            label: "Roles",                icon: "Settings",  show: can(actor, "admin.roles.manage"),                                           group: "Admin" },
    { href: "/admin/audit",            label: "Audit Log",            icon: "Activity",  show: can(actor, "audit.read"),                                                   group: "Admin" },
  ];

  // Show a "Local Dev" badge unless we're explicitly in production. Helps
  // staff distinguish demo from real during pilot rollout.
  const envLabel = process.env.NODE_ENV === "production" ? null : "Local Dev";
  const primaryRole = primaryRoleLabel(actor.roleKeys);

  return (
    <AppShell
      links={links}
      userEmail={u.email}
      userName={u.name}
      userInitials={initials(u.name)}
      primaryRole={primaryRole}
      envLabel={envLabel}
    >
      {children}
    </AppShell>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

// Pick a single, human-friendly role to surface in the top bar. Ordered
// from most-privileged downward; the user sees the "highest" role they
// hold. This is display only — authorization always uses the full role
// set.
const ROLE_PRIORITY: Array<[string, string]> = [
  ["systemAdmin", "System Admin"],
  ["admin", "Admin"],
  ["commandStaff", "Command Staff"],
  ["supervisor", "Supervisor"],
  ["auditorReadOnly", "Auditor"],
  ["officer", "Officer"],
  ["reserveOfficer", "Reserve Officer"],
  ["dispatcher", "Dispatcher"],
];

function primaryRoleLabel(roleKeys: string[]): string | null {
  for (const [key, label] of ROLE_PRIORITY) {
    if (roleKeys.includes(key)) return label;
  }
  return null;
}
