"use client";

/**
 * Sidebar navigation. Renders the same item list on desktop (always
 * visible on lg+) and inside a slide-in panel on mobile. The panel state
 * is owned by AppShell via the `mobileOpen` / `onClose` props.
 *
 * Items the actor can't reach are hidden for usability — pages
 * themselves still call `requirePermission()` server-side. UI hiding is
 * never the security boundary.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandLockup } from "./Brand";
import { Icon, type IconName } from "@/components/ui/Icons";

export type NavLinkSpec = {
  href: string;
  label: string;
  icon: IconName;
  show: boolean;
  group: "Daily Ops" | "Scheduling" | "Admin";
  badge?: number;
};

export function SidebarNav({
  links,
  footer,
  mobileOpen = false,
  onClose,
}: {
  links: NavLinkSpec[];
  footer?: ReactNode;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const visible = links.filter((l) => l.show);
  const grouped = new Map<string, NavLinkSpec[]>();
  for (const l of visible) {
    const arr = grouped.get(l.group) ?? [];
    arr.push(l);
    grouped.set(l.group, arr);
  }

  return (
    <>
      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-navy-ink/50 lg:hidden"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={
          "fixed z-50 flex h-screen w-[232px] flex-col border-r border-navy-ink bg-navy text-[#c8d3e3] transition-transform lg:sticky lg:top-0 lg:z-0 lg:translate-x-0 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <BrandLockup />
          <button
            type="button"
            aria-label="Close navigation"
            className="text-white/70 hover:text-white lg:hidden"
            onClick={onClose}
          >
            <Icon.X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {Array.from(grouped.entries()).map(([group, items]) => (
            <NavGroup key={group} label={group} items={items} onPick={onClose} />
          ))}
        </nav>

        {footer ? (
          <div className="border-t border-white/10 px-4 py-3 text-[11px] leading-snug text-[#7d92b1]">
            {footer}
          </div>
        ) : null}
      </aside>
    </>
  );
}

function NavGroup({
  label,
  items,
  onPick,
}: {
  label: string;
  items: NavLinkSpec[];
  onPick?: () => void;
}) {
  return (
    <div className="mb-2">
      <div className="px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#6e83a3]">
        {label}
      </div>
      <ul className="space-y-0.5 px-2">
        {items.map((l) => (
          <NavItem key={l.href} {...l} onPick={onPick} />
        ))}
      </ul>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  badge,
  onPick,
}: NavLinkSpec & { onPick?: () => void }) {
  const path = usePathname() ?? "";
  const active =
    path === href ||
    (href !== "/dashboard" && path.startsWith(href + "/")) ||
    (href !== "/dashboard" && path.startsWith(href));
  const I = Icon[icon];
  return (
    <li>
      <Link
        href={href}
        onClick={onPick}
        className={
          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] " +
          (active
            ? "bg-white/10 text-white shadow-[inset_2px_0_0_#2f6fd6]"
            : "text-[#c4d0e2] hover:bg-white/5 hover:text-white")
        }
      >
        <I size={17} />
        <span className="flex-1 truncate">{label}</span>
        {badge ? (
          <span className="rounded-full bg-accent px-1.5 py-px text-[10.5px] font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
