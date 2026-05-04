import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "danger" | "info" | "pending" | "neutral" | "navy";

const TONE: Record<BadgeTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  pending: "bg-pending-soft text-pending",
  neutral: "bg-neutral-soft text-neutral",
  navy: "bg-navy text-white",
};

/**
 * Badge — small status pill. Use for shift status, role labels, environment
 * indicators, counts, etc. Tone maps to the established status palette.
 */
export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium leading-tight " +
        TONE[tone] +
        " " +
        className
      }
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
