import type { ReactNode } from "react";

/**
 * HeroCard — the welcome panel at the top of the dashboard.
 *
 * Dark-navy gradient with a soft accent glow, mirroring the prototype's
 * "Today's briefing" banner. Render as a plain block element so the
 * dashboard grid can size it via responsive grid columns.
 */
export function HeroCard({
  title,
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-navy-ink bg-gradient-to-br from-navy-ink via-navy to-navy-700 p-6 text-white shadow-[0_18px_40px_-22px_rgba(15,29,51,0.6)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-accent/30 blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1.5 text-[14px] leading-snug text-white/75">{description}</p>
          ) : null}
          {meta ? <div className="mt-3 text-[12.5px] text-white/65">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
