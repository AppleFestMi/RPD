import { peekInvitation } from "@/lib/auth/invitation";
import { ActivateForm } from "./ActivateForm";
import { AuthShell } from "@/components/layout/AuthShell";

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
    <AuthShell
      title="Activate your account"
      subtitle="Set a password and accept the system-use notice to finish setup."
    >
      {!valid ? (
        <div className="rounded-md border border-danger/40 bg-danger-soft/15 p-4 text-[13px] text-danger-soft">
          This activation link is{" "}
          <strong>
            {peek?.expired ? "expired" : peek?.used ? "already used" : "invalid"}
          </strong>
          . Ask an administrator to issue a new invitation.
        </div>
      ) : (
        <ActivateForm token={token} />
      )}
    </AuthShell>
  );
}
