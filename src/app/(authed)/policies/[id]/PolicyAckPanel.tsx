"use client";

import { useState, useTransition } from "react";
import { acknowledgePolicy } from "../actions";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function PolicyAckPanel({
  policyId,
  policyVersion,
  alreadyAcknowledged,
  acknowledgedAt,
  canAck,
}: {
  policyId: string;
  policyVersion: string;
  alreadyAcknowledged: boolean;
  acknowledgedAt: string | null;
  canAck: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyAcknowledged);
  const [doneAt, setDoneAt] = useState<string | null>(acknowledgedAt);
  const [confirmed, setConfirmed] = useState(false);

  if (done) {
    return (
      <AlertBanner tone="success" title={`You acknowledged this policy (v${policyVersion})`}>
        {doneAt ? (
          <>
            On <span className="font-mono">{new Date(doneAt).toLocaleString()}</span>.
          </>
        ) : null}
      </AlertBanner>
    );
  }

  if (!canAck) {
    return (
      <AlertBanner tone="warn" title="Acknowledgment required">
        This policy requires acknowledgment, but your role does not have the
        policies.acknowledge permission. Contact a system administrator if you believe this is
        wrong.
      </AlertBanner>
    );
  }

  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft/40 p-4">
      <h3 className="text-[14px] font-semibold tracking-tight text-text2">
        Acknowledgment required (v{policyVersion})
      </h3>
      <p className="mt-1 text-[12.5px] text-text3">
        Your acknowledgment is recorded with a timestamp, the policy version, and an audit
        log entry. Re-clicking is a no-op.
      </p>
      <label className="mt-3 flex items-start gap-2 text-[13px] text-text2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I acknowledge I have read and understand this administrative policy.
        </span>
      </label>
      <button
        type="button"
        disabled={pending || !confirmed}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await acknowledgePolicy({ policyId });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setDone(true);
            setDoneAt(new Date().toISOString());
          })
        }
        className="mt-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Recording…" : "Acknowledge"}
      </button>
      {error ? (
        <p className="mt-2 rounded-md bg-danger-soft/60 p-2 text-[12.5px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
