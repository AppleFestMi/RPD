"use client";

import { signOut } from "next-auth/react";
import { Icon } from "@/components/ui/Icons";
import { Badge } from "@/components/ui/Badge";

/**
 * Top bar — displayed on every authenticated page.
 *
 * Left:  hamburger (mobile only) + breadcrumb-style page label
 * Right: environment badge, current user with role(s), sign-out
 *
 * This is a client component because it owns the sign-out interaction
 * and the mobile hamburger toggle. The data it shows comes from the
 * server-rendered AppShell (which hydrates a real session).
 */
export function TopBar({
  userEmail,
  userName,
  userInitials,
  primaryRole,
  envLabel,
  onMenuClick,
}: {
  userEmail: string;
  userName: string;
  userInitials: string;
  primaryRole: string | null;
  envLabel: string | null;
  onMenuClick: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:px-6">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onMenuClick}
        className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-text2 hover:bg-neutral-soft lg:hidden"
      >
        <Icon.Menu size={20} />
      </button>

      <div className="hidden items-center gap-1 text-[13px] text-text3 sm:flex">
        <span>Richmond PD</span>
        <span className="text-text3/50">/</span>
        <span className="font-semibold text-text2">Internal Ops</span>
      </div>

      <div className="flex-1" />

      {envLabel ? <Badge tone="warn">{envLabel}</Badge> : null}

      <div className="hidden items-center gap-2 rounded-md border border-line bg-neutral-soft/40 px-2.5 py-1.5 text-[12px] text-text2 sm:flex">
        <Icon.Activity size={13} />
        <span className="text-text3">Role:</span>
        <span className="font-medium">{primaryRole ?? "—"}</span>
      </div>

      <div className="flex items-center gap-2 border-l border-line pl-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">
          {userInitials}
        </span>
        <div className="hidden text-[12.5px] leading-tight sm:block">
          <div className="font-semibold text-ink">{userName}</div>
          <div className="text-text3">{userEmail}</div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="ml-1 rounded-md px-2 py-1.5 text-[12.5px] text-text3 hover:bg-neutral-soft hover:text-text2"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
