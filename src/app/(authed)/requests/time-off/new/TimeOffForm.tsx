"use client";

import { useState, useTransition } from "react";
import { createTimeOffRequest } from "../../actions";

export function TimeOffForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await createTimeOffRequest({
            startDate: String(fd.get("startDate") ?? ""),
            endDate: String(fd.get("endDate") ?? ""),
            type: String(fd.get("type") ?? "vacation") as "vacation",
            reason: String(fd.get("reason") ?? ""),
            coverageNeeded: fd.get("coverageNeeded") === "on",
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/requests/${res.requestId}`);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="startDate" label="Start date" type="date" required />
        <Field name="endDate" label="End date" type="date" required />
      </div>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Type</span>
        <select
          name="type"
          required
          defaultValue="vacation"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="vacation">Vacation</option>
          <option value="sick">Sick</option>
          <option value="bereavement">Bereavement</option>
          <option value="jury">Jury duty</option>
          <option value="military">Military</option>
          <option value="unpaid">Unpaid</option>
          <option value="other">Other</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Reason / notes (optional)</span>
        <textarea
          name="reason"
          rows={3}
          maxLength={1000}
          placeholder="Administrative context only — no case, victim/witness, or investigative content."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-[11px] text-text3">
          Notes are reviewed by a supervisor and stored on the request audit trail.
        </span>
      </label>

      <label className="flex items-start gap-2 text-[13px] text-text2">
        <input
          name="coverageNeeded"
          type="checkbox"
          className="mt-0.5"
        />
        <span>Coverage needed during this time off (post will go to the open-shift board)</span>
      </label>

      {error ? (
        <p className="rounded-md bg-danger-soft/60 p-2 text-[13px] text-danger">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit request"}
        </button>
        <a
          href="/requests"
          className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-text2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
