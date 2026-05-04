"use client";

import { useState, useTransition } from "react";
import { createTrainingRequest } from "../../actions";

export function TrainingForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const costStr = String(fd.get("costEstimate") ?? "");
        const cost = costStr ? Math.round(Number(costStr) * 100) : undefined;
        start(async () => {
          setError(null);
          const res = await createTrainingRequest({
            courseName: String(fd.get("courseName") ?? ""),
            provider: String(fd.get("provider") ?? ""),
            location: String(fd.get("location") ?? ""),
            startDate: String(fd.get("startDate") ?? ""),
            endDate: String(fd.get("endDate") ?? ""),
            costEstimate: cost,
            travelRequired: fd.get("travelRequired") === "on",
            lodgingRequired: fd.get("lodgingRequired") === "on",
            vehicleNeeded: fd.get("vehicleNeeded") === "on",
            certificateExpected: fd.get("certificateExpected") === "on",
            justification: String(fd.get("justification") ?? ""),
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/requests/${res.requestId}`);
        });
      }}
    >
      <Field name="courseName" label="Course name" required maxLength={200} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="provider" label="Provider / host org" maxLength={120} />
        <Field name="location" label="Location" maxLength={120} placeholder="City, venue, or 'online'" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="startDate" label="Start date" type="date" />
        <Field name="endDate" label="End date" type="date" />
      </div>
      <Field name="costEstimate" label="Cost estimate (USD)" type="number" placeholder="0" />

      <fieldset className="space-y-1.5 rounded-md border border-line bg-neutral-soft/30 p-3 text-[13px]">
        <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">
          Logistics
        </legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="travelRequired" /> Travel required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="lodgingRequired" /> Lodging required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="vehicleNeeded" /> Department vehicle needed
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="certificateExpected" /> Certificate expected on completion
        </label>
      </fieldset>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Justification</span>
        <textarea
          name="justification"
          rows={4}
          maxLength={2000}
          placeholder="Why this course, why now, what you'll bring back. Administrative context only."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <p className="text-[11px] text-text3">
        Certificate / course material upload will be added once the file pipeline is in place.
        For now, attach via department email if needed.
      </p>

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
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-text2">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
