import type { ReactNode } from "react";
import { BrandLockup } from "./Brand";
import { BoundaryNotice } from "@/components/BoundaryNotice";

/**
 * AuthShell — visual wrapper for unauthenticated screens (login,
 * activation, force-password-reset before sign-in). Centered card on a
 * dark navy backdrop, with the brand lockup, the persistent boundary
 * notice, and an "Authorized use only" footnote.
 *
 * Server component — keep it serializable, no client state.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(900px_500px_at_30%_15%,rgba(110,166,255,0.10),transparent_60%),radial-gradient(700px_400px_at_80%_90%,rgba(47,111,214,0.12),transparent_65%),linear-gradient(180deg,#0b1626,#0f1d33_60%,#0a1424)]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
        <header className="mb-8 flex items-center justify-center">
          <BrandLockup variant="dark" />
        </header>

        <section className="rounded-2xl border border-white/8 bg-navy-800/95 p-7 text-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)] backdrop-blur">
          <h1 className="text-center text-[18px] font-bold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-center text-[13px] text-white/70">{subtitle}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </section>

        {footer ? (
          <p className="mt-4 text-center text-[11.5px] text-white/55">{footer}</p>
        ) : (
          <p className="mt-4 text-center text-[11.5px] text-white/55">
            Authorized use only. Activity is logged.
          </p>
        )}

        <div className="mt-6">
          <BoundaryNotice variant="panel" />
        </div>
      </div>
    </main>
  );
}
