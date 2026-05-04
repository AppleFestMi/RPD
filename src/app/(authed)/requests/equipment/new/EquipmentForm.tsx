"use client";

import { useState, useTransition } from "react";
import { createEquipmentRequest } from "../../actions";

export function EquipmentForm() {
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
          const res = await createEquipmentRequest({
            item: String(fd.get("item") ?? ""),
            category: String(fd.get("category") ?? ""),
            requestType: String(fd.get("requestType") ?? "new") as "new",
            priority: String(fd.get("priority") ?? "medium") as "medium",
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
      <Field name="item" label="Item" required maxLength={120} placeholder="Replacement holster, body armor, radio…" />
      <Field name="category" label="Category (optional)" maxLength={80} placeholder="Uniform, weapon, comms, body armor…" />

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Request type</span>
        <select
          name="requestType"
          defaultValue="new"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="new">New issue</option>
          <option value="replacement">Replacement</option>
          <option value="damaged">Damaged</option>
          <option value="lost">Lost</option>
          <option value="other">Other</option>
        </select>
      </label>

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
        <span className="block text-[12px] font-medium text-text2">Justification</span>
        <textarea
          name="justification"
          rows={4}
          maxLength={2000}
          placeholder="When the item failed, why it's needed, anything a supervisor should know."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
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
  required,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-text2">{label}</span>
      <input
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
