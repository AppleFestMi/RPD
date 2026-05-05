"use client";

import { useState, useTransition } from "react";
import { acknowledgeAnnouncement } from "../actions";
import { AlertBanner } from "@/components/ui/AlertBanner";

export function AcknowledgePanel({
  announcementId,
  alreadyAcknowledged,
  acknowledgedAt,
  canAck,
}: {
  announcementId: string;
  alreadyAcknowledged: boolean;
  acknowledgedAt: string | null;
  canAck: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyAcknowledged);
  const [doneAt, setDoneAt] = useState<string | null>(acknowledgedAt);

  if (done) {
    return (
      <AlertBanner
        tone="success"
        title="You acknowledged this announcement"
      >
        {doneAt ? (
          <>
            On{" "}
            <span className="font-mono">
              {new Date(doneAt).toLocaleString()}
            </span>
            .
          </>
        ) : null}
      </AlertBanner>
    );
  }

  if (!canAck) {
    return (
      <AlertBanner tone="warn" title="Acknowledgment required">
        This announcement requires acknowledgment, but your role does not have the
        announcements.acknowledge permission. Contact a system administrator if you believe this
        is wrong.
      </AlertBanner>
    );
  }

  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-text2">
            Acknowledgment required
          </h3>
          <p className="mt-1 text-[12.5px] text-text3">
            Your acknowledgment is recorded with a timestamp and audit log. Re-clicking the
            button is a no-op.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acknowledgeAnnouncement({ announcementId });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setDone(true);
              setDoneAt(new Date().toISOString());
            })
          }
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Recording…" : "Acknowledge"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 rounded-md bg-danger-soft/60 p-2 text-[12.5px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}
