import type { ReactNode } from "react";

type Tone = "info" | "warn" | "danger" | "success";

const TONE: Record<Tone, { wrap: string; dot: string }> = {
  info: {
    wrap: "border-info/30 bg-info-soft/60 text-text2",
    dot: "bg-info",
  },
  warn: {
    wrap: "border-warn/30 bg-warn-soft/60 text-text2",
    dot: "bg-warn",
  },
  danger: {
    wrap: "border-danger/30 bg-danger-soft/60 text-text2",
    dot: "bg-danger",
  },
  success: {
    wrap: "border-ok/30 bg-ok-soft/60 text-text2",
    dot: "bg-ok",
  },
};

/**
 * AlertBanner — non-intrusive page-level notice. Distinct from
 * BoundaryNotice (which is the persistent CJI/CAD warning); use this for
 * transient context like "you have 2 policies awaiting acknowledgment"
 * or "MFA setup required to continue."
 */
export function AlertBanner({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const cls = TONE[tone];
  return (
    <div
      className={
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-[13px] leading-snug " +
        cls.wrap +
        " " +
        className
      }
    >
      <span className={"mt-1.5 inline-block h-2 w-2 flex-none rounded-full " + cls.dot} />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold tracking-tight text-text2">{title}</div> : null}
        {children ? <div className={title ? "mt-0.5 text-text3" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}
