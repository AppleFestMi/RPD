"use client";

import { useState, useTransition } from "react";
import {
  disableUser,
  enableUser,
  forcePasswordReset,
  grantRole,
  resendInvitation,
  resetUserMfa,
  revokeRole,
  unlockUser,
} from "../actions";

type UserView = {
  id: string;
  email: string;
  name: string;
  rank: string | null;
  badge: string | null;
  activatedAt: string | null;
  disabledAt: string | null;
  mfaEnabled: boolean;
  forcePasswordReset: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
};

export function UserDetailClient({
  user,
  userRoleKeys,
  allRoles,
  capabilities,
  lastInvitation,
}: {
  user: UserView;
  userRoleKeys: string[];
  allRoles: Array<{ key: string; label: string }>;
  capabilities: { canManageRoles: boolean; canResetMfa: boolean; canUnlock: boolean };
  lastInvitation: { expiresAt: string; used: boolean } | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resentLink, setResentLink] = useState<string | null>(null);
  const [showMfaConfirm, setShowMfaConfirm] = useState(false);

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok && r.error) setError(r.error);
    });

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <div className="mt-6 space-y-6">
      {error ? <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}

      <Section title="Status">
        <Row label="Activated">{user.activatedAt ? new Date(user.activatedAt).toLocaleString() : "Not yet (invited)"}</Row>
        <Row label="Disabled">{user.disabledAt ? new Date(user.disabledAt).toLocaleString() : "—"}</Row>
        <Row label="MFA">{user.mfaEnabled ? "Enabled" : "Not enrolled"}</Row>
        <Row label="Force password reset">{user.forcePasswordReset ? "Yes" : "No"}</Row>
        <Row label="Last login">{user.lastLoginAt ? `${new Date(user.lastLoginAt).toLocaleString()} · ${user.lastLoginIp ?? "—"}` : "—"}</Row>
        <Row label="Failed logins (current run)">{String(user.failedLoginCount)}</Row>
        <Row label="Locked until">{user.lockedUntil ? new Date(user.lockedUntil).toLocaleString() : "—"}</Row>
      </Section>

      <Section title="Account actions">
        <div className="flex flex-wrap gap-2">
          {user.disabledAt ? (
            <button className="btn" disabled={pending} onClick={() => wrap(() => enableUser({ userId: user.id }))}>
              Enable account
            </button>
          ) : (
            <button className="btn btn-danger" disabled={pending} onClick={() => wrap(() => disableUser({ userId: user.id }))}>
              Disable account
            </button>
          )}
          <button
            className="btn"
            disabled={pending || !user.activatedAt}
            onClick={() => wrap(() => forcePasswordReset({ userId: user.id }))}
            title={!user.activatedAt ? "User has not activated yet" : ""}
          >
            Force password reset
          </button>
          {capabilities.canUnlock && isLocked ? (
            <button className="btn" disabled={pending} onClick={() => wrap(() => unlockUser({ userId: user.id }))}>
              Unlock account
            </button>
          ) : null}
        </div>
      </Section>

      {capabilities.canResetMfa ? (
        <Section title="Multi-factor authentication">
          {!showMfaConfirm ? (
            <button
              className="btn btn-danger"
              onClick={() => setShowMfaConfirm(true)}
              disabled={!user.mfaEnabled}
              title={!user.mfaEnabled ? "User has no MFA to reset" : ""}
            >
              Reset MFA
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                wrap(async () => {
                  const r = await resetUserMfa({
                    userId: user.id,
                    confirmEmail: String(fd.get("confirmEmail") ?? ""),
                  });
                  if (r.ok) setShowMfaConfirm(false);
                  return r;
                });
              }}
              className="space-y-2"
            >
              <p className="text-sm text-text2">
                This invalidates the user's TOTP secret and all backup codes, and revokes their
                active sessions. They will be required to re-enroll on next sign-in.
              </p>
              <label className="block">
                <span className="block text-xs text-text3">
                  Type <span className="font-mono">{user.email}</span> to confirm
                </span>
                <input
                  name="confirmEmail"
                  required
                  className="mt-1 w-full max-w-sm rounded-md border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-danger" disabled={pending}>
                  Confirm reset
                </button>
                <button type="button" className="btn" onClick={() => setShowMfaConfirm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Section>
      ) : null}

      {capabilities.canManageRoles ? (
        <Section title="Roles">
          <div className="space-y-2">
            {allRoles.map((r) => {
              const has = userRoleKeys.includes(r.key);
              return (
                <div key={r.key} className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-[11.5px] font-mono text-text3">{r.key}</div>
                  </div>
                  {has ? (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => wrap(() => revokeRole({ userId: user.id, roleKey: r.key }))}
                    >
                      Revoke
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      onClick={() => wrap(() => grantRole({ userId: user.id, roleKey: r.key }))}
                    >
                      Grant
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      {!user.activatedAt ? (
        <Section title="Invitation">
          <div className="space-y-2">
            <p className="text-sm">
              {lastInvitation
                ? `Last invitation expires ${new Date(lastInvitation.expiresAt).toLocaleString()}${lastInvitation.used ? " (used)" : ""}.`
                : "No invitation on file."}
            </p>
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await resendInvitation({ userId: user.id });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setResentLink(res.activationUrl);
                })
              }
            >
              Re-issue invitation
            </button>
            {resentLink ? (
              <code className="block break-all rounded bg-white p-2 font-mono text-[12px] border border-line">
                {resentLink}
              </code>
            ) : null}
          </div>
        </Section>
      ) : null}

      <style>{`
        .btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e3e7ee; background: white; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; }
        .btn:hover { background: #fafbfd; }
        .btn-sm { padding: 4px 10px; font-size: 12px; }
        .btn-danger { border-color: #b3261e; color: #b3261e; background: white; }
        .btn-danger:hover { background: #fae3e0; }
        .btn:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-text2">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5 text-sm">
      <span className="text-text3">{label}</span>
      <span className="font-mono text-[12.5px]">{children}</span>
    </div>
  );
}
