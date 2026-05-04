"use client";

import { useState, useTransition } from "react";
import { createShift, updateShift } from "./actions";

type Defaults = {
  shiftId?: string;
  date?: string;
  label?: string;
  category?: string;
  startMinute?: number;
  endMinute?: number;
  location?: string;
  requiredRole?: string;
  notes?: string;
};

const CATEGORIES = [
  ["patrol", "Patrol"],
  ["dispatch", "Dispatch"],
  ["reserve", "Reserve"],
  ["command", "Command"],
  ["sro", "SRO"],
  ["event", "Special Event"],
  ["training", "Training"],
  ["court", "Court"],
  ["admin", "Admin"],
] as const;

export function ShiftForm({
  mode,
  defaults,
}: {
  mode: "create" | "edit";
  defaults?: Defaults;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const startStr = String(fd.get("start") ?? "");
        const endStr = String(fd.get("end") ?? "");
        const startMinute = parseHHMM(startStr);
        const endMinute = parseHHMM(endStr);
        if (startMinute == null || endMinute == null) {
          setError("Please enter times as HH:MM in 24-hour format.");
          return;
        }
        // Allow simple overnight by adding 1440 if end <= start.
        const adjustedEnd = endMinute > startMinute ? endMinute : endMinute + 24 * 60;
        const input = {
          date: String(fd.get("date") ?? ""),
          label: String(fd.get("label") ?? "").trim(),
          category: String(fd.get("category") ?? "patrol") as "patrol",
          startMinute,
          endMinute: adjustedEnd,
          location: String(fd.get("location") ?? "").trim(),
          requiredRole: String(fd.get("requiredRole") ?? "").trim(),
          notes: String(fd.get("notes") ?? "").trim(),
        };
        start(async () => {
          setError(null);
          const res =
            mode === "create"
              ? await createShift(input)
              : await updateShift({ ...input, shiftId: defaults?.shiftId ?? "" });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/schedule?week=${input.date}`);
        });
      }}
    >
      <Field name="label" label="Title" required defaultValue={defaults?.label} placeholder="Patrol 2nd, Reserve detail, Range qual…" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="date" label="Date" type="date" required defaultValue={defaults?.date} />
        <label className="block">
          <span className="block text-xs text-text3">Category</span>
          <select
            name="category"
            defaultValue={defaults?.category ?? "patrol"}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {CATEGORIES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <Field
          name="start"
          label="Start (HH:MM)"
          required
          defaultValue={defaults?.startMinute != null ? minToHHMM(defaults.startMinute) : "07:00"}
        />
        <Field
          name="end"
          label="End (HH:MM)"
          required
          defaultValue={defaults?.endMinute != null ? minToHHMM(defaults.endMinute) : "17:00"}
        />
      </div>
      <Field name="location" label="Location (optional)" defaultValue={defaults?.location} placeholder="City-wide, Town Square, Range" />
      <Field name="requiredRole" label="Required role (optional)" defaultValue={defaults?.requiredRole} placeholder="officer, reserveOfficer, dispatcher" />

      <div>
        <label className="block">
          <span className="block text-xs text-text3">Administrative notes (optional)</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={1500}
            defaultValue={defaults?.notes ?? ""}
            placeholder="Reserve coverage requested, training day, special-event staffing…"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <p className="mt-1 rounded-md bg-warn-soft/40 px-2 py-1.5 text-[11.5px] text-text2">
          <strong>Do not enter</strong> CAD, RMS, case, victim/witness, LEIN/NCIC, or investigative information.
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-white font-medium hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "create" ? "Create shift" : "Save changes"}
        </button>
        <a href="/schedule" className="rounded-md border border-line bg-white px-3 py-2 text-sm hover:bg-neutral-soft">
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
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  // Explicit `| undefined` is required because the parent passes
  // `defaultValue={x ?? ""}` from possibly-undefined fields and
  // exactOptionalPropertyTypes forbids implicit undefined assignment.
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-text3">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
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

function minToHHMM(min: number): string {
  const adj = min % (24 * 60);
  const h = Math.floor(adj / 60);
  const m = adj % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
