import Link from "next/link";
import type { ReactNode } from "react";

/**
 * QuickActionButton — the dashboard's "Quick actions" tile. Renders as a
 * link card with an icon and a one-line label, to the same proportions
 * the prototype used. Hover lifts the border to the accent color.
 */
export function QuickActionButton({
  href,
  label,
  icon,
  description,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
  description?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-line bg-white p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/30"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-neutral-soft text-text2 group-hover:bg-accent-soft group-hover:text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="block truncate text-[11.5px] text-text3">{description}</span>
        ) : null}
      </span>
    </Link>
  );
}
