import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";
import { AuthShell } from "@/components/layout/AuthShell";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; activated?: string }>;
}) {
  const actor = await getCurrentActor();
  if (actor) redirect("/dashboard");

  const sp = await searchParams;

  return (
    <AuthShell
      title="Richmond PD · Internal Ops"
      subtitle="Sign in to continue"
    >
      {sp.activated === "1" ? (
        <p className="mb-3 rounded-md border border-ok/30 bg-ok-soft/15 px-3 py-2 text-[12.5px] text-ok-soft">
          Account activated. Sign in with your new password to continue.
        </p>
      ) : null}

      <LoginForm
        callbackUrl={typeof sp.next === "string" ? sp.next : "/dashboard"}
        showError={typeof sp.error === "string"}
      />
    </AuthShell>
  );
}
