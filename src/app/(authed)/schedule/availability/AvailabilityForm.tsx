"use client";

import { useState, useTransition } from "react";
import { createAvailability } from "./actions";

export function AvailabilityForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-3 grid gap-2 rounded-md border border-line bg-white p-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const startStr = String(fd.get("start") ?? "");
        const endStr = String(fd.get("end") ?? "");
        const startMinute = parseHHMM(startStr);
        const endMinute = parseHHMM(endStr);
        if (startMinute == null || endMinute == null) {
          setError("Please enter times as HH:MM.");
          return;
        }
        const adjustedEnd = endMinute > startMinute ? endMinute : endMinute + 24 * 60;
        start(async () => {
          setError(null);
          const r = await createAvailability({
            date: String(fd.get("date") ?? ""),
            startMinute,
            endMinute: adjustedEnd,
            state: String(fd.get("state") ?? "available") as "available",
            notes: String(fd.get("notes") ?? ""),
            recurrenceText: String(fd.get("recurrenceText") ?? ""),
          });
          if (!r.ok) setError(r.error);
          else (e.target as HTMLFormElement).reset();
        });
      }}
    >
      <label className="block sm:col-span-2">
        <span className="block text-xs text-text3">Date</span>
        <input
          name="date"
          type="date"
          required
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-text3">Start</span>
        <input name="start" required placeholder="17:00" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent" />
      </label>
      <label className="block">
        <span className="block text-xs text-text3">End</span>
        <input name="end" required placeholder="03:00" className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent" />
      </label>
      <label className="block">
        <span className="block text-xs text-text3">State</span>
        <select
          name="state"
          defaultValue="available"
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm"
        >
          <option value="available">Available</option>
          <option value="preferred">Preferred</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <label className="block sm:col-span-3">
        <span className="block text-xs text-text3">Notes (optional)</span>
        <input
          name="notes"
          maxLength={500}
          placeholder="Reserve coverage requested, training day…"
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="block sm:col-span-3">
        <span className="block text-xs text-text3">Recurrence (optional, free text)</span>
        <input
          name="recurrenceText"
          maxLength={120}
          placeholder="every Friday"
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>
      {error ? <p className="sm:col-span-6 text-sm text-danger">{error}</p> : null}
    </form>
  );
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}
