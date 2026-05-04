"use client";

/**
 * AppShell — owns the mobile-nav open/close state, then renders the
 * sidebar, top bar, page content, and persistent boundary footer.
 *
 * The shell is a client component because the mobile drawer is
 * stateful. All the data it reads is computed server-side and passed
 * in as plain props from the (authed) layout — so no auth or
 * permission decisions are made on the client.
 */
import { useState } from "react";
import { SidebarNav, type NavLinkSpec } from "./SidebarNav";
import { TopBar } from "./TopBar";
import { BoundaryNotice } from "@/components/BoundaryNotice";

export function AppShell({
  children,
  links,
  userEmail,
  userName,
  userInitials,
  primaryRole,
  envLabel,
}: {
  children: React.ReactNode;
  links: NavLinkSpec[];
  userEmail: string;
  userName: string;
  userInitials: string;
  primaryRole: string | null;
  envLabel: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="grid min-h-screen lg:grid-cols-[232px_1fr]">
      <SidebarNav
        links={links}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        footer={
          <>
            <span className="font-semibold text-white/80">Admin only.</span> Not for CAD, RMS,
            evidence, body cam, HR/payroll, or CJIS data.
          </>
        }
      />
      <div className="flex min-w-0 flex-col">
        <TopBar
          userEmail={userEmail}
          userName={userName}
          userInitials={userInitials}
          primaryRole={primaryRole}
          envLabel={envLabel}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 bg-[var(--bg)]">{children}</main>
        <BoundaryNotice />
      </div>
    </div>
  );
}
