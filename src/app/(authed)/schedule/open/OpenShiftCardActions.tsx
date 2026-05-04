"use client";

import { useState, useTransition } from "react";
import {
  applyToOpenShift,
  approvePickup,
  closeOpenShift,
  denyPickup,
  withdrawApplication,
} from "./actions";

type Props =
  | { kind: "apply"; openShiftId: string }
  | { kind: "withdraw"; openShiftId: string; applicationId: string }
  | { kind: "close"; openShiftId: string }
  | { kind: "review"; applicationId: string };

export function OpenShiftCardActions(props: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState<"approve" | "deny" | null>(null);

  if (props.kind === "apply") {
    return (
      <button
        type="button"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await applyToOpenShift({ openShiftId: props.openShiftId });
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Applying…" : "Apply"}
        {error ? <span className="ml-2 text-warn-soft">⚠</span> : null}
      </button>
    );
  }

  if (props.kind === "withdraw") {
    const id = props.applicationId;
    return (
      <button
        type="button"
        disabled={pending}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-neutral-soft disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await withdrawApplication({ applicationId: id });
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "Withdraw application"}
      </button>
    );
  }

  if (props.kind === "close") {
    return (
      <button
        type="button"
        disabled={pending}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-neutral-soft disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await closeOpenShift({ openShiftId: props.openShiftId });
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "Close posting"}
      </button>
    );
  }

  // review
  if (showReview) {
    const id = props.applicationId;
    const isApprove = showReview === "approve";
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const decisionNotes = String(fd.get("decisionNotes") ?? "");
          start(async () => {
            setError(null);
            const r = isApprove
              ? await approvePickup({ applicationId: id, decisionNotes })
              : await denyPickup({ applicationId: id, decisionNotes });
            if (!r.ok) setError(r.error);
            else setShowReview(null);
          });
        }}
      >
        <input
          name="decisionNotes"
          placeholder="Optional admin note"
          className="rounded-md border border-line px-2 py-1 text-[12px]"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={pending}
          className={
            "rounded-md px-2 py-1 text-[12px] font-medium text-white disabled:opacity-60 " +
            (isApprove ? "bg-ok hover:opacity-90" : "bg-danger hover:opacity-90")
          }
        >
          {pending ? "…" : isApprove ? "Confirm approve" : "Confirm deny"}
        </button>
        <button
          type="button"
          className="rounded-md border border-line px-2 py-1 text-[12px] hover:bg-neutral-soft"
          onClick={() => setShowReview(null)}
        >
          Cancel
        </button>
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="rounded-md border border-ok px-2 py-1 text-[12px] text-ok hover:bg-ok-soft"
        onClick={() => setShowReview("approve")}
      >
        Approve
      </button>
      <button
        type="button"
        className="rounded-md border border-danger px-2 py-1 text-[12px] text-danger hover:bg-danger-soft"
        onClick={() => setShowReview("deny")}
      >
        Deny
      </button>
    </div>
  );
}
