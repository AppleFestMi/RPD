import { peekInvitation } from "@/lib/auth/invitation";
import { ActivateForm } from "./ActivateForm";
import { BoundaryNotice } from "@/components/BoundaryNotice";

export const dynamic = "force-dynamic";

export default async function ActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const peek = await peekInvitation(token);

  const valid = peek !== null && !peek.expired && !peek.used;

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-navy-ink via-navy to-navy-ink p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-lg font-bold tracking-wide text-navy">Activate your account</h1>
        <p className="mt-1 text-sm text-text3">
          Set a password and accept the system-use notice to finish setup.
        </p>

        {!valid ? (
          <p className="mt-6 rounded-md bg-danger-soft p-3 text-sm text-danger">
            This activation link is {peek?.expired ? "expired" : peek?.used ? "already used" : "invalid"}.
            Ask an administrator to send a new invitation.
          </p>
        ) : (
          <ActivateForm token={token} />
        )}
      </div>
      <div className="mt-4 max-w-md">
        <BoundaryNotice variant="form" />
      </div>
    </main>
  );
}
