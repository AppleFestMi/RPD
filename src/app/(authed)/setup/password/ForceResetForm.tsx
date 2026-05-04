"use client";

import { useState, useTransition } from "react";
import { changePassword } from "./actions";

export function ForceResetForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const input = {
          currentPassword: String(fd.get("currentPassword") ?? ""),
          newPassword: String(fd.get("newPassword") ?? ""),
          confirmPassword: String(fd.get("confirmPassword") ?? ""),
        };
        start(async () => {
          setError(null);
          const res = await changePassword(input);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          window.location.assign("/dashboard");
        });
      }}
    >
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" />
      <Field label="New password" name="newPassword" type="password" autoComplete="new-password" hint="At least 12 characters." />
      <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 text-white font-medium hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-text3">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        minLength={1}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
      />
      {hint ? <p className="mt-1 text-[11px] text-text3">{hint}</p> : null}
    </label>
  );
}
