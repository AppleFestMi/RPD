import type { ReactNode } from "react";
import { Card, CardBody } from "@/components/ui/Card";

/**
 * StatCard — a single dashboard KPI tile.
 *
 *   <StatCard label="Open shifts this week" value={4} sub="2 reserve · 1 OT · 1 event" />
 *
 * `value` is rendered in monospace + bold so numbers align in a row of
 * StatCards. Hint text on the right is for an icon or chip.
 */
export function StatCard({
  label,
  value,
  sub,
  trailing,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  const valueColor = {
    neutral: "text-ink",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
  }[tone];
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text3">
            {label}
          </div>
          <div className={"mt-1 font-mono text-[26px] font-bold leading-none tracking-tight " + valueColor}>
            {value}
          </div>
          {sub ? <div className="mt-1.5 text-[12px] text-text3">{sub}</div> : null}
        </div>
        {trailing ? (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-neutral-soft text-text3">
            {trailing}
          </span>
        ) : null}
      </CardBody>
    </Card>
  );
}
