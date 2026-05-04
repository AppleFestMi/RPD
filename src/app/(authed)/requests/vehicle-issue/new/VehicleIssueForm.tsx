"use client";

import { useState, useTransition } from "react";
import { createVehicleIssueRequest } from "../../actions";

export function VehicleIssueForm({
  vehicles,
}: {
  vehicles: Array<{ id: string; label: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (vehicles.length === 0) {
    return (
      <p className="rounded-md border border-warn/30 bg-warn-soft/40 p-3 text-[13px] text-text2">
        No vehicles are on file yet. The Vehicles module needs to be seeded before issues can be
        reported here. Until then, log issues with the fleet supervisor through the existing
        process.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const mileageStr = String(fd.get("mileage") ?? "");
        const mileage = mileageStr ? Number(mileageStr) : undefined;
        start(async () => {
          setError(null);
          const res = await createVehicleIssueRequest({
            vehicleId: String(fd.get("vehicleId") ?? ""),
            mileage,
            issueType: String(fd.get("issueType") ?? ""),
            canRemainInService: fd.get("canRemainInService") === "yes",
            description: String(fd.get("description") ?? ""),
            priority: String(fd.get("priority") ?? "medium") as "medium",
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/requests/${res.requestId}`);
        });
      }}
    >
      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Vehicle / unit</span>
        <select
          name="vehicleId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="" disabled>
            Choose a unit…
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="mileage" label="Mileage (optional)" type="number" placeholder="e.g. 41204" />
        <Field name="issueType" label="Issue type" required maxLength={80} placeholder="brake noise, check engine, etc." />
      </div>

      <fieldset className="space-y-1.5 rounded-md border border-line bg-neutral-soft/30 p-3 text-[13px]">
        <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">
          Status
        </legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="canRemainInService" value="yes" defaultChecked /> Can remain in service
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="canRemainInService" value="no" /> Should be pulled now
        </label>
      </fieldset>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Priority</span>
        <select
          name="priority"
          defaultValue="medium"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Description</span>
        <textarea
          name="description"
          rows={4}
          required
          maxLength={1500}
          placeholder="What's happening, when it started, when it's worst. No incident or crash content."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <p className="text-[11px] text-text3">
        Photo upload of damage will be added once the file pipeline is in place.
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
          {pending ? "Submitting…" : "Submit issue"}
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
