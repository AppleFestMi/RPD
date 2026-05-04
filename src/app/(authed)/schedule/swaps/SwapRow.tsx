"use client";

import { useState, useTransition } from "react";
import {
  acceptAsReplacement,
  approveSwap,
  cancelSwap,
  declineAsReplacement,
  denySwap,
} from "./actions";
import { appDecisionTone, StatusChip } from "@/components/schedule/StatusChip";

export function SwapRow({
  row,
  viewer,
  inline = false,
}: {
  row: { id: string; status: string; reason: string | null; fromUser: string; toUser: string };
  viewer: "requester" | "replacement" | "supervisor";
  inline?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok && r.error) setError(r.error);
    });

  if (inline) {
    if (viewer === "requester" && !["approved", "denied", "cancelled"].includes(row.status)) {
      return (
        <button
          disabled={pending}
          className="text-[12px] text-text3 hover:underline disabled:opacity-60"
          onClick={() => wrap(() => cancelSwap({ swapId: row.id }))}
        >
          {pending ? "…" : "Cancel"}
        </button>
      );
    }
    return null;
  }

  return (
    <li className="rounded-md border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div>
            <span className="font-medium">{row.fromUser}</span> → <span className="font-medium">{row.toUser}</span>
          </div>
          {row.reason ? <div className="text-[12px] text-text3">{row.reason}</div> : null}
        </div>
        <StatusChip label={row.status} tone={appDecisionTone(row.status)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {viewer === "replacement" && row.status === "submitted" ? (
          <>
            <button
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-ink disabled:opacity-60"
              onClick={() => wrap(() => acceptAsReplacement({ swapId: row.id }))}
            >
              Accept
            </button>
            <button
              disabled={pending}
              className="rounded-md border border-danger px-3 py-1 text-[12.5px] text-danger hover:bg-danger-soft disabled:opacity-60"
              onClick={() => wrap(() => declineAsReplacement({ swapId: row.id }))}
            >
              Decline
            </button>
          </>
        ) : null}

        {viewer === "supervisor" && row.status !== "approved" && row.status !== "denied" ? (
          <SupervisorActions
            swapId={row.id}
            onError={setError}
            onPending={(p) => p}
          />
        ) : null}
      </div>

      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </li>
  );
}

function SupervisorActions({
  swapId,
  onError,
}: {
  swapId: string;
  onError: (e: string | null) => void;
  onPending: (p: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [showApprove, setShowApprove] = useState(false);
  const [showDeny, setShowDeny] = useState(false);

  if (showApprove || showDeny) {
    const isApprove = showApprove;
    return (
      <form
        className="flex w-full flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const reason = String(fd.get("reason") ?? "");
          start(async () => {
            onError(null);
            const r = isApprove
              ? await approveSwap({ swapId, reason })
              : await denySwap({ swapId, reason });
            if (!r.ok) onError(r.error ?? "Action failed.");
            else {
              setShowApprove(false);
              setShowDeny(false);
            }
          });
        }}
      >
        <input
          name="reason"
          maxLength={500}
          placeholder="Optional administrative note"
          className="flex-1 rounded-md border border-line px-2 py-1 text-[12px]"
        />
        <button
          type="submit"
          disabled={pending}
          className={
            "rounded-md px-3 py-1 text-[12.5px] font-medium text-white disabled:opacity-60 " +
            (isApprove ? "bg-ok hover:opacity-90" : "bg-danger hover:opacity-90")
          }
        >
          {pending ? "…" : isApprove ? "Confirm approve" : "Confirm deny"}
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1 text-[12.5px] hover:bg-neutral-soft"
          onClick={() => {
            setShowApprove(false);
            setShowDeny(false);
          }}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        className="rounded-md border border-ok px-3 py-1 text-[12.5px] text-ok hover:bg-ok-soft"
        onClick={() => setShowApprove(true)}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded-md border border-danger px-3 py-1 text-[12.5px] text-danger hover:bg-danger-soft"
        onClick={() => setShowDeny(true)}
      >
        Deny
      </button>
    </>
  );
}
