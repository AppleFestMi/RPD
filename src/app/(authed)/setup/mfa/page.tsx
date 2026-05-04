import QRCode from "qrcode";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startMfaSetup } from "./actions";
import { MfaSetupClient } from "./MfaSetupClient";
import { actorMfaRequired } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage() {
  const actor = await requireActor("/setup/mfa");

  const u = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true, mfaSecretEncrypted: true },
  });

  // Already enrolled — show a "you're done" state with regenerate-codes
  // affordance. The (authed) layout will normally redirect them away if MFA
  // isn't required by their role; this branch covers users who landed here
  // from /admin or similar.
  if (u?.mfaEnabled) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-text3">MFA is enabled for your account.</p>
        <p className="mt-4 text-sm">
          To regenerate backup codes, contact a system administrator or use the
          recovery codes section in your profile (TODO).
        </p>
      </main>
    );
  }

  const required = actorMfaRequired(actor);

  // Initiate enrollment server-side and pass the QR data URL into the client
  // component. The plaintext secret is intentionally surfaced once for manual
  // entry; we never expose it again.
  const { otpauthUri, secretBase32 } = await startMfaSetup();
  const qrSvg = await QRCode.toString(otpauthUri, { type: "svg", margin: 1 });

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-semibold">Set up two-factor authentication</h1>
      <p className="mt-1 text-sm text-text3">
        {required
          ? "Your role requires MFA before you can access the rest of the app."
          : "MFA adds a second factor to your sign-in. Recommended for everyone."}
      </p>

      <ol className="mt-5 space-y-4 text-sm">
        <li>
          <div className="font-semibold">1. Scan the QR code with an authenticator app.</div>
          <p className="text-text3">
            Recommended apps: 1Password, Bitwarden, Authy, Google Authenticator.
          </p>
          <div
            className="mt-3 inline-block rounded-md bg-white p-3 border border-line"
            // QR code is server-rendered SVG — no inline JS, CSP-safe.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </li>
        <li>
          <div className="font-semibold">2. Or enter the secret manually.</div>
          <code className="mt-1 inline-block rounded bg-neutral-soft px-2 py-1 font-mono text-[13px] tracking-wider">
            {secretBase32.match(/.{1,4}/g)?.join(" ") ?? secretBase32}
          </code>
        </li>
        <li>
          <div className="font-semibold">3. Enter the 6-digit code your app shows.</div>
          <MfaSetupClient />
        </li>
      </ol>
    </main>
  );
}
