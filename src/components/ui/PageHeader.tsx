import type { ReactNode } from "react";

/**
 * PageHeader — the consistent top-of-page label + action band.
 *
 *   <PageHeader
 *     title="Schedule"
 *     description="Week of May 4, 2026"
 *     actions={<Button>Add shift</Button>}
 *   />
 *
 * The eyebrow is optional and renders above the title in muted-uppercase.
 * Use it for breadcrumb-style hints ("Admin · Users") that don't deserve
 * the full breadcrumb component.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={
        "flex flex-wrap items-end justify-between gap-4 border-b border-line/70 pb-5 " + className
      }
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text3">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-text3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
