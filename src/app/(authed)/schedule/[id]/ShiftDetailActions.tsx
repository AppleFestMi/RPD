"use client";

import { useState, useTransition } from "react";
import { archiveShift, assignUserToShift, unassignFromShift } from "../actions";

type Props =
  | { kind: "unassign"; assignmentId: string }
  | { kind: "archive"; shiftId: string }
  | { kind: "assign"; shiftId: string; users: Array<{ id: string; label: string }> };

export function ShiftDetailActions(props: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (props.kind === "unassign") {
    return (
      <button
        disabled={pending}
        className="text-[12px] text-danger hover:underline disabled:opacity-60"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await unassignFromShift({ assignmentId: props.assignmentId });
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "Remove"}
      </button>
    );
  }

  if (props.kind === "archive") {
    return (
      <div className="space-y-2">
        {!confirmArchive ? (
          <button
            type="button"
            className="rounded-md border border-danger bg-white px-3 py-2 text-sm text-danger hover:bg-danger-soft"
            onClick={() => setConfirmArchive(true)}
          >
            Archive shift
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await archiveShift({ shiftId: props.shiftId });
                  if (!r.ok) {
                    setError(r.error);
                    setConfirmArchive(false);
                    return;
                  }
                  window.location.assign("/schedule");
                })
              }
            >
              Confirm archive
            </button>
            <button
              type="button"
              className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft"
              onClick={() => setConfirmArchive(false)}
            >
              Cancel
            </button>
          </div>
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  // assign
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const userId = String(fd.get("userId") ?? "");
        if (!userId) return;
        start(async () => {
          setError(null);
          setWarnings([]);
          const r = await assignUserToShift({
            shiftId: props.shiftId,
            userId,
            assignmentRole: String(fd.get("assignmentRole") ?? ""),
          });
          if (!r.ok) setError(r.error);
          else setWarnings(r.warnings);
        });
      }}
    >
      <label className="block flex-1 min-w-[200px]">
        <span className="block text-xs text-text3">Assign user</span>
        <select
          name="userId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="" disabled>Select…</option>
          {props.users.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </label>
      <label className="block w-40">
        <span className="block text-xs text-text3">Sub-role</span>
        <input
          name="assignmentRole"
          placeholder="lead, trainee…"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Assigning…" : "Assign"}
      </button>
      {error ? <p className="basis-full text-sm text-danger">{error}</p> : null}
      {warnings.length > 0 ? (
        <ul className="basis-full rounded-md bg-warn-soft/40 p-2 text-[12px] text-warn">
          {warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
