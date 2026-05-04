import type { ReactNode } from "react";

/**
 * EmptyState — fills empty tables and lists. The dashed border + muted
 * background is the prototype's visual idiom for "this surface is fine,
 * there's just nothing here yet."
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-neutral-soft/40 px-6 py-10 text-center " +
        className
      }
    >
      {icon ? <div className="text-text3">{icon}</div> : null}
      <h3 className="text-[14px] font-semibold tracking-tight text-text2">{title}</h3>
      {description ? (
        <p className="max-w-md text-[13px] leading-snug text-text3">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
