"use client";

import { useState, useTransition } from "react";
import { createPolicy } from "../actions";
import { POLICY_CATEGORIES } from "@/lib/policies/types";

export function NewPolicyForm({ canPublishNow }: { canPublishNow: boolean }) {
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
          const res = await createPolicy(fd);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign(`/policies/${res.policyId}`);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="number" label="Policy number" required maxLength={20} placeholder="3.04" />
        <Field name="version" label="Version" required maxLength={20} placeholder="v6.1" />
        <label className="block">
          <span className="block text-[12px] font-medium text-text2">Category</span>
          <select
            name="category"
            defaultValue="General Orders"
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {POLICY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field name="title" label="Title" required maxLength={200} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="effectiveDate" label="Effective date" type="date" required />
        <Field name="reviewDate" label="Next review date (optional)" type="date" />
      </div>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Summary / change notes</span>
        <textarea
          name="summary"
          rows={4}
          maxLength={2000}
          placeholder="What changed in this version, in plain administrative terms. The full document is in the attached file."
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-[11px] text-text3">
          The summary is the only free-text users see before they download the policy. Keep it
          short and policy-focused.
        </span>
      </label>

      <label className="block">
        <span className="block text-[12px] font-medium text-text2">Policy document</span>
        <input
          name="file"
          type="file"
          required
          accept=".pdf,application/pdf,.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-white hover:file:bg-navy-800"
        />
        <span className="mt-1 block text-[11px] text-text3">
          PDF, DOC, or DOCX. 10 MB max. Files are stored on the server with a random key —
          downloads go through an authenticated route.
        </span>
      </label>

      <fieldset className="space-y-1.5 rounded-md border border-line bg-neutral-soft/30 p-3 text-[13px]">
        <legend className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text3">
          Options
        </legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requiresAcknowledgment" defaultChecked /> Require per-user
          acknowledgment
        </label>
        {canPublishNow ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="publishNow" /> Publish immediately (otherwise saved as
            draft)
          </label>
        ) : (
          <p className="text-[11.5px] text-text3">
            Saved as a draft. A publisher must promote it to publish.
          </p>
        )}
      </fieldset>

      {error ? (
        <p className="rounded-md bg-danger-soft/60 p-2 text-[13px] text-danger">{error}</p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Save policy"}
        </button>
        <a
          href="/policies"
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
