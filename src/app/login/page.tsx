import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";
import { BoundaryNotice } from "@/components/BoundaryNotice";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const actor = await getCurrentActor();
  if (actor) redirect("/dashboard");

  const sp = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-navy-ink via-navy to-navy-ink p-6">
      <div className="w-full max-w-sm rounded-2xl bg-navy-800 border border-white/8 p-8 shadow-2xl text-white">
        <h1 className="text-lg font-bold tracking-wide text-center">Richmond PD · Internal Ops</h1>
        <p className="mt-1 text-center text-sm text-text3">Sign in to continue</p>

        <LoginForm
          callbackUrl={typeof sp.next === "string" ? sp.next : "/dashboard"}
          showError={typeof sp.error === "string"}
        />

        <p className="mt-6 text-center text-[11px] text-text3">
          Authorized use only. Activity is logged.
        </p>
      </div>

      <div className="mt-6 max-w-md">
        <BoundaryNotice variant="form" />
      </div>
    </main>
  );
}
