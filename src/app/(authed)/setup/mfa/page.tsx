import QRCode from "qrcode";
import { requireActor } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { startMfaSetup } from "./actions";
import { MfaSetupClient } from "./MfaSetupClient";
import { actorMfaRequired } from "@/lib/auth/policy";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage() {
  const actor = await requireActor("/setup/mfa");

  const u = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { mfaEnabled: true, mfaSecretEncrypted: true },
  });

  // Already enrolled — show a confirmation state with a regenerate-codes
  // hint. The (authed) layout normally redirects MFA-not-required actors
  // away; this branch covers users who navigate here directly.
  if (u?.mfaEnabled) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 p-6">
        <PageHeader
          eyebrow="Account setup"
          title="Two-factor authentication"
          description="MFA is enabled for your account."
        />
        <Card>
          <CardBody>
            <div className="flex items-center gap-3">
              <Badge tone="ok" dot>
                Enabled
              </Badge>
              <p className="text-[13px] text-text2">
                To regenerate backup codes, contact a system administrator. (Self-service
                regenerate UI is on the next-session list.)
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const required = actorMfaRequired(actor);

  // Initiate enrollment server-side and pass the QR data URL into the client
  // component. The plaintext secret is intentionally surfaced once for manual
  // entry; we never expose it again.
  const { otpauthUri, secretBase32 } = await startMfaSetup();
  const qrSvg = await QRCode.toString(otpauthUri, { type: "svg", margin: 1 });

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <PageHeader
        eyebrow="Account setup"
        title="Set up two-factor authentication"
        description={
          required
            ? "Your role requires MFA before you can access the rest of the app."
            : "MFA adds a second factor to your sign-in. Recommended for everyone."
        }
      />

      {required ? (
        <AlertBanner tone="warn" title="MFA is required for your role">
          You will not be able to reach other parts of the app until enrollment is complete.
          Once enrolled, sign-in will require your password plus a 6-digit code from your
          authenticator (or a one-time backup code).
        </AlertBanner>
      ) : null}

      <Card>
        <CardHeader title="1. Scan with an authenticator app" meta="1Password · Authy · Google Authenticator" />
        <CardBody>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div
              className="rounded-md border border-line bg-white p-3"
              // QR code is server-rendered SVG — no inline JS, CSP-safe.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="text-[13px] text-text2">
              <p>
                Open your authenticator app and scan this QR code. The app will start showing a
                rotating 6-digit code for "RPD Internal Ops · {actor.email}".
              </p>
              <p className="mt-2 text-text3">
                Lost your phone later? Use a backup code (issued in step 3) or contact a
                SystemAdmin.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Or enter the secret manually" />
        <CardBody>
          <p className="mb-2 text-[13px] text-text3">
            Type this 32-character base32 secret into your authenticator if scanning isn't
            working:
          </p>
          <code className="inline-block rounded-md border border-line bg-neutral-soft px-3 py-1.5 font-mono text-[13px] tracking-[0.18em]">
            {secretBase32.match(/.{1,4}/g)?.join(" ") ?? secretBase32}
          </code>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="3. Verify the code your app shows" />
        <CardBody>
          <MfaSetupClient />
        </CardBody>
      </Card>
    </div>
  );
}
