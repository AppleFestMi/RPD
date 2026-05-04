"use client";

import { useState, useTransition } from "react";
import {
  approveRequest,
  cancelOwnRequest,
  completeRequest,
  denyRequest,
  needsMoreInfoRequest,
} from "../actions";
import type { RequestStatus } from "@/lib/requests/types";

type Mode = "approve" | "deny" | "needsInfo" | "complete" | "cancel" | null;

export function RequestActions({
  requestId,
  currentStatus,
  canApproveSupervisor,
  canApproveCommand,
  ownerCanCancel = false,
}: {
  requestId: string;
  currentStatus: RequestStatus;
  canApproveSupervisor: boolean;
  canApproveCommand: boolean;
  ownerCanCancel?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  if (mode) {
    const isCancel = mode === "cancel";
    const verb =
      mode === "approve"
        ? "Approve"
        : mode === "deny"
          ? "Deny"
          : mode === "needsInfo"
            ? "Needs more info"
            : mode === "complete"
              ? "Mark completed"
              : "Cancel";
    const tone =
      mode === "approve"
        ? "bg-ok hover:opacity-90"
        : mode === "deny" || mode === "cancel"
          ? "bg-danger hover:opacity-90"
          : "bg-pending hover:opacity-90";
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const decisionNotes = String(fd.get("decisionNotes") ?? "");
          start(async () => {
            setError(null);
            let r: { ok: boolean; error?: string };
            if (mode === "approve") {
              r = await approveRequest({
                requestId,
                decisionNotes,
                level: canApproveCommand ? "command" : "supervisor",
              });
            } else if (mode === "deny") {
              r = await denyRequest({ requestId, decisionNotes });
            } else if (mode === "needsInfo") {
              r = await needsMoreInfoRequest({ requestId, decisionNotes });
            } else if (mode === "complete") {
              r = await completeRequest({ requestId, decisionNotes });
            } else {
              r = await cancelOwnRequest({ requestId, reason: decisionNotes });
            }
            if (!r.ok && r.error) {
              setError(r.error);
              return;
            }
            setMode(null);
            window.location.reload();
          });
        }}
      >
        <textarea
          name="decisionNotes"
          rows={3}
          maxLength={isCancel ? 500 : 1500}
          placeholder={
            isCancel
              ? "Optional reason for cancellation."
              : "Optional administrative note for the requester. No case/incident content."
          }
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        {error ? (
          <p className="rounded-md bg-danger-soft/60 p-2 text-[12.5px] text-danger">{error}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60 ${tone}`}
          >
            {pending ? "…" : `Confirm ${verb.toLowerCase()}`}
          </button>
          <button
            type="button"
            className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] hover:bg-neutral-soft"
            onClick={() => setMode(null)}
          >
            Back
          </button>
        </div>
      </form>
    );
  }

  if (ownerCanCancel) {
    return (
      <button
        type="button"
        className="w-full rounded-md border border-danger bg-white px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
        onClick={() => setMode("cancel")}
      >
        Cancel this request
      </button>
    );
  }

  const decided =
    currentStatus === "approved" ||
    currentStatus === "denied" ||
    currentStatus === "cancelled";

  return (
    <div className="grid gap-2">
      {!decided ? (
        <>
          {(canApproveSupervisor || canApproveCommand) ? (
            <button
              type="button"
              className="rounded-md bg-ok px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              onClick={() => setMode("approve")}
            >
              Approve
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-pending px-3 py-2 text-sm font-medium text-pending hover:bg-pending-soft"
            onClick={() => setMode("needsInfo")}
          >
            Needs more info
          </button>
          <button
            type="button"
            className="rounded-md border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
            onClick={() => setMode("deny")}
          >
            Deny
          </button>
        </>
      ) : null}
      {currentStatus === "approved" ? (
        <button
          type="button"
          className="rounded-md border border-ok px-3 py-2 text-sm font-medium text-ok hover:bg-ok-soft"
          onClick={() => setMode("complete")}
        >
          Mark completed
        </button>
      ) : null}
    </div>
  );
}
