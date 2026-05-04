import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

/**
 * DashboardPanel — the standard "named region" on the dashboard
 * (Today's briefing, My upcoming shifts, etc.). Composed of Card with a
 * required title and an optional "View all" footer link.
 */
export function DashboardPanel({
  title,
  meta,
  viewAllHref,
  viewAllLabel = "View all",
  children,
  empty = false,
  className = "",
}: {
  title: ReactNode;
  meta?: ReactNode;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
  empty?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} meta={meta} />
      <CardBody className={empty ? "" : "pt-3"}>{children}</CardBody>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="flex items-center justify-between border-t border-line/70 px-4 py-2.5 text-[12.5px] text-accent hover:bg-accent-soft/40"
        >
          <span>{viewAllLabel}</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </Card>
  );
}
