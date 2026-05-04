"use client";

import { useState, useTransition } from "react";
import { requestSwap } from "./actions";

export function SwapNewForm({
  myShifts,
  replacements,
}: {
  myShifts: Array<{ id: string; label: string }>;
  replacements: Array<{ id: string; label: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          setOk(false);
          const r = await requestSwap({
            fromShiftId: String(fd.get("fromShiftId") ?? ""),
            toUserId: String(fd.get("toUserId") ?? ""),
            toShiftId: String(fd.get("toShiftId") ?? ""),
            reason: String(fd.get("reason") ?? ""),
          });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setOk(true);
          (e.target as HTMLFormElement).reset();
        });
      }}
    >
      <label className="block">
        <span className="block text-xs text-text3">My shift to give up</span>
        <select
          name="fromShiftId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
        >
          <option value="" disabled>Select…</option>
          {myShifts.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs text-text3">Replacement user</span>
        <select
          name="toUserId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
        >
          <option value="" disabled>Select…</option>
          {replacements.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="block text-xs text-text3">
          Reason (administrative note — no case/incident details)
        </span>
        <input
          name="reason"
          maxLength={500}
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
          placeholder="Personal conflict, training day, etc."
        />
      </label>
      <div className="sm:col-span-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Send swap request"}
        </button>
        {ok ? <span className="text-[12px] text-ok">Request sent.</span> : null}
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>
    </form>
  );
}
