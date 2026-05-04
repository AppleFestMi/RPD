"use client";

import { useState, useTransition } from "react";
import { createHelpRequest } from "../../actions";

export function HelpForm() {
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
          const res = await createHelpRequest({
            category: String(fd.get("category") ?? "it") as "it",
            priority: String(fd.get("priority") ?? "medium") as "medium",
            description: String(fd.get("description") ?? ""),
            location: String(fd.get("location") ?? ""),
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
        <span className="block text-[12px] font-medium text-text2">Category</span>
        <select
          name="category"
          defaultValue="it"
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="it">IT</option>
          <option value="radio">Radio / MDC</option>
          <option value="facilities">Building / facilities</option>
          <option value="softwareAccess">Software access</option>
          <option value="supplies">Supplies</option>
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

      <Field name="location" label="Location (optional)" placeholder="Comm Center, Patrol bay, briefing room…" />

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Description</span>
        <textarea
          name="description"
          rows={5}
          required
          maxLength={2000}
          placeholder="What's broken or needed. No incident or case content."
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
  placeholder,
}: {
  name: string;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-text2">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
