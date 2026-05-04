"use client";

import { useState, useTransition } from "react";
import { activateUser } from "./actions";

export function ActivateForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await activateUser({
            token,
            newPassword: String(fd.get("newPassword") ?? ""),
            confirmPassword: String(fd.get("confirmPassword") ?? ""),
            acceptBoundary: fd.get("acceptBoundary") === "on",
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign("/login?activated=1");
        });
      }}
    >
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        hint="At least 12 characters."
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
      />

      <label className="mt-1 flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn-soft/15 px-3 py-2.5 text-[12.5px] leading-snug text-white/80">
        <input
          name="acceptBoundary"
          type="checkbox"
          required
          className="mt-1 h-3.5 w-3.5 flex-none accent-warn"
        />
        <span>
          I understand this is an administrative coordination portal and will not enter CAD,
          RMS, evidence, body camera, HR/payroll, LEIN, NCIC, or any CJIS-regulated criminal
          justice information.
        </span>
      </label>

      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger-soft/20 px-3 py-2 text-[12.5px] text-danger-soft">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-md bg-accent px-3 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  name,
  type,
  required,
  autoComplete,
  minLength,
}: {
  label: string;
  hint?: string;
  name: string;
  type: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/65">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-white/10 bg-navy-ink/70 px-3 py-2 text-white outline-none transition-colors focus:border-accent"
      />
      {hint ? <span className="mt-1 block text-[11px] text-white/55">{hint}</span> : null}
    </label>
  );
}
