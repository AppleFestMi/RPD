"use client";

import { useState, useTransition } from "react";
import { activateUser } from "./actions";

export function ActivateForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-5 space-y-3"
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
      <label className="block">
        <span className="block text-xs text-text3">New password</span>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
        />
        <p className="mt-1 text-[11px] text-text3">At least 12 characters.</p>
      </label>
      <label className="block">
        <span className="block text-xs text-text3">Confirm new password</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="flex items-start gap-2 pt-2 text-[12px] text-text2">
        <input name="acceptBoundary" type="checkbox" required className="mt-0.5" />
        <span>
          I understand this is an administrative coordination portal and will not enter
          CAD, RMS, evidence, body camera, HR/payroll, LEIN, NCIC, or any
          CJIS-regulated criminal justice information.
        </span>
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 text-white font-medium hover:bg-accent-ink disabled:opacity-60"
      >
        {pending ? "Activating…" : "Activate account"}
      </button>
    </form>
  );
}
